/**
 * Merges the API dumped from the running game (`script_help2` / `cl_script_help2`,
 * see vconsole.ts) on top of @moddota/dota-data.
 *
 * dota-data stays the source of rich types (entity classes, enums as param types,
 * nullability, inheritance). The game dump is the source of truth for *what exists*:
 *   - functions/methods missing in dota-data are added with the dumped signature;
 *   - parameters the game has but dota-data lacks are appended;
 *   - empty descriptions are filled from the game;
 *   - enum values are taken from the game, missing members/enums are added.
 * Nothing is removed: dota-data also documents Lua callbacks and helper types that
 * the engine dump does not list.
 */
import ddApi from '@moddota/dota-data/files/vscripts/api';
import ddEnums from '@moddota/dota-data/files/vscripts/enums';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type Api = typeof ddApi;
type ApiDeclaration = Api[number];
type ClassDeclaration = Extract<ApiDeclaration, { kind: 'class' }>;
type FunctionDeclaration = Extract<ApiDeclaration, { kind: 'function' }>;
type Enums = typeof ddEnums;
type EnumDeclaration = Extract<Enums[number], { kind: 'enum' }>;
type Availability = 'server' | 'client' | 'both';

const GAME_DUMP_DIR = join(__dirname, 'game');

interface GameParam {
    name: string;
    type: string;
}
interface GameFunction {
    className?: string;
    name: string;
    description: string;
    returns: string;
    params: GameParam[];
}
interface GameEnumMember {
    value: number;
    description?: string;
}
interface GameDump {
    functions: Map<string, GameFunction>;
    enums: Map<string, Map<string, GameEnumMember>>;
}

export function parseScriptHelp(text: string): GameDump {
    const functions = new Map<string, GameFunction>();
    const enums = new Map<string, Map<string, GameEnumMember>>();
    const lines = text.split(/\r?\n/);

    let description = '';
    let returns = 'void';
    let params: GameParam[] = [];
    let currentEnum: Map<string, GameEnumMember> | undefined;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m: RegExpMatchArray | null;

        // `---[[ Name  description ]]`, the description may span several lines
        if ((m = line.match(/^---\[\[ (\S+)\s?(.*)$/))) {
            let body = m[2];
            while (!body.trimEnd().endsWith(']]') && i + 1 < lines.length) {
                body += '\n' + lines[++i];
            }
            description = body.trimEnd().replace(/\]\]$/, '').trim();
            returns = 'void';
            params = [];
            currentEnum = undefined;
        } else if ((m = line.match(/^-- @return (.+)$/))) {
            returns = m[1].trim();
        } else if ((m = line.match(/^-- @param (\S+) (.+)$/))) {
            params.push({ name: m[1], type: m[2].trim() });
        } else if ((m = line.match(/^function (?:(\w+):)?(\w+)\(/))) {
            const key = (m[1] ? m[1] + ':' : '') + m[2];
            functions.set(key, { className: m[1], name: m[2], description, returns, params });
            description = '';
            params = [];
        } else if ((m = line.match(/^--- Enum (\w+)/))) {
            currentEnum = new Map();
            enums.set(m[1], currentEnum);
        } else if (currentEnum && (m = line.match(/^(\w+) = (-?\d+)(?: -- (.*))?$/))) {
            currentEnum.set(m[1], { value: Number(m[2]), description: m[3]?.trim() || undefined });
        } else if (line.trim() === '') {
            currentEnum = undefined;
        }
    }
    return { functions, enums };
}

/** Engine type names -> names used by dota-data / the generated annotations */
const TYPE_MAP: Record<string, string> = {
    void: 'nil',
    '<unknown>': 'any',
    unsigned: 'uint',
    uint64: 'Uint64',
    utlstringtoken: 'string',
};
function mapType(type: string): string {
    return TYPE_MAP[type] ?? type;
}

/** Global functions are dumped as `int_1`, `<unknown>_2`, ... */
function paramName(param: GameParam, index: number): string {
    const generic = param.name.match(/^(.+)_\d+$/);
    if (generic && generic[1] === param.type) {
        return `arg${index + 1}`;
    }
    return param.name;
}

function loadDump(file: string): GameDump | undefined {
    const path = join(GAME_DUMP_DIR, file);
    return existsSync(path) ? parseScriptHelp(readFileSync(path, 'utf8')) : undefined;
}

export interface MergeReport {
    source: string;
    addedFunctions: string[];
    extendedParams: string[];
    filledDescriptions: number;
    addedEnums: string[];
    addedEnumMembers: string[];
    changedEnumValues: string[];
}

function merge() {
    const api: Api = structuredClone(ddApi);
    const enums: Enums = structuredClone(ddEnums);
    const report: MergeReport = {
        source: '@moddota/dota-data only (no dump/game/*.txt found)',
        addedFunctions: [],
        extendedParams: [],
        filledDescriptions: 0,
        addedEnums: [],
        addedEnumMembers: [],
        changedEnumValues: [],
    };

    const server = loadDump('server.txt');
    const client = loadDump('client.txt');
    if (!server && !client) {
        return { api, enums, report };
    }
    report.source = '@moddota/dota-data + game dump (dump/game)';

    // ---- functions -------------------------------------------------------
    const classes = new Map<string, ClassDeclaration>();
    const clientToServer = new Map<string, string>();
    const globals = new Map<string, FunctionDeclaration>();
    for (const decl of api) {
        if (decl.kind === 'class') {
            classes.set(decl.name, decl);
            if (decl.clientName) clientToServer.set(decl.clientName, decl.name);
        } else {
            globals.set(decl.name, decl);
        }
    }

    // key -> { function, availability }
    const game = new Map<string, { fn: GameFunction; server: boolean; client: boolean }>();
    const collect = (dump: GameDump | undefined, side: 'server' | 'client') => {
        for (const fn of dump?.functions.values() ?? []) {
            const className = fn.className && (clientToServer.get(fn.className) ?? fn.className);
            const key = (className ? className + ':' : '') + fn.name;
            const entry = game.get(key) ?? { fn: { ...fn, className }, server: false, client: false };
            entry[side] = true;
            // the server dump is usually the more complete one
            if (side === 'server' || fn.params.length > entry.fn.params.length) {
                entry.fn = { ...fn, className };
            }
            game.set(key, entry);
        }
    };
    collect(server, 'server');
    collect(client, 'client');

    for (const [key, { fn, server: onServer, client: onClient }] of game) {
        const available: Availability = onServer && onClient ? 'both' : onServer ? 'server' : 'client';
        let target: FunctionDeclaration | undefined;
        let cls: ClassDeclaration | undefined;
        if (fn.className) {
            cls = classes.get(fn.className);
            if (!cls) {
                cls = { kind: 'class', name: fn.className, members: [] };
                classes.set(cls.name, cls);
                api.push(cls);
            }
            target = cls.members.find(
                (m): m is FunctionDeclaration => m.kind === 'function' && m.name === fn.name
            );
        } else {
            target = globals.get(fn.name);
        }

        if (!target) {
            const decl: FunctionDeclaration = {
                kind: 'function',
                name: fn.name,
                available,
                description: fn.description || undefined,
                returns: [mapType(fn.returns)],
                args: fn.params.map((p, i) => ({ name: paramName(p, i), types: [mapType(p.type)] })),
            };
            if (cls) cls.members.push(decl);
            else api.push(decl);
            report.addedFunctions.push(key);
            continue;
        }

        if (fn.params.length > target.args.length) {
            const extra = fn.params.slice(target.args.length);
            target.args.push(
                ...extra.map((p, i) => ({
                    name: paramName(p, target!.args.length + i),
                    // existing code calls the function without it, keep it optional
                    types: [mapType(p.type), 'nil'],
                }))
            );
            report.extendedParams.push(`${key}(+${extra.map((p) => p.name).join(', ')})`);
        }
        if (!target.description && fn.description) {
            target.description = fn.description;
            report.filledDescriptions++;
        }
    }

    // ---- enums -----------------------------------------------------------
    const enumByName = new Map<string, EnumDeclaration>();
    const memberOwner = new Map<string, EnumDeclaration>();
    const constants = new Set<string>();
    for (const e of enums) {
        if (e.kind === 'enum') {
            enumByName.set(e.name, e);
            for (const m of e.members) memberOwner.set(m.name, e);
        } else {
            constants.add(e.name);
        }
    }
    for (const [dump, side] of [
        [server, 'server'],
        [client, 'client'],
    ] as const) {
        for (const [enumName, members] of dump?.enums ?? []) {
            // dota-data sometimes uses its own enum names (e.g. DotaPseudoRandomType -> PseudoRandom)
            let decl =
                enumByName.get(enumName) ??
                [...members.keys()].map((n) => memberOwner.get(n)).find((e) => e !== undefined);
            if (decl && !enumByName.has(enumName)) enumByName.set(enumName, decl);
            if (!decl) {
                decl = { kind: 'enum', name: enumName, available: 'both', members: [] };
                if (side === 'server' && !client?.enums.has(enumName)) decl.available = 'server';
                enumByName.set(enumName, decl);
                enums.push(decl);
                report.addedEnums.push(enumName);
            }
            for (const [name, { value, description }] of members) {
                if (constants.has(name)) continue;
                const owner = memberOwner.get(name);
                const member = owner?.members.find((m) => m.name === name);
                if (member) {
                    if (member.value !== value) {
                        report.changedEnumValues.push(`${name}: ${member.value} -> ${value}`);
                        member.value = value;
                    }
                    if (!member.description && description) member.description = description;
                } else {
                    decl.members.push({ name, value, description });
                    memberOwner.set(name, decl);
                    report.addedEnumMembers.push(`${enumName}.${name}`);
                }
            }
        }
    }
    return { api, enums, report };
}

const merged = merge();
export const api = merged.api;
export const enums = merged.enums;
export const mergeReport = merged.report;

export function printMergeReport(r: MergeReport = mergeReport) {
    const list = (title: string, items: string[]) => {
        console.log(`  ${title}: ${items.length}`);
        for (const item of items) console.log(`    ${item}`);
    };
    console.log(`API source: ${r.source}`);
    list('added functions', r.addedFunctions);
    list('extended parameters', r.extendedParams);
    console.log(`  filled descriptions: ${r.filledDescriptions}`);
    list('added enums', r.addedEnums);
    list('added enum members', r.addedEnumMembers);
    console.log(`  changed enum values: ${r.changedEnumValues.length}`);
}

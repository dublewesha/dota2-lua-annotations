/**
 * Fetches the VScript API dump straight from a running Dota 2 instance.
 *
 * Dota 2 (and Workshop Tools) listens for VConsole2 on TCP 127.0.0.1:29000.
 * Every packet has a 12-byte header:
 *   char[4] type | uint16 version | uint32 length (incl. header) | uint16 handle
 * We send `CMND` packets and collect the text of `PRNT` packets.
 *
 * Usage: pnpm fetch-api
 *   - a map / addon must be loaded so the VScript VMs exist;
 *   - VConsole2 must be closed: the game serves only one console client at a time.
 */
import { Socket, connect } from 'net';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const HOST = '127.0.0.1';
const PORT = Number(process.env.VCONSOLE_PORT || 29000);
const PROTOCOL_VERSION = 0x00d4;
/** PRNT body: 28 bytes of channel/colour/timestamp data, then NUL-terminated text */
const PRNT_TEXT_OFFSET = 28;
/** Stop collecting after this much silence once output has started */
const IDLE_MS = 4000;
/** Hard limit for a single command */
const TIMEOUT_MS = 120000;

export const GAME_DUMP_DIR = join(__dirname, 'game');

const COMMANDS: { command: string; file: string }[] = [
    { command: 'script_help2', file: 'server.txt' },
    { command: 'cl_script_help2', file: 'client.txt' },
];

class VConsole {
    private buffer = Buffer.alloc(0);
    private listener?: (type: string, body: Buffer) => void;

    private constructor(private socket: Socket) {
        socket.on('data', (chunk: Buffer) => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.drain();
        });
    }

    static open(): Promise<VConsole> {
        return new Promise((resolve, reject) => {
            const socket = connect({ host: HOST, port: PORT });
            socket.once('connect', () => resolve(new VConsole(socket)));
            socket.once('error', reject);
        });
    }

    private drain() {
        while (this.buffer.length >= 12) {
            const length = this.buffer.readUInt32BE(6);
            if (length < 12) {
                throw new Error(`Corrupted VConsole stream (packet length ${length})`);
            }
            if (this.buffer.length < length) {
                return;
            }
            const type = this.buffer.toString('latin1', 0, 4);
            const body = this.buffer.subarray(12, length);
            this.buffer = this.buffer.subarray(length);
            this.listener?.(type, body);
        }
    }

    /** Waits until the initial backlog (cvar list, history, ...) stops arriving */
    async settle(ms = 1500) {
        let last = Date.now();
        this.listener = () => (last = Date.now());
        while (Date.now() - last < ms) {
            await sleep(100);
        }
        this.listener = undefined;
    }

    async run(command: string): Promise<string> {
        const lines: string[] = [];
        let last = 0;
        this.listener = (type, body) => {
            if (type !== 'PRNT') return;
            const end = body.indexOf(0, PRNT_TEXT_OFFSET);
            lines.push(body.toString('utf8', PRNT_TEXT_OFFSET, end < 0 ? body.length : end));
            last = Date.now();
        };

        const payload = Buffer.from(command + '\0', 'utf8');
        const header = Buffer.alloc(12);
        header.write('CMND', 0, 'latin1');
        header.writeUInt16BE(PROTOCOL_VERSION, 4);
        header.writeUInt32BE(12 + payload.length, 6);
        header.writeUInt16BE(0, 10);
        this.socket.write(Buffer.concat([header, payload]));

        const started = Date.now();
        while (Date.now() - started < TIMEOUT_MS) {
            await sleep(100);
            if (last && Date.now() - last > IDLE_MS) break;
        }
        this.listener = undefined;
        return lines.join('');
    }

    close() {
        this.socket.destroy();
    }
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

export async function fetchGameApi() {
    let console_: VConsole;
    try {
        console_ = await VConsole.open();
    } catch (e) {
        throw new Error(
            `Cannot connect to Dota 2 VConsole at ${HOST}:${PORT}. ` +
                'Start Dota 2 / Workshop Tools and load a map first.'
        );
    }
    try {
        await console_.settle();
        await mkdir(GAME_DUMP_DIR, { recursive: true });
        for (const { command, file } of COMMANDS) {
            const text = await console_.run(command);
            const functions = (text.match(/^function /gm) || []).length;
            if (functions === 0) {
                throw new Error(
                    `"${command}" returned no output. Load a map so the VScript VM is running, ` +
                        'and close VConsole2: the game serves only one console client at a time.'
                );
            }
            await writeFile(join(GAME_DUMP_DIR, file), text, 'utf8');
            console.log(`${command}: ${functions} functions -> dump/game/${file}`);
        }
    } finally {
        console_.close();
    }
}

if (require.main === module) {
    fetchGameApi().catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    });
}

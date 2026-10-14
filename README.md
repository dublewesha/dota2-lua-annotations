> [!NOTE]  
> Since I no longer use the `sumneko.lua` plugin and no longer maintain this repository.

# Dota2 Lua Annotations

Dota2 lua api annotations for [lua-language-server](https://github.com/LuaLS/lua-language-server).

API is exported from [ModDota/dota-data](https://github.com/ModDota/dota-data).

## Installation (Windows)

This fork is not published to the Marketplace. Build and install it locally with the
bundled script, which also pulls the latest Dota 2 API data:

1. Install [Node.js](https://nodejs.org/) and [VS Code](https://code.visualstudio.com/)
   (make sure the `code` command is available in `PATH`).
2. **Close all VS Code windows** (a running VS Code locks the extension folder and the install step fails).
3. Run `update-all.bat` from the repository root (double-click or from a terminal):

```bat
update-all.bat
```

The script will:

-   install `pnpm` if it is missing (user-level, no admin rights needed);
-   update dependencies, including `@moddota/dota-data` with the current API dump;
-   fetch the current API straight from the running game (optional, see below);
-   regenerate the Lua annotations in `Dota2-Library/gen`;
-   compile and package the extension into `dota2-lua-annotations-latest.vsix`;
-   install `sumneko.lua` and the packaged extension into VS Code.

Re-run the script whenever you want to refresh the annotations after a Dota 2 update.

### API from the game

`@moddota/dota-data` is updated rarely, so new functions and parameters appear in the
game long before they get there. The script can take them straight from your Dota 2:

1. Start Dota 2 or Workshop Tools and **load a map** (for example, your addon).
2. **Close VConsole2**: the game serves only one console client at a time.
3. Run `update-all.bat` (or `pnpm fetch-api`).

The script connects to the game console (`127.0.0.1:29000`), runs `script_help2` and
`cl_script_help2` and saves the output to `dump/game`. During generation this dump is
merged over dota-data: missing functions and parameters are added, empty descriptions
are filled, enum values are taken from the game. Types still come from dota-data.
If the game is not running, the last saved dump from `dump/game` is used.

> NOTE: This extension is force `Lua.runtime.version` to `LuaJIT`,
> recommend using `VSCode Profiles`.

## Custom Types

-   Ability or Item DataDriven

```lua
---@param ctx AbilityContext|{max_damage:number}
function OnCastAbility(ctx)
    local caster = ctx.caster;
    local maxDamage = ctx.max_damage;
end
```

## Snippets

-   oncast
-   oncast_target
-   classmodifier or classbuf
-   classability
-   classitem

# Developer

```
pnpm install
pnpm fetch-api # save script_help2 output from the running game to dump/game
pnpm dump      # regenerate Dota2-Library/gen
pnpm compile   # build src -> out
pnpm exec vsce package --out dota2-lua-annotations-latest.vsix
```

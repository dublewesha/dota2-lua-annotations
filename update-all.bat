@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "VSIX_FILE=dota2-lua-annotations-latest.vsix"
set "PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true"

echo.
echo === Dota2 Lua Annotations: update, build and install ===
echo Project: %CD%
echo.

call :require node "Node.js is not installed or is not available in PATH."

where pnpm >nul 2>nul
if errorlevel 1 (
    echo pnpm was not found. Trying to enable it through Corepack...
    where corepack >nul 2>nul
    if errorlevel 1 (
        echo ERROR: pnpm is not installed and Corepack is not available.
        echo Install pnpm manually: npm install -g pnpm
        exit /b 1
    )
    call corepack enable || exit /b 1
    call corepack prepare pnpm@latest --activate || exit /b 1
)

call :require pnpm "pnpm is not installed or is not available in PATH."

where code >nul 2>nul
if errorlevel 1 (
    echo ERROR: VS Code CLI "code" is not available in PATH.
    echo In VS Code, run "Shell Command: Install 'code' command in PATH" or enable it during installation.
    exit /b 1
)

echo.
echo [1/6] Installing dependencies...
call pnpm install || exit /b 1

echo.
echo [2/6] Updating dependencies to latest versions...
call pnpm update --latest || exit /b 1

echo.
echo [3/6] Regenerating Dota 2 Lua annotations...
call pnpm dump || exit /b 1

echo.
echo [4/6] Compiling extension...
call pnpm compile || exit /b 1

echo.
echo [5/6] Packaging VS Code extension...
if exist "%VSIX_FILE%" del /f /q "%VSIX_FILE%"
call pnpm exec vsce package --out "%VSIX_FILE%" || exit /b 1

echo.
echo [6/6] Installing extensions in VS Code...
call code --install-extension sumneko.lua || exit /b 1
call code --install-extension "%CD%\%VSIX_FILE%" --force || exit /b 1

echo.
echo Done.
echo Installed: %CD%\%VSIX_FILE%
exit /b 0

:require
where %~1 >nul 2>nul
if errorlevel 1 (
    echo ERROR: %~2
    exit /b 1
)
exit /b 0

@echo off
REM G-Orchestra v2 — Mission Control launcher (Tauri shell + studio + engine sidecar)
REM Double-click or run from any cwd.

setlocal
cd /d "%~dp0"

echo.
echo === G-Orchestra v2 dev launcher ===
echo.

REM 1) prerequisite check
where pnpm >nul 2>nul || (echo [ERROR] pnpm not found. Install: npm install -g pnpm & pause & exit /b 1)
where cargo >nul 2>nul || (echo [ERROR] cargo not found. Install Rust: https://rustup.rs/ & pause & exit /b 1)
where node >nul 2>nul || (echo [ERROR] node not found. Install Node.js LTS from https://nodejs.org/ & pause & exit /b 1)

REM 2) install orchestration deps (tauri CLI) if missing
if not exist "node_modules\.bin\tauri.cmd" (
  echo Installing orchestration deps ^(first run, ~30s^)...
  call pnpm install || (echo [ERROR] pnpm install failed & pause & exit /b 1)
)

REM 3) install studio deps (react/vite/@xyflow/react) if missing
if not exist "studio\node_modules\@vitejs" (
  echo Installing studio deps ^(first run, ~30s^)...
  call pnpm -C studio install || (echo [ERROR] pnpm -C studio install failed & pause & exit /b 1)
)

echo.
echo Launching G-Orchestra ^(first cargo build ~5-15 min; subsequent ^<10s^)...
echo Vite:   http://localhost:5599
echo Engine: http://localhost:4577
echo.

REM 4) run — Tauri spawns vite (studio) + the engine sidecar from src-tauri/src/main.rs
call pnpm tauri dev

endlocal

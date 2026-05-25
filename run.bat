@echo off
REM ── Sonic Marketing CRM launcher ────────────────────────────────
REM Opens the backend (FastAPI) and frontend (Vite) in two windows.
cd /d "%~dp0"

echo Starting backend on http://127.0.0.1:8000 ...
start "Sonic Backend"  cmd /k python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

echo Starting frontend (Vite) ...
start "Sonic Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Backend:  http://127.0.0.1:8000
echo Frontend: see the URL printed in the "Sonic Frontend" window (usually http://localhost:5173)
echo Login:    Yaso / Yaso@123
echo.
echo Close those two windows (or press Ctrl+C in each) to stop the servers.
pause

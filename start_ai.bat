@echo off
title G-TEC AI Server
cd /d "%~dp0"

REM --- Lightweight defaults: the ~1 MB TF-IDF model is fetched from the
REM --- Hugging Face Hub, so no PyTorch and no 255 MB local model is needed.
if not defined MODEL_BACKEND set "MODEL_BACKEND=lite"
if not defined MODEL_ID      set "MODEL_ID=GtecBuddy/gtec-intent-model"

REM --- If the AI server is already listening on 5001, do not start a second one.
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',5001); $c.Close(); exit 0 } catch { exit 1 }"
if %ERRORLEVEL%==0 (
    echo [INFO] G-TEC AI Server is already running on port 5001.
    goto :eof
)

echo ============================================
echo   Starting G-TEC AI Server on port 5001
echo   Backend : %MODEL_BACKEND%
echo   Model   : %MODEL_ID%
echo ============================================
call .venv\Scripts\activate 2>nul || (
    echo [WARNING] .venv not found - using system Python
)
python ai_server.py
pause

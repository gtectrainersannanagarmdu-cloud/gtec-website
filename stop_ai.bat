@echo off
title Stop G-TEC AI Server
echo Stopping any process listening on port 5001 ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5001" ^| findstr "LISTENING"') do (
    echo   Killing PID %%p
    taskkill /F /PID %%p >nul 2>&1
)
echo G-TEC AI Server stopped.
timeout /t 2 >nul

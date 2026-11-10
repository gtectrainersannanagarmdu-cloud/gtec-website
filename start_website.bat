@echo off
title G-TEC Website Server
echo ============================================
echo   Starting G-TEC Website on port 3000
echo ============================================
cd /d "%~dp0"
node server.js
pause

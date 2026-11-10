@echo off
title G-TEC - Allow Phone Access (Firewall)
cd /d "%~dp0"

REM --- Re-launch with administrator rights (UAC prompt) if needed ---
net session >nul 2>&1
if %errorlevel% NEQ 0 (
  echo Requesting administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ==================================================
echo   Allow phones on your Wi-Fi to open the G-TEC site
echo   (Node website server on port 3000)
echo ==================================================
echo.

powershell -NoProfile -Command "if (Get-NetFirewallRule -DisplayName 'G-TEC Website (TCP 3000)' -ErrorAction SilentlyContinue) { Write-Host 'Firewall rule already exists.' } else { New-NetFirewallRule -DisplayName 'G-TEC Website (TCP 3000)' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain,Public -Description 'Allow phones on the same Wi-Fi to open the G-TEC site (Node server on port 3000).' | Out-Null; Write-Host 'Firewall rule created.' }"

echo.
echo Open ONE of these addresses on your phone (phone must be on the SAME Wi-Fi):
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { Write-Host ('   http://' + $_.IPAddress + ':3000/blog.html') }"
echo.
echo Tip: keep this PC ON and the website server running while you post.
echo.
pause

@echo off
if "%1"=="" (
    echo Usage: update-tunnel.bat [TUNNEL_URL]
    echo.
    echo Example: update-tunnel.bat https://abc-def-ghi-jkl.trycloudflare.com
    echo.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -File "update-tunnel.ps1" -TunnelUrl "%1"
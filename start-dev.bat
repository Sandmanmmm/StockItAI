@echo off
echo Starting Shopify PO Sync Pro Development Environment...
echo.

:: Start the API server in a new PowerShell window
echo Starting API server on port 3003...
start "API Server" powershell -NoExit -Command "cd 'D:\PO Sync\shopify-po-sync-pro\api'; npm run dev"

:: Wait a moment for the server to start
timeout /t 3 /nobreak >nul

:: Start the cloudflared tunnel in another new PowerShell window
echo Starting Cloudflared tunnel...
start "Cloudflared Tunnel" powershell -NoExit -Command "cd 'D:\PO Sync\shopify-po-sync-pro'; .\cloudflared.exe tunnel --url http://localhost:3003"

echo.
echo Development environment started!
echo.
echo Two PowerShell windows have been opened:
echo 1. API Server - Running on port 3003
echo 2. Cloudflared Tunnel - Creating secure tunnel to localhost:3003
echo.
echo The tunnel URL will be displayed in the Cloudflared window.
echo Copy that URL and use it to update your Shopify app configuration.
echo.
pause
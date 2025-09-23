# Shopify PO Sync Pro Development Launcher
Write-Host "Starting Shopify PO Sync Pro Development Environment..." -ForegroundColor Green
Write-Host ""

# Change to the project directory
$projectPath = "D:\PO Sync\shopify-po-sync-pro"
Set-Location $projectPath

# Start the API server in a new PowerShell window
Write-Host "Starting API server on port 3003..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\PO Sync\shopify-po-sync-pro\api'; npm run dev" -WindowStyle Normal

# Wait a moment for the server to start
Start-Sleep -Seconds 3

# Start the cloudflared tunnel in another new PowerShell window
Write-Host "Starting Cloudflared tunnel..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\PO Sync\shopify-po-sync-pro'; .\cloudflared.exe tunnel --url http://localhost:3003" -WindowStyle Normal

Write-Host ""
Write-Host "Development environment started!" -ForegroundColor Green
Write-Host ""
Write-Host "Two PowerShell windows have been opened:" -ForegroundColor Cyan
Write-Host "1. API Server - Running on port 3003" -ForegroundColor White
Write-Host "2. Cloudflared Tunnel - Creating secure tunnel to localhost:3003" -ForegroundColor White
Write-Host ""
Write-Host "The tunnel URL will be displayed in the Cloudflared window." -ForegroundColor Yellow
Write-Host "Copy that URL and use it to update your Shopify app configuration." -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit this launcher..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
# Start Cloudflare tunnel for API server on port 3003
Write-Host "🌐 Starting Cloudflare tunnel for API server..." -ForegroundColor Cyan

# Check if cloudflared.exe exists
if (-not (Test-Path ".\cloudflared.exe")) {
    Write-Host "❌ cloudflared.exe not found in current directory" -ForegroundColor Red
    exit 1
}

# Check if API server is running on port 3003
$serverRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3003/api/health" -TimeoutSec 5 -ErrorAction Stop
    $serverRunning = $true
    Write-Host "✅ API server is running on port 3003" -ForegroundColor Green
} catch {
    Write-Host "⚠️  API server not detected on port 3003" -ForegroundColor Yellow
    Write-Host "   Make sure your API server is running" -ForegroundColor Yellow
}

# Create tunnel command for new window
$tunnelCommand = @"
Write-Host '🚇 Starting Cloudflare tunnel...' -ForegroundColor Cyan
Write-Host 'Connecting to http://localhost:3003 (API Server)' -ForegroundColor Gray
Write-Host ''

cd '$PWD'
.\cloudflared.exe tunnel --url http://localhost:3003

Write-Host ''
Write-Host '🛑 Tunnel stopped. Press Enter to close this window...' -ForegroundColor Red
Read-Host
"@

Write-Host "🚀 Starting tunnel in new PowerShell window..." -ForegroundColor Cyan
Write-Host "📝 Tunneling: http://localhost:3003 -> https://[random].trycloudflare.com" -ForegroundColor Gray

# Start tunnel in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", $tunnelCommand

Write-Host "`n✅ Tunnel started in separate PowerShell window!" -ForegroundColor Green
Write-Host "🔗 Look for the tunnel URL in the new window" -ForegroundColor Cyan
Write-Host "🖥️  API Server: http://localhost:3003" -ForegroundColor Gray

if (-not $serverRunning) {
    Write-Host "`n⚠️  REMINDER: Make sure API server is running!" -ForegroundColor Yellow
}

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
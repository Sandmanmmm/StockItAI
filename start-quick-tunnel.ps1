# Quick Cloudflare Tun# Start the tunnel in a new PowerShell window
Write-Host "🚀 Starting tunnel in new PowerShell window..." -ForegroundColor Cyan
Write-Host "📝 Tunneling: http://localhost:3005 -> https://[random].trycloudflare.com" -ForegroundColor Gray

$scriptDir = $PSScriptRoot
Start-Process powershell -ArgumentList @(
    "-NoExit", 
    "-Command", 
    "cd '$scriptDir'; Write-Host '🚇 Starting Cloudflare tunnel...' -ForegroundColor Cyan; Write-Host 'Connecting to http://localhost:3005' -ForegroundColor Gray; Write-Host ''; .\cloudflared.exe tunnel --url http://localhost:3005; Write-Host ''; Write-Host '🛑 Tunnel stopped. Press Enter to close this window...' -ForegroundColor Red; Read-Host"
)n required)
# This creates a temporary tunnel with a random trycloudflare.com URL

Write-Host "🌐 Starting quick Cloudflare tunnel..." -ForegroundColor Cyan

# Check if cloudflared.exe exists
if (-not (Test-Path ".\cloudflared.exe")) {
    Write-Host "❌ cloudflared.exe not found in current directory" -ForegroundColor Red
    exit 1
}

# Check if server is running on port 3005
$serverRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3005/api/health" -TimeoutSec 5 -ErrorAction Stop
    $serverRunning = $true
    Write-Host "✅ API server is running on port 3005" -ForegroundColor Green
} catch {
    Write-Host "⚠️  API server not detected on port 3005" -ForegroundColor Yellow
    Write-Host "   Make sure your server is running before starting the tunnel" -ForegroundColor Yellow
}

# Create the tunnel command for a new PowerShell window
$tunnelCommand = @"
Write-Host '🚇 Starting Cloudflare tunnel...' -ForegroundColor Cyan
Write-Host 'Connecting to http://localhost:3005' -ForegroundColor Gray
Write-Host ''

cd '$PWD'
.\cloudflared.exe tunnel --url http://localhost:3005

Write-Host ''
Write-Host '🛑 Tunnel stopped. Press Enter to close this window...' -ForegroundColor Red
Read-Host
"@

Write-Host "🚀 Starting tunnel in new PowerShell window..." -ForegroundColor Cyan
Write-Host "📝 Tunneling: http://localhost:3005 -> https://[random].trycloudflare.com" -ForegroundColor Gray

# Start tunnel in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", $tunnelCommand

Write-Host "`n✅ Tunnel started in separate PowerShell window!" -ForegroundColor Green
Write-Host "🔗 Look for the tunnel URL in the new window (https://[random].trycloudflare.com)" -ForegroundColor Cyan
Write-Host "🖥️  Local server: http://localhost:3005" -ForegroundColor Gray

if (-not $serverRunning) {
    Write-Host "`n⚠️  REMINDER: Start your API server first!" -ForegroundColor Yellow
    Write-Host "   Run: cd api; .\start-server.ps1" -ForegroundColor Gray
}

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
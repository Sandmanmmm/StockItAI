# Fresh Cloudflare Tunnel Setup for Shopify PO Sync Pro
# This script creates and starts a new Cloudflare tunnel in a separate PowerShell window

Write-Host "🌐 Setting up fresh Cloudflare tunnel..." -ForegroundColor Cyan

# Check if cloudflared.exe exists
if (-not (Test-Path ".\cloudflared.exe")) {
    Write-Host "❌ cloudflared.exe not found in current directory" -ForegroundColor Red
    Write-Host "Please download cloudflared.exe from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Yellow
    exit 1
}

# Check if user is authenticated
Write-Host "🔐 Checking Cloudflare authentication..." -ForegroundColor Yellow
$authCheck = & .\cloudflared.exe tunnel list 2>&1
if ($LASTEXITCODE -ne 0 -and $authCheck -like "*login*") {
    Write-Host "🔑 Not authenticated. Opening browser for login..." -ForegroundColor Yellow
    & .\cloudflared.exe tunnel login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Authentication failed" -ForegroundColor Red
        exit 1
    }
}

# Create a unique tunnel name with timestamp
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tunnelName = "shopify-po-sync-$timestamp"

Write-Host "🚇 Creating new tunnel: $tunnelName" -ForegroundColor Green
& .\cloudflared.exe tunnel create $tunnelName

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create tunnel" -ForegroundColor Red
    exit 1
}

# Get tunnel ID
$tunnelList = & .\cloudflared.exe tunnel list --output json | ConvertFrom-Json
$tunnel = $tunnelList | Where-Object { $_.name -eq $tunnelName } | Select-Object -First 1

if (-not $tunnel) {
    Write-Host "❌ Could not find created tunnel" -ForegroundColor Red
    exit 1
}

$tunnelId = $tunnel.id
Write-Host "✅ Tunnel created with ID: $tunnelId" -ForegroundColor Green

# Create tunnel configuration
$configPath = "tunnel-config.yml"
$config = @"
tunnel: $tunnelId
credentials-file: C:\Users\$env:USERNAME\.cloudflared\$tunnelId.json

ingress:
  - hostname: $tunnelName.com
    service: http://localhost:3005
  - hostname: "*.$tunnelName.com"
    service: http://localhost:3005
  - service: http_status:404

"@

$config | Out-File -FilePath $configPath -Encoding UTF8
Write-Host "📝 Tunnel configuration created: $configPath" -ForegroundColor Green

# Start the tunnel in a new PowerShell window
$tunnelCommand = "cd '$PWD'; .\cloudflared.exe tunnel --config $configPath run $tunnelName; Read-Host 'Press Enter to close'"

Write-Host "🚀 Starting tunnel in new PowerShell window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", $tunnelCommand

# Wait a moment for tunnel to start
Start-Sleep -Seconds 5

# Get tunnel URL
$tunnelInfo = & .\cloudflared.exe tunnel info $tunnelName --output json 2>$null | ConvertFrom-Json
if ($tunnelInfo -and $tunnelInfo.conns -and $tunnelInfo.conns.Count -gt 0) {
    $tunnelUrl = "https://$tunnelName.trycloudflare.com"
} else {
    # Fallback to quick tunnel URL format
    $tunnelUrl = "https://$tunnelName.trycloudflare.com"
}

Write-Host "`n🎉 Tunnel Setup Complete!" -ForegroundColor Green
Write-Host "📝 Tunnel Name: $tunnelName" -ForegroundColor Cyan
Write-Host "🔗 Tunnel URL: $tunnelUrl" -ForegroundColor Cyan
Write-Host "🖥️  Local Server: http://localhost:3005" -ForegroundColor Cyan
Write-Host "📋 Config File: $configPath" -ForegroundColor Cyan

Write-Host "`n🔧 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Tunnel is running in separate PowerShell window"
Write-Host "2. Your API server should be running on http://localhost:3005"
Write-Host "3. External access available at: $tunnelUrl"
Write-Host "4. Update your frontend to use the tunnel URL if needed"

# Save tunnel info for other scripts
$tunnelInfo = @{
    name = $tunnelName
    id = $tunnelId
    url = $tunnelUrl
    configPath = $configPath
    created = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
}

$tunnelInfo | ConvertTo-Json | Out-File -FilePath "current-tunnel.json" -Encoding UTF8
Write-Host "💾 Tunnel info saved to current-tunnel.json" -ForegroundColor Green

Write-Host "`n`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
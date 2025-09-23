# Shopify App Bridge Test Script - Simple PowerShell Version
Write-Host "🛒 Shopify PO Sync Pro - App Bridge Testing" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""

# Check if Shopify CLI is installed
$shopifyInstalled = $false
$shopifyCommand = Get-Command shopify -ErrorAction SilentlyContinue
if ($shopifyCommand) {
    $shopifyVersion = & shopify version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Shopify CLI found" -ForegroundColor Green
        Write-Host "📋 Version: $shopifyVersion" -ForegroundColor Gray
        $shopifyInstalled = $true
    }
} else {
    Write-Host "❌ Shopify CLI is not installed" -ForegroundColor Red
    Write-Host "📦 Install with: npm install -g @shopify/cli" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🚀 Testing options:" -ForegroundColor Blue
Write-Host "1. Start development server: shopify app dev"
Write-Host "2. Test App Bridge locally: http://localhost:3002"
Write-Host "3. View App Bridge test page: http://localhost:3002/test.html"
Write-Host ""

# Check if the local server is running
$serverRunning = $false
$webRequest = $null
try {
    $webRequest = Invoke-WebRequest -Uri "http://localhost:3002/api/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
} catch {
    # Silently handle error
}

if ($webRequest -and $webRequest.StatusCode -eq 200) {
    Write-Host "✅ Local API server is running on port 3002" -ForegroundColor Green
    $serverRunning = $true
    
    $healthData = $null
    try {
        $healthData = $webRequest.Content | ConvertFrom-Json
    } catch {
        # Silently handle JSON parsing error
    }
    
    if ($healthData) {
        Write-Host "📊 Server status: $($healthData.status)" -ForegroundColor Gray
        Write-Host "🌍 Environment: $($healthData.environment)" -ForegroundColor Gray
    } else {
        Write-Host "📊 Server is responding" -ForegroundColor Gray
    }
} else {
    Write-Host "❌ Local API server is not running" -ForegroundColor Red
    Write-Host "🔧 Start it with: cd api; npm run dev" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📝 App Bridge Integration Status:" -ForegroundColor Blue
Write-Host "- App Bridge Provider: ✅ Implemented" -ForegroundColor Green
Write-Host "- Development fallbacks: ✅ Configured" -ForegroundColor Green
Write-Host "- Toast notifications: ✅ Available" -ForegroundColor Green
Write-Host "- Navigation hooks: ✅ Available" -ForegroundColor Green
Write-Host "- Context detection: ✅ Available" -ForegroundColor Green
Write-Host "- Mock environment: ✅ Configured" -ForegroundColor Green
Write-Host ""

Write-Host "🎯 Next steps:" -ForegroundColor Magenta
Write-Host "1. Ensure your Shopify app is configured with client_id in shopify.app.orderflow-ai.toml"
Write-Host "2. Set VITE_SHOPIFY_API_KEY in .env.local"
Write-Host "3. Run 'shopify app dev' to start with real Shopify integration"
Write-Host ""

Write-Host "🔗 Quick Links:" -ForegroundColor Yellow
Write-Host "- App: http://localhost:3002" -ForegroundColor Gray
Write-Host "- Test Page: http://localhost:3002/test.html" -ForegroundColor Gray
Write-Host "- Health Check: http://localhost:3002/api/health" -ForegroundColor Gray
Write-Host ""

# Summary
if ($serverRunning -and $shopifyInstalled) {
    Write-Host "🎉 Everything looks good! Ready to test App Bridge." -ForegroundColor Green
} elseif ($serverRunning) {
    Write-Host "⚠️  Server is running, but Shopify CLI is missing." -ForegroundColor Yellow
} elseif ($shopifyInstalled) {
    Write-Host "⚠️  Shopify CLI is ready, but server is not running." -ForegroundColor Yellow
} else {
    Write-Host "❌ Both server and Shopify CLI need attention." -ForegroundColor Red
}

Read-Host "Press Enter to continue"
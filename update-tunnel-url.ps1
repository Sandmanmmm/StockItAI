#!/usr/bin/env powershell
# Update Tunnel URL Script - Updates all configuration files with new Cloudflare tunnel URL

param(
    [Parameter(Mandatory=$true)]
    [string]$TunnelUrl
)

Write-Host "🔄 Updating all configuration files with new tunnel URL: $TunnelUrl" -ForegroundColor Green

# Validate URL format
if (-not $TunnelUrl.StartsWith("https://") -or -not $TunnelUrl.Contains("trycloudflare.com")) {
    Write-Host "❌ Error: Please provide a valid Cloudflare tunnel URL (https://xxx.trycloudflare.com)" -ForegroundColor Red
    exit 1
}

try {
    # Update .env.local
    Write-Host "📝 Updating .env.local..." -ForegroundColor Cyan
    $envContent = Get-Content ".env.local" -Raw
    $envContent = $envContent -replace 'VITE_SHOPIFY_APP_URL=https://[^/\s]+\.trycloudflare\.com', "VITE_SHOPIFY_APP_URL=$TunnelUrl"
    $envContent = $envContent -replace 'VITE_API_BASE_URL=https://[^/\s]+\.trycloudflare\.com', "VITE_API_BASE_URL=$TunnelUrl"
    Set-Content ".env.local" -Value $envContent

    # Update shopify.app.toml
    Write-Host "📝 Updating shopify.app.toml..." -ForegroundColor Cyan
    $shopifyConfig = Get-Content "shopify.app.toml" -Raw
    $shopifyConfig = $shopifyConfig -replace 'application_url = "https://[^/\s]+\.trycloudflare\.com"', "application_url = `"$TunnelUrl`""
    $shopifyConfig = $shopifyConfig -replace '"https://[^/\s]+\.trycloudflare\.com/', "`"$TunnelUrl/"
    Set-Content "shopify.app.toml" -Value $shopifyConfig

    # Update shopify.app.orderflow-ai.toml
    Write-Host "📝 Updating shopify.app.orderflow-ai.toml..." -ForegroundColor Cyan
    $orderflowConfig = Get-Content "shopify.app.orderflow-ai.toml" -Raw
    $orderflowConfig = $orderflowConfig -replace 'application_url = "https://[^/\s]+\.trycloudflare\.com"', "application_url = `"$TunnelUrl`""
    $orderflowConfig = $orderflowConfig -replace '"https://[^/\s]+\.trycloudflare\.com/', "`"$TunnelUrl/"
    Set-Content "shopify.app.orderflow-ai.toml" -Value $orderflowConfig

    # Update API server CORS
    Write-Host "📝 Updating API server CORS..." -ForegroundColor Cyan
    $serverContent = Get-Content "api/src/server.js" -Raw
    $serverContent = $serverContent -replace "'https://[^/\s']+\.trycloudflare\.com'", "'$TunnelUrl'"
    Set-Content "api/src/server.js" -Value $serverContent

    Write-Host "✅ All configuration files updated successfully!" -ForegroundColor Green
    Write-Host "🔄 Next steps:" -ForegroundColor Yellow
    Write-Host "   1. Rebuild frontend: npm run build" -ForegroundColor White
    Write-Host "   2. Restart API server if running" -ForegroundColor White
    Write-Host "   3. Hard refresh Shopify app (Ctrl+Shift+R)" -ForegroundColor White

} catch {
    Write-Host "❌ Error updating configuration files: $_" -ForegroundColor Red
    exit 1
}
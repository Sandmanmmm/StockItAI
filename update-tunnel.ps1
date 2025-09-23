# Shopify App Configuration Updater
param(
    [Parameter(Mandatory=$true)]
    [string]$TunnelUrl
)

Write-Host "Updating Shopify app configuration with tunnel URL: $TunnelUrl" -ForegroundColor Green
Write-Host ""

# Validate URL format
if (-not $TunnelUrl.StartsWith("https://") -or -not $TunnelUrl.Contains("trycloudflare.com")) {
    Write-Host "Error: Please provide a valid Cloudflare tunnel URL (https://xxx.trycloudflare.com)" -ForegroundColor Red
    exit 1
}

# Change to project directory
$projectPath = "D:\PO Sync\shopify-po-sync-pro"
Set-Location $projectPath

# Read the current TOML file
$tomlPath = "shopify.app.orderflow-ai.toml"
$content = Get-Content $tomlPath -Raw

# Update the application_url
$content = $content -replace 'application_url = "https://[^"]*"', "application_url = `"$TunnelUrl`""

# Update the redirect URLs
$content = $content -replace 'https://[^"]*\.trycloudflare\.com/auth/callback', "$TunnelUrl/auth/callback"
$content = $content -replace 'https://[^"]*\.trycloudflare\.com/auth/shopify/callback', "$TunnelUrl/auth/shopify/callback" 
$content = $content -replace 'https://[^"]*\.trycloudflare\.com/api/auth/callback', "$TunnelUrl/api/auth/callback"

# Write the updated content
Set-Content $tomlPath $content

Write-Host "✓ Updated shopify.app.orderflow-ai.toml with new tunnel URL" -ForegroundColor Green

# Deploy the updated configuration
Write-Host ""
Write-Host "Deploying updated configuration to Shopify..." -ForegroundColor Yellow
Write-Host ""

try {
    & shopify app deploy
    Write-Host ""
    Write-Host "✓ Successfully deployed app configuration!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your Shopify app should now be accessible with the new tunnel URL." -ForegroundColor Cyan
}
catch {
    Write-Host "Error deploying app configuration: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
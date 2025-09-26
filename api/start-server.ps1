# Start server in a new PowerShell window
param(
    [switch]$NewWindow
)

$scriptPath = "d:\PO Sync\shopify-po-sync-pro\api"
$serverScript = "src/server.js"

# Default to new window if no parameter specified
if (-not $PSBoundParameters.ContainsKey('NewWindow')) {
    $NewWindow = $true
}

if ($NewWindow) {
    Write-Host "Starting server in new PowerShell window..."
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$scriptPath'; node $serverScript"
    Write-Host "Server started in new window. Check the new PowerShell window for server output."
} else {
    # Run in current window
    Set-Location $scriptPath
    node $serverScript
}
# Test the automatic processing workflow
param(
    [switch]$NewWindow
)

$testScript = "test-workflow-init.js"

# Default to new window if no parameter specified
if (-not $PSBoundParameters.ContainsKey('NewWindow')) {
    $NewWindow = $true
}

if ($NewWindow) {
    Write-Host "Starting workflow test in new PowerShell window..."
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location 'd:\PO Sync\shopify-po-sync-pro'; node $testScript"
    Write-Host "Workflow test started in new window. Check the new PowerShell window for test output."
} else {
    # Run in current window
    Set-Location "d:\PO Sync\shopify-po-sync-pro"
    node $testScript
}
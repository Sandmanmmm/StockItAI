// Manual test via PowerShell using Invoke-RestMethod
// Run this in PowerShell:
/*
$pdf = Get-Content -Path ".\test-po-1758777151697.pdf" -AsByteStream
$boundary = [System.Guid]::NewGuid().ToString()
$bodyLines = @()
$bodyLines += "--$boundary"
$bodyLines += 'Content-Disposition: form-data; name="merchantId"'
$bodyLines += ""
$bodyLines += "cmft3moy50000ultcbqgxzz6d"
$bodyLines += "--$boundary"
$bodyLines += 'Content-Disposition: form-data; name="file"; filename="test-po.pdf"'
$bodyLines += 'Content-Type: application/pdf'
$bodyLines += ""
$bodyLines += [System.Text.Encoding]::Latin1.GetString($pdf)
$bodyLines += "--$boundary--"

$body = $bodyLines -join "`r`n"
$response = Invoke-RestMethod -Uri "http://localhost:3005/api/upload" -Method Post -Body $body -ContentType "multipart/form-data; boundary=$boundary"
Write-Output $response
*/

// Alternative: Simple curl equivalent for PowerShell
console.log('Copy and paste this into PowerShell:');
console.log('');
console.log('$form = @{');
console.log('    merchantId = "cmft3moy50000ultcbqgxzz6d"');
console.log('    file = Get-Item "test-po-1758777151697.pdf"');
console.log('}');
console.log('');
console.log('$response = Invoke-RestMethod -Uri "http://localhost:3005/api/upload" -Method Post -Form $form');
console.log('$response | ConvertTo-Json -Depth 10');
#!/usr/bin/env powershell

# Start API Server in New PowerShell Window
# This script opens a new PowerShell window and starts the API server with all queue processors

Write-Host "Starting API Server in new PowerShell window..." -ForegroundColor Green

# Change to API directory and start server in new window
$apiPath = Join-Path $PSScriptRoot "api"
Start-Process powershell -ArgumentList @(
    "-NoExit", 
    "-Command", 
    "cd '$apiPath'; Write-Host 'Starting Shopify PO Sync Pro API Server...' -ForegroundColor Green; Write-Host 'Server will run on http://localhost:3003' -ForegroundColor Yellow; Write-Host 'Queue processors will initialize automatically' -ForegroundColor Cyan; Write-Host ''; npm start"
)

Write-Host "API Server starting in new window..." -ForegroundColor Green
Write-Host "Server URL: http://localhost:3003" -ForegroundColor Yellow
Write-Host "Queue processors will initialize automatically" -ForegroundColor Cyan
Write-Host "Keep that window open to maintain the server" -ForegroundColor Magenta

# Wait a moment for server to start
Start-Sleep -Seconds 3

Write-Host "Ready to run tests with the server running!" -ForegroundColor Green
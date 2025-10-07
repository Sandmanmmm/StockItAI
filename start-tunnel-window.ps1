#!/usr/bin/env powershell

# Start Cloudflare Tunnel in New PowerShell Window
# This script opens a new PowerShell window and starts a quick tunnel

Write-Host "Starting Cloudflare Tunnel in new PowerShell window..." -ForegroundColor Green

# Check if cloudflared.exe exists
if (-not (Test-Path ".\cloudflared.exe")) {
    Write-Host "❌ cloudflared.exe not found in current directory" -ForegroundColor Red
    Write-Host "Please download cloudflared.exe from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Yellow
    exit 1
}

# Start tunnel in new window
$scriptDir = $PSScriptRoot
Start-Process powershell -ArgumentList @(
    "-NoExit", 
    "-Command", 
    "cd '$scriptDir'; Write-Host 'Starting Cloudflare Tunnel...' -ForegroundColor Green; Write-Host 'Tunneling: http://localhost:3005 -> https://[random].trycloudflare.com' -ForegroundColor Yellow; Write-Host 'This will generate a new tunnel URL - watch for it below:' -ForegroundColor Cyan; Write-Host ''; .\cloudflared.exe tunnel --url http://localhost:3005; Write-Host ''; Write-Host 'Tunnel stopped. Press Enter to close this window...' -ForegroundColor Red; Read-Host"
)

Write-Host "Cloudflare Tunnel starting in new window..." -ForegroundColor Green
Write-Host "Tunneling: http://localhost:3005 -> https://[random].trycloudflare.com" -ForegroundColor Yellow
Write-Host "Watch the new window for the tunnel URL" -ForegroundColor Cyan
Write-Host "Keep that window open to maintain the tunnel" -ForegroundColor Magenta
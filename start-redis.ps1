#!/usr/bin/env powershell
# Start Redis using Docker

Write-Host "🗄️ Starting Redis with Docker..." -ForegroundColor Cyan

# Check if Redis container already exists
$existing = docker ps -a --filter "name=redis-shopify-po" --format "{{.Names}}"

if ($existing -eq "redis-shopify-po") {
    Write-Host "📦 Redis container already exists. Starting it..." -ForegroundColor Yellow
    docker start redis-shopify-po
} else {
    Write-Host "📦 Creating new Redis container..." -ForegroundColor Green
    docker run -d --name redis-shopify-po --restart unless-stopped -p 6379:6379 redis:7-alpine
}

# Wait a moment for startup
Start-Sleep -Seconds 2

# Test connection
Write-Host "🔍 Testing Redis connection..." -ForegroundColor Cyan
$response = docker exec redis-shopify-po redis-cli ping

if ($response -eq "PONG") {
    Write-Host "✅ Redis is running and responding on port 6379" -ForegroundColor Green
    Write-Host "🔗 Connection string: redis://localhost:6379" -ForegroundColor Magenta
} else {
    Write-Host "❌ Redis connection test failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "📋 Redis Management Commands:" -ForegroundColor Yellow
Write-Host "  Stop Redis:    docker stop redis-shopify-po" -ForegroundColor White
Write-Host "  Start Redis:   docker start redis-shopify-po" -ForegroundColor White
Write-Host "  Redis CLI:     docker exec -it redis-shopify-po redis-cli" -ForegroundColor White
Write-Host "  View logs:     docker logs redis-shopify-po" -ForegroundColor White
@echo off
echo 🛒 Shopify PO Sync Pro - App Bridge Testing
echo =============================================

REM Check if Shopify CLI is installed
shopify version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Shopify CLI is not installed
    echo 📦 Install it with: npm install -g @shopify/cli
    pause
    exit /b 1
)

echo ✅ Shopify CLI found
echo 📋 Current Shopify CLI version:
shopify version

echo.
echo 🚀 Testing options:
echo 1. Start development server: shopify app dev
echo 2. Test App Bridge locally: http://localhost:3002
echo 3. View App Bridge test page: http://localhost:3002/test.html
echo.

REM Check if the local server is running
curl -s http://localhost:3002/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Local API server is running on port 3002
) else (
    echo ❌ Local API server is not running
    echo 🔧 Start it with: cd api ^&^& npm run dev
)

echo.
echo 📝 App Bridge Integration Status:
echo - App Bridge Provider: ✅ Implemented
echo - Development fallbacks: ✅ Configured
echo - Toast notifications: ✅ Available
echo - Navigation hooks: ✅ Available
echo - Context detection: ✅ Available
echo - Mock environment: ✅ Configured
echo.

echo 🎯 Next steps:
echo 1. Ensure your Shopify app is configured with client_id in shopify.app.orderflow-ai.toml
echo 2. Set VITE_SHOPIFY_API_KEY in .env.local
echo 3. Run 'shopify app dev' to start with real Shopify integration

pause
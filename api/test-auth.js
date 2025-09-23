import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

console.log('Environment loaded. DATABASE_URL:', process.env.DATABASE_URL ? 'Found' : 'Not found');

// Import database utilities
import { db } from './src/lib/db.js';

async function testDatabaseAuthentication() {
  console.log('\n=== Database Authentication Test ===\n');
  
  try {
    // Test 1: Basic connection
    console.log('1. Testing basic database connection...');
    const connectionResult = await db.testConnection();
    console.log('   Connection result:', connectionResult);
    
    if (!connectionResult.success) {
      console.log('❌ Database connection failed. Cannot proceed with authentication tests.');
      return;
    }
    
    console.log('✅ Database connection successful!\n');
    
    // Test 2: Check database schema
    console.log('2. Checking database schema...');
    try {
      const merchantCount = await db.client.merchant.count();
      console.log(`   Found ${merchantCount} merchants in database`);
      
      const sessionCount = await db.client.session.count();
      console.log(`   Found ${sessionCount} sessions in database`);
      
      console.log('✅ Schema validation successful!\n');
    } catch (error) {
      console.log('❌ Schema error:', error.message);
      console.log('   You may need to run: npx prisma db push\n');
    }
    
    // Test 3: Test merchant operations
    console.log('3. Testing merchant authentication operations...');
    try {
      // Test getting a merchant (this would be used by auth middleware)
      const testShop = 'test-shop.myshopify.com';
      const merchant = await db.getMerchantByShop(testShop);
      console.log(`   Merchant lookup for ${testShop}:`, merchant ? 'Found' : 'Not found');
      
      // Test creating a test merchant (simulating OAuth flow)
      const testMerchantData = {
        domain: testShop,
        name: 'Test Shop',
        email: 'test@example.com',
        currency: 'USD',
        timezone: 'UTC'
      };
      
      const testSessionData = {
        shop: testShop,
        state: 'test_state_' + Date.now(),
        accessToken: 'test_token_' + Date.now(),
        scope: 'read_products,write_products',
        userId: '12345',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };
      
      console.log('   Creating/updating test merchant...');
      const upsertedMerchant = await db.upsertMerchant(testMerchantData, testSessionData);
      console.log('   Merchant upsert result:', upsertedMerchant ? 'Success' : 'Failed');
      
      if (upsertedMerchant) {
        console.log('   Merchant ID:', upsertedMerchant.id);
        console.log('   Shop Domain:', upsertedMerchant.shopDomain);
      }
      
      console.log('✅ Merchant operations successful!\n');
    } catch (error) {
      console.log('❌ Merchant operation error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Clean up
    await db.client.$disconnect();
    console.log('\n=== Test completed ===');
  }
}

testDatabaseAuthentication();
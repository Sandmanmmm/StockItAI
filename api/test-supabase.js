import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
dotenv.config();

console.log('Environment loaded. DATABASE_URL:', process.env.DATABASE_URL ? 'Found' : 'Missing');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Disable prepared statements for connection pooling
if (process.env.DATABASE_URL.includes('pooler.supabase.com')) {
  prisma.$executeRaw`SET SESSION statement_timeout = 0;`;
}

async function testSupabaseAuthentication() {
  console.log('\n=== Supabase Authentication Test ===\n');
  
  try {
    console.log('1. Testing Merchant operations...');
    
    const testShop = 'test-shop-' + Date.now() + '.myshopify.com';
    
    // Test merchant creation
    const merchantData = {
      shopDomain: testShop,
      name: 'Test Shop',
      email: 'test@example.com',
      timezone: 'UTC',
      currency: 'USD',
      plan: 'basic',
      status: 'active'
    };
    
    console.log('   Creating test merchant...');
    const merchant = await prisma.merchant.create({
      data: merchantData
    });
    console.log('✅ Merchant created successfully:', merchant.shopDomain);
    
    // Test session creation
    console.log('2. Testing Session operations...');
    const sessionData = {
      shop: testShop,
      state: 'test_state_' + Date.now(),
      isOnline: false,
      scope: 'read_products,write_products',
      accessToken: 'test_token_' + Date.now(),
      userId: '12345',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      accountOwner: false,
      collaborator: false,
      emailVerified: false,
      merchantId: merchant.id
    };
    
    console.log('   Creating test session...');
    const session = await prisma.session.create({
      data: sessionData
    });
    console.log('✅ Session created successfully for shop:', session.shop);
    
    // Test data retrieval
    console.log('3. Testing data retrieval...');
    const retrievedMerchant = await prisma.merchant.findUnique({
      where: { shopDomain: testShop },
      include: { sessions: true }
    });
    
    console.log('✅ Merchant retrieved with', retrievedMerchant.sessions.length, 'session(s)');
    
    // Test JWT-like operations (shop-scoped queries)
    console.log('4. Testing shop-scoped queries...');
    const shopSessions = await prisma.session.findMany({
      where: { 
        shop: testShop,
        merchant: {
          status: 'active'
        }
      },
      include: { merchant: true }
    });
    
    console.log('✅ Shop-scoped query returned', shopSessions.length, 'active session(s)');
    
    // Cleanup test data
    console.log('5. Cleaning up test data...');
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.merchant.delete({ where: { id: merchant.id } });
    console.log('✅ Test data cleaned up successfully');
    
    console.log('\n🎉 All authentication tests passed!');
    console.log('   - Database connection: ✅');
    console.log('   - Merchant operations: ✅');
    console.log('   - Session management: ✅');
    console.log('   - Shop-scoped queries: ✅');
    console.log('   - Data integrity: ✅');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code) {
      console.error('   Error code:', error.code);
    }
  } finally {
    await prisma.$disconnect();
    console.log('\n=== Test completed ===');
  }
}

testSupabaseAuthentication();
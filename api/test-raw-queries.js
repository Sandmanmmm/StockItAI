import { PrismaClient } from '@prisma/client';

console.log('Testing transaction pooler with raw queries only...');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://postgres.omvdgqbmgxxutbjhnamf:78eXTjEWiC1aXoOe@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?sslmode=require"
        }
    },
    log: ['query', 'info', 'warn', 'error'],
});

async function testRawQueries() {
    try {
        console.log('Testing with raw queries only...');
        
        await prisma.$connect();
        console.log('✅ Connection successful!');
        
        // Test table exists
        const tableExists = await prisma.$queryRaw`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'PO'
            ) as exists
        `;
        console.log('✅ Table check:', tableExists);
        
        // Test count with raw query
        const countResult = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "PO"`;
        console.log('✅ PO count (raw query):', countResult);
        
        // Test recent records
        const recentRecords = await prisma.$queryRaw`
            SELECT id, status, created_at 
            FROM "PO" 
            ORDER BY created_at DESC 
            LIMIT 3
        `;
        console.log('✅ Recent POs (raw query):', recentRecords);
        
    } catch (error) {
        console.error('❌ Query failed:', error.message);
        console.error('Error code:', error.code);
        if (error.message.includes('prepared statement')) {
            console.log('🔍 Confirmed: Transaction pooler does not support prepared statements');
        }
    } finally {
        await prisma.$disconnect();
        console.log('Connection closed');
    }
}

testRawQueries();
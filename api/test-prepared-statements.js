import { PrismaClient } from '@prisma/client';

console.log('Testing transaction pooler with connection options to handle PREPARE statements...');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://postgres.omvdgqbmgxxutbjhnamf:78eXTjEWiC1aXoOe@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?sslmode=require&prepared_statement_cache_size=0"
        }
    },
    log: ['query', 'info', 'warn', 'error'],
});

async function testWithoutPreparedStatements() {
    try {
        console.log('Testing connection with prepared statements disabled...');
        
        await prisma.$connect();
        console.log('✅ Connection successful!');
        
        // Test count query that previously failed
        const count = await prisma.pO.count();
        console.log('✅ PO count query successful:', count);
        
        // Test more complex query
        const recentPOs = await prisma.pO.findMany({
            take: 3,
            orderBy: { created_at: 'desc' },
            select: { id: true, status: true, created_at: true }
        });
        console.log('✅ Recent POs query successful:', recentPOs);
        
    } catch (error) {
        console.error('❌ Query failed:', error.message);
        console.error('Error code:', error.code);
    } finally {
        await prisma.$disconnect();
        console.log('Connection closed');
    }
}

testWithoutPreparedStatements();
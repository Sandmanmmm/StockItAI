import pg from 'pg';
const { Client } = pg;

console.log('Testing actual PostgreSQL connection with authentication...');

const client = new Client({
    connectionString: "postgresql://postgres.omvdgqbmgxxutbjhnamf:78eXTjEWiC1aXoOe@aws-1-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require"
});

async function testConnection() {
    try {
        console.log('Attempting to connect...');
        await client.connect();
        console.log('✅ PostgreSQL connection successful!');
        
        const result = await client.query('SELECT NOW() as current_time');
        console.log('✅ Query successful:', result.rows[0]);
        
        await client.end();
        console.log('Connection closed cleanly');
    } catch (error) {
        console.error('❌ PostgreSQL connection failed:', error.message);
        console.error('Error code:', error.code);
    }
}

testConnection();
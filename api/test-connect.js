import tls from 'tls';

console.log('Testing TLS connection to Supabase pooler...');

const s = tls.connect(5432, 'aws-1-ca-central-1.pooler.supabase.com', () => {
    console.log('✅ TLS connection successful');
    console.log('Cipher:', s.getCipher());
    console.log('Protocol:', s.getProtocol());
    s.end();
});

s.on('error', e => {
    console.error('❌ TLS connection failed:', e.message);
});

s.on('end', () => {
    console.log('Connection closed');
});

s.setTimeout(10000, () => {
    console.error('❌ Connection timeout');
    s.destroy();
});
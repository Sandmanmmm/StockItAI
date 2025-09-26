import tls from 'tls';

console.log('Testing TLS connection to Supabase transaction pooler (port 6543)...');

const s = tls.connect(6543, 'aws-1-ca-central-1.pooler.supabase.com', () => {
    console.log('✅ Transaction pooler TLS connection successful');
    console.log('Cipher:', s.getCipher());
    console.log('Protocol:', s.getProtocol());
    s.end();
});

s.on('error', e => {
    console.error('❌ Transaction pooler TLS connection failed:', e.message);
});

s.on('end', () => {
    console.log('Transaction pooler connection closed');
});

s.setTimeout(10000, () => {
    console.error('❌ Transaction pooler connection timeout');
    s.destroy();
});
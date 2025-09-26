import tls from 'tls';

console.log('Testing TLS connection to direct Supabase project host...');

const s = tls.connect(5432, 'db.omvdgqbmgxxutbjhnamf.supabase.co', () => {
    console.log('✅ Direct host TLS connection successful');
    console.log('Cipher:', s.getCipher());
    console.log('Protocol:', s.getProtocol());
    s.end();
});

s.on('error', e => {
    console.error('❌ Direct host TLS connection failed:', e.message);
});

s.on('end', () => {
    console.log('Direct host connection closed');
});

s.setTimeout(10000, () => {
    console.error('❌ Direct host connection timeout');
    s.destroy();
});
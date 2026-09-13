/**
 * Adapter pengiriman WhatsApp OTP.
 * Ganti WA_GATEWAY_PROVIDER di .env sesuai provider yang dipakai desa Anda.
 * Jika provider = 'none', OTP hanya dicetak ke console (mode development).
 */
const https = require('https');

function sendViaFonnte(no_wa, message) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams({ target: no_wa, message }).toString();
    const req = https.request(
      {
        hostname: 'api.fonnte.com',
        path: '/send',
        method: 'POST',
        headers: {
          Authorization: process.env.WA_GATEWAY_TOKEN,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(body));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendOtp(no_wa, code) {
  const message = `Kode OTP UMKM SMART Anda: ${code}. Berlaku ${process.env.OTP_EXPIRES_MINUTES || 5} menit. Jangan bagikan kode ini ke siapapun.`;
  const provider = process.env.WA_GATEWAY_PROVIDER || 'none';

  if (provider === 'fonnte') {
    return sendViaFonnte(no_wa, message);
  }

  // provider lain (wablas, twilio, dll) tinggal ditambahkan di sini dengan pola yang sama

  // Mode development: tampilkan di log server saja
  console.log(`[DEV MODE - OTP] Kirim ke ${no_wa}: ${message}`);
  return { simulated: true };
}

module.exports = { sendOtp };

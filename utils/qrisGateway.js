/**
 * Adapter QRIS. Isi QRIS_PROVIDER, QRIS_MERCHANT_ID, QRIS_API_KEY di .env
 * untuk terhubung ke rekening/e-wallet asli pelaku UMKM lewat PSP resmi
 * (Midtrans, Xendit, atau penyedia QRIS lain yang sudah bekerja sama dengan BUMDes/Bank Desa).
 *
 * Tanpa kredensial produksi, modul ini berjalan dalam MODE SIMULASI:
 * menghasilkan qr_string dummy dan endpoint /api/qris/simulate-paid untuk uji coba alur.
 */
const QRCode = require('qrcode');
const { nanoid } = require('nanoid');

async function createQris({ amount, referenceId }) {
  const provider = process.env.QRIS_PROVIDER || 'none';

  if (provider === 'midtrans') {
    // TODO: panggil Midtrans Core API /v2/charge dengan payment_type: 'qris'
    // menggunakan QRIS_API_KEY sebagai server key (Basic Auth).
    throw new Error('Integrasi Midtrans belum dikonfigurasi. Lengkapi kredensial di .env.');
  }

  if (provider === 'xendit') {
    // TODO: panggil Xendit QR Codes API dengan QRIS_API_KEY.
    throw new Error('Integrasi Xendit belum dikonfigurasi. Lengkapi kredensial di .env.');
  }

  // ---- MODE SIMULASI (dev/testing) ----
  const dummyPayload = `00020101021226630014ID.CO.QRIS.WWW0215UMKMSMARTDESA${referenceId}0303UME52045411530336054${amount}5802ID`;
  const qrDataUrl = await QRCode.toDataURL(dummyPayload);
  return {
    provider: 'simulasi',
    qris_ref: `SIM-${nanoid(10)}`,
    qr_string: qrDataUrl, // base64 PNG, langsung bisa dipakai <img src="...">
  };
}

module.exports = { createQris };

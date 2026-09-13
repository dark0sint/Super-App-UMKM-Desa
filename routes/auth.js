const express = require('express');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const rateLimit = require('express-rate-limit');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { sendOtp } = require('../utils/waGateway');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { success: false, message: 'Terlalu banyak permintaan OTP. Coba lagi sebentar lagi.' },
});

function normalizeWa(no) {
  let n = String(no).replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  return n;
}

function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// STEP 1: Minta OTP
router.post('/otp/request', otpLimiter, async (req, res) => {
  const { no_wa } = req.body;
  if (!no_wa) return fail(res, 'Nomor WhatsApp wajib diisi.');

  const waNumber = normalizeWa(no_wa);
  const code = genOtp();
  const expiresMinutes = parseInt(process.env.OTP_EXPIRES_MINUTES || '5', 10);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();

  db.prepare(`INSERT INTO otp_codes (id, no_wa, code, expires_at) VALUES (?, ?, ?, ?)`)
    .run(nanoid(), waNumber, code, expiresAt);

  await sendOtp(waNumber, code);

  return ok(res, { no_wa: waNumber, expires_in_minutes: expiresMinutes }, 'Kode OTP telah dikirim ke WhatsApp Anda.');
});

// STEP 2: Verifikasi OTP -> jika user baru, buat akun sekalian (pendaftaran otomatis)
router.post('/otp/verify', (req, res) => {
  const { no_wa, code, nama_pemilik, nama_usaha, desa, device_id } = req.body;
  if (!no_wa || !code) return fail(res, 'Nomor WhatsApp dan kode OTP wajib diisi.');

  const waNumber = normalizeWa(no_wa);
  const otpRow = db
    .prepare(`SELECT * FROM otp_codes WHERE no_wa = ? AND code = ? AND used = 0 ORDER BY created_at DESC LIMIT 1`)
    .get(waNumber, code);

  if (!otpRow) return fail(res, 'Kode OTP salah.', 401);
  if (new Date(otpRow.expires_at) < new Date()) return fail(res, 'Kode OTP sudah kedaluwarsa.', 401);

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(otpRow.id);

  let user = db.prepare('SELECT * FROM users WHERE no_wa = ?').get(waNumber);

  if (!user) {
    if (!nama_pemilik || !nama_usaha) {
      return fail(res, 'Akun belum terdaftar. Sertakan nama_pemilik dan nama_usaha untuk mendaftar otomatis.', 422);
    }
    const id = nanoid();
    db.prepare(
      `INSERT INTO users (id, no_wa, nama_pemilik, nama_usaha, desa, device_token)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, waNumber, nama_pemilik, nama_usaha, desa || null, device_id || null);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  } else if (device_id) {
    db.prepare('UPDATE users SET device_token = ? WHERE id = ?').run(device_id, user.id);
  }

  const token = jwt.sign({ uid: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

  return ok(res, { token, user }, 'Login berhasil.');
});

/**
 * Login cepat via sidik jari / biometrik perangkat.
 * Pola realistis untuk UMKM desa: verifikasi sidik jari terjadi di HP (Android/iOS biometric API)
 * untuk membuka token yang sudah tersimpan aman di perangkat (bukan kirim password).
 * Endpoint ini hanya menukar device_token yang tersimpan menjadi session token baru,
 * dipanggil SETELAH aplikasi mobile memverifikasi sidik jari secara lokal.
 */
router.post('/biometric/exchange', (req, res) => {
  const { no_wa, device_token } = req.body;
  if (!no_wa || !device_token) return fail(res, 'no_wa dan device_token wajib diisi.');

  const waNumber = normalizeWa(no_wa);
  const user = db.prepare('SELECT * FROM users WHERE no_wa = ? AND device_token = ?').get(waNumber, device_token);
  if (!user) return fail(res, 'Sidik jari tidak dikenali di perangkat ini. Silakan login via OTP.', 401);

  const token = jwt.sign({ uid: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
  return ok(res, { token, user }, 'Login biometrik berhasil.');
});

router.get('/me', authRequired, (req, res) => {
  return ok(res, req.user);
});

router.put('/me', authRequired, (req, res) => {
  const { nama_pemilik, nama_usaha, desa, kategori_usaha, alamat, foto_profil_url } = req.body;
  db.prepare(
    `UPDATE users SET nama_pemilik = COALESCE(?, nama_pemilik), nama_usaha = COALESCE(?, nama_usaha),
     desa = COALESCE(?, desa), kategori_usaha = COALESCE(?, kategori_usaha), alamat = COALESCE(?, alamat),
     foto_profil_url = COALESCE(?, foto_profil_url), updated_at = datetime('now') WHERE id = ?`
  ).run(nama_pemilik, nama_usaha, desa, kategori_usaha, alamat, foto_profil_url, req.user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return ok(res, updated, 'Profil diperbarui.');
});

module.exports = router;

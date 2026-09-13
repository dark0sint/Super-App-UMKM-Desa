const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { authRequired } = require('../middleware/auth');
const { createQris } = require('../utils/qrisGateway');

const router = express.Router();
router.use(authRequired);

// Buat QR pembayaran untuk sebuah nominal / transaksi kasir
router.post('/create', async (req, res) => {
  const { amount, transaksi_id } = req.body;
  if (!amount || amount <= 0) return fail(res, 'amount wajib diisi dan lebih besar dari 0.');

  try {
    const referenceId = nanoid(8);
    const result = await createQris({ amount, referenceId });

    const id = nanoid();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO qris_payments (id, user_id, transaksi_id, qris_ref, qr_string, amount, status, provider, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(id, req.user.id, transaksi_id || null, result.qris_ref, result.qr_string, amount, result.provider, expiresAt);

    const row = db.prepare('SELECT * FROM qris_payments WHERE id = ?').get(id);
    return ok(res, row, 'QR pembayaran dibuat. Uang akan langsung masuk ke rekening/e-wallet terdaftar setelah dibayar.', 201);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

router.get('/:id/status', (req, res) => {
  const row = db.prepare('SELECT * FROM qris_payments WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return fail(res, 'Data QRIS tidak ditemukan.', 404);
  return ok(res, row);
});

// Endpoint uji coba (mode simulasi) untuk menandai pembayaran sukses
// Di produksi, ini digantikan oleh WEBHOOK dari provider (Midtrans/Xendit) — lihat routes/webhook.js
router.post('/:id/simulate-paid', (req, res) => {
  if ((process.env.QRIS_PROVIDER || 'none') !== 'none') {
    return fail(res, 'Simulasi hanya tersedia saat QRIS_PROVIDER=none (mode development).');
  }
  const row = db.prepare('SELECT * FROM qris_payments WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return fail(res, 'Data QRIS tidak ditemukan.', 404);
  if (row.status === 'paid') return fail(res, 'Pembayaran sudah lunas.');

  const tx = db.transaction(() => {
    db.prepare(`UPDATE qris_payments SET status = 'paid', paid_at = datetime('now') WHERE id = ?`).run(row.id);
    db.prepare(
      `INSERT INTO keuangan (id, user_id, tipe, kategori, jumlah, keterangan, sumber, ref_id)
       VALUES (?, ?, 'pemasukan', 'penjualan', ?, ?, 'kasir', ?)`
    ).run(nanoid(), req.user.id, row.amount, `Pembayaran QRIS ${row.qris_ref}`, row.transaksi_id || row.id);
  });
  tx();

  return ok(res, db.prepare('SELECT * FROM qris_payments WHERE id = ?').get(row.id), 'Pembayaran QRIS berhasil (simulasi).');
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM qris_payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  return ok(res, rows);
});

module.exports = router;

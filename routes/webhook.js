const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');

const router = express.Router();

/**
 * Webhook Midtrans/Xendit dipanggil server PSP saat status pembayaran QRIS berubah.
 * Sesuaikan validasi signature sesuai dokumentasi provider yang dipakai
 * (contoh Midtrans: verifikasi signature_key SHA512).
 */
router.post('/qris', (req, res) => {
  // TODO: validasi signature dari provider sebelum memproses (WAJIB di produksi)
  const { qris_ref, status } = req.body; // sesuaikan field dengan payload provider asli

  const row = db.prepare('SELECT * FROM qris_payments WHERE qris_ref = ?').get(qris_ref);
  if (!row) return fail(res, 'Referensi QRIS tidak ditemukan.', 404);

  if (status === 'paid' && row.status !== 'paid') {
    const tx = db.transaction(() => {
      db.prepare(`UPDATE qris_payments SET status='paid', paid_at=datetime('now') WHERE id=?`).run(row.id);
      db.prepare(
        `INSERT INTO keuangan (id, user_id, tipe, kategori, jumlah, keterangan, sumber, ref_id)
         VALUES (?, ?, 'pemasukan', 'penjualan', ?, ?, 'kasir', ?)`
      ).run(nanoid(), row.user_id, row.amount, `Pembayaran QRIS ${row.qris_ref}`, row.transaksi_id || row.id);
    });
    tx();
  } else if (status === 'expired' || status === 'failed') {
    db.prepare(`UPDATE qris_payments SET status=? WHERE id=?`).run(status, row.id);
  }

  return ok(res, null, 'Webhook diproses.');
});

module.exports = router;

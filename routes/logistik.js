const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { authRequired, roleRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// Daftar kurir/ojek desa yang tersedia
router.get('/kurir', (req, res) => {
  const rows = db.prepare('SELECT * FROM kurir WHERE is_active = 1 ORDER BY nama ASC').all();
  return ok(res, rows);
});

router.post('/kurir', roleRequired('admin_desa'), (req, res) => {
  const { nama, no_wa, jenis_kendaraan, wilayah_layanan } = req.body;
  if (!nama || !no_wa) return fail(res, 'nama dan no_wa kurir wajib diisi.');
  const id = nanoid();
  db.prepare(`INSERT INTO kurir (id, nama, no_wa, jenis_kendaraan, wilayah_layanan) VALUES (?, ?, ?, ?, ?)`)
    .run(id, nama, no_wa, jenis_kendaraan || null, wilayah_layanan || null);
  return ok(res, db.prepare('SELECT * FROM kurir WHERE id = ?').get(id), 'Kurir ditambahkan.', 201);
});

// Ajukan pengiriman kolektif untuk sebuah transaksi
router.post('/pengiriman', (req, res) => {
  const { transaksi_id, alamat_tujuan, penerima, no_wa_penerima, ongkir, catatan, kurir_id } = req.body;
  if (!alamat_tujuan || !penerima) return fail(res, 'alamat_tujuan dan penerima wajib diisi.');

  const id = nanoid();
  db.prepare(
    `INSERT INTO pengiriman (id, user_id, transaksi_id, kurir_id, alamat_tujuan, penerima, no_wa_penerima, ongkir, catatan, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, req.user.id, transaksi_id || null, kurir_id || null, alamat_tujuan, penerima,
    no_wa_penerima || null, ongkir || 0, catatan || null, kurir_id ? 'diambil' : 'menunggu_kurir'
  );

  return ok(res, db.prepare('SELECT * FROM pengiriman WHERE id = ?').get(id), 'Permintaan pengiriman dibuat.', 201);
});

router.get('/pengiriman', (req, res) => {
  const rows = db.prepare('SELECT * FROM pengiriman WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  return ok(res, rows);
});

router.patch('/pengiriman/:id/status', (req, res) => {
  const { status, kurir_id } = req.body;
  const valid = ['menunggu_kurir', 'diambil', 'dikirim', 'selesai', 'batal'];
  if (!valid.includes(status)) return fail(res, 'status tidak valid.');

  const row = db.prepare('SELECT * FROM pengiriman WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return fail(res, 'Data pengiriman tidak ditemukan.', 404);

  db.prepare(`UPDATE pengiriman SET status = ?, kurir_id = COALESCE(?, kurir_id), updated_at = datetime('now') WHERE id = ?`)
    .run(status, kurir_id || null, row.id);

  return ok(res, db.prepare('SELECT * FROM pengiriman WHERE id = ?').get(row.id), 'Status pengiriman diperbarui.');
});

module.exports = router;

const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { authRequired, roleRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// UMKM mengajukan modal usaha / pembiayaan mikro ke BUMDes
router.post('/pengajuan', (req, res) => {
  const { jenis, jumlah_diajukan, tenor_bulan, tujuan_penggunaan, dokumen_pendukung_url } = req.body;
  if (!['modal_usaha', 'pembiayaan_mikro'].includes(jenis)) return fail(res, 'jenis pengajuan tidak valid.');
  if (!jumlah_diajukan || jumlah_diajukan <= 0) return fail(res, 'jumlah_diajukan wajib diisi.');
  if (!tujuan_penggunaan) return fail(res, 'tujuan_penggunaan wajib diisi.');

  const id = nanoid();
  db.prepare(
    `INSERT INTO bumdes_pengajuan (id, user_id, jenis, jumlah_diajukan, tenor_bulan, tujuan_penggunaan, dokumen_pendukung_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.user.id, jenis, jumlah_diajukan, tenor_bulan || null, tujuan_penggunaan, dokumen_pendukung_url || null);

  return ok(res, db.prepare('SELECT * FROM bumdes_pengajuan WHERE id = ?').get(id), 'Pengajuan berhasil dikirim ke BUMDes.', 201);
});

// Riwayat pengajuan milik UMKM sendiri
router.get('/pengajuan', (req, res) => {
  const rows = db.prepare('SELECT * FROM bumdes_pengajuan WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  return ok(res, rows);
});

// ADMIN BUMDES: lihat semua pengajuan masuk
router.get('/admin/pengajuan', roleRequired('admin_bumdes'), (req, res) => {
  const { status } = req.query;
  let query = `SELECT bp.*, u.nama_usaha, u.nama_pemilik, u.no_wa, u.desa
               FROM bumdes_pengajuan bp JOIN users u ON u.id = bp.user_id`;
  const params = [];
  if (status) { query += ' WHERE bp.status = ?'; params.push(status); }
  query += ' ORDER BY bp.created_at DESC';
  const rows = db.prepare(query).all(...params);
  return ok(res, rows);
});

// ADMIN BUMDES: tinjau/setujui/tolak/cairkan pengajuan
router.patch('/admin/pengajuan/:id', roleRequired('admin_bumdes'), (req, res) => {
  const { status, catatan_admin } = req.body;
  const valid = ['diajukan', 'ditinjau', 'disetujui', 'ditolak', 'cair'];
  if (!valid.includes(status)) return fail(res, 'status tidak valid.');

  const row = db.prepare('SELECT * FROM bumdes_pengajuan WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, 'Pengajuan tidak ditemukan.', 404);

  db.prepare(`UPDATE bumdes_pengajuan SET status = ?, catatan_admin = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, catatan_admin || row.catatan_admin, row.id);

  return ok(res, db.prepare('SELECT * FROM bumdes_pengajuan WHERE id = ?').get(row.id), 'Status pengajuan diperbarui.');
});

module.exports = router;

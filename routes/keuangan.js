const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// Catat transaksi keuangan manual (pemasukan / pengeluaran)
router.post('/', (req, res) => {
  const { tipe, kategori, jumlah, keterangan, tanggal, device_id, local_id } = req.body;
  if (!['pemasukan', 'pengeluaran'].includes(tipe)) return fail(res, "tipe harus 'pemasukan' atau 'pengeluaran'.");
  if (!jumlah || jumlah <= 0) return fail(res, 'jumlah harus lebih besar dari 0.');

  const id = nanoid();
  db.prepare(
    `INSERT INTO keuangan (id, user_id, tipe, kategori, jumlah, keterangan, sumber, tanggal, device_id, local_id)
     VALUES (?, ?, ?, ?, ?, ?, 'manual', COALESCE(?, date('now')), ?, ?)`
  ).run(id, req.user.id, tipe, kategori || 'lainnya', jumlah, keterangan || null, tanggal, device_id || null, local_id || null);

  const row = db.prepare('SELECT * FROM keuangan WHERE id = ?').get(id);
  return ok(res, row, 'Transaksi keuangan dicatat.', 201);
});

// Daftar transaksi (filter tanggal opsional)
router.get('/', (req, res) => {
  const { dari, sampai, tipe } = req.query;
  let query = 'SELECT * FROM keuangan WHERE user_id = ?';
  const params = [req.user.id];
  if (dari) { query += ' AND tanggal >= ?'; params.push(dari); }
  if (sampai) { query += ' AND tanggal <= ?'; params.push(sampai); }
  if (tipe) { query += ' AND tipe = ?'; params.push(tipe); }
  query += ' ORDER BY tanggal DESC, created_at DESC';
  const rows = db.prepare(query).all(...params);
  return ok(res, rows);
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM keuangan WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return fail(res, 'Data tidak ditemukan.', 404);
  if (row.sumber === 'kasir') return fail(res, 'Transaksi dari kasir tidak bisa dihapus manual, batalkan dari menu kasir.');
  db.prepare('DELETE FROM keuangan WHERE id = ?').run(req.params.id);
  return ok(res, null, 'Transaksi dihapus.');
});

// Laporan untung-rugi otomatis, tanpa perlu rumus akuntansi
router.get('/laporan/untung-rugi', (req, res) => {
  const { dari, sampai } = req.query;
  const start = dari || db.prepare("SELECT date('now','-30 days') as d").get().d;
  const end = sampai || db.prepare("SELECT date('now') as d").get().d;

  const pemasukan = db
    .prepare(`SELECT COALESCE(SUM(jumlah),0) as total FROM keuangan WHERE user_id=? AND tipe='pemasukan' AND tanggal BETWEEN ? AND ?`)
    .get(req.user.id, start, end).total;

  const pengeluaran = db
    .prepare(`SELECT COALESCE(SUM(jumlah),0) as total FROM keuangan WHERE user_id=? AND tipe='pengeluaran' AND tanggal BETWEEN ? AND ?`)
    .get(req.user.id, start, end).total;

  const perKategori = db
    .prepare(
      `SELECT tipe, kategori, COALESCE(SUM(jumlah),0) as total FROM keuangan
       WHERE user_id=? AND tanggal BETWEEN ? AND ? GROUP BY tipe, kategori ORDER BY total DESC`
    )
    .all(req.user.id, start, end);

  const labaRugi = pemasukan - pengeluaran;

  return ok(res, {
    periode: { dari: start, sampai: end },
    total_pemasukan: pemasukan,
    total_pengeluaran: pengeluaran,
    laba_rugi: labaRugi,
    status: labaRugi >= 0 ? 'untung' : 'rugi',
    rincian_per_kategori: perKategori,
  });
});

// Grafik harian (untuk chart di dashboard)
router.get('/laporan/harian', (req, res) => {
  const { dari, sampai } = req.query;
  const start = dari || db.prepare("SELECT date('now','-14 days') as d").get().d;
  const end = sampai || db.prepare("SELECT date('now') as d").get().d;

  const rows = db
    .prepare(
      `SELECT tanggal,
        SUM(CASE WHEN tipe='pemasukan' THEN jumlah ELSE 0 END) as pemasukan,
        SUM(CASE WHEN tipe='pengeluaran' THEN jumlah ELSE 0 END) as pengeluaran
       FROM keuangan WHERE user_id=? AND tanggal BETWEEN ? AND ?
       GROUP BY tanggal ORDER BY tanggal ASC`
    )
    .all(req.user.id, start, end);

  return ok(res, rows);
});

module.exports = router;

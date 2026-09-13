const express = require('express');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { authRequired, roleRequired } = require('../middleware/auth');
const { nanoid } = require('nanoid');

const router = express.Router();

// PUBLIK, tidak wajib login supaya mudah diakses siapa saja
router.get('/', (req, res) => {
  const { tipe, kategori } = req.query;
  let query = 'SELECT * FROM edukasi_konten WHERE is_published = 1';
  const params = [];
  if (tipe) { query += ' AND tipe = ?'; params.push(tipe); }
  if (kategori) { query += ' AND kategori = ?'; params.push(kategori); }
  query += ' ORDER BY created_at DESC';
  const rows = db.prepare(query).all(...params);
  return ok(res, rows, 'Konten hemat kuota — video singkat, tips ringan.');
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM edukasi_konten WHERE id = ? AND is_published = 1').get(req.params.id);
  if (!row) return fail(res, 'Konten tidak ditemukan.', 404);
  return ok(res, row);
});

// Admin desa menambah konten edukasi baru
router.post('/', authRequired, roleRequired('admin_desa'), (req, res) => {
  const { judul, tipe, kategori, isi_singkat, url_konten, ukuran_kb, durasi_detik } = req.body;
  if (!judul || !tipe) return fail(res, 'judul dan tipe wajib diisi.');
  const id = nanoid();
  db.prepare(
    `INSERT INTO edukasi_konten (id, judul, tipe, kategori, isi_singkat, url_konten, ukuran_kb, durasi_detik)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, judul, tipe, kategori || null, isi_singkat || null, url_konten || null, ukuran_kb || null, durasi_detik || null);
  return ok(res, db.prepare('SELECT * FROM edukasi_konten WHERE id = ?').get(id), 'Konten edukasi ditambahkan.', 201);
});

module.exports = router;

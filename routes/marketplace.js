const express = require('express');
const db = require('../db/db');
const { ok } = require('../utils/response');
const { authRequired, roleRequired } = require('../middleware/auth');

const router = express.Router();

// PUBLIK: semua produk unggulan/dipublish dari seluruh UMKM desa, bisa diakses pembeli luar daerah
router.get('/', (req, res) => {
  const { desa, kategori, q, unggulan_saja } = req.query;

  let query = `
    SELECT p.id, p.nama, p.kategori, p.deskripsi, p.harga_jual, p.satuan, p.foto_url, p.is_unggulan,
           u.id as user_id, u.nama_usaha, u.desa, u.no_wa
    FROM products p JOIN users u ON u.id = p.user_id
    WHERE p.is_published = 1 AND p.is_active = 1 AND u.is_active = 1`;
  const params = [];

  if (desa) { query += ' AND u.desa = ?'; params.push(desa); }
  if (kategori) { query += ' AND p.kategori = ?'; params.push(kategori); }
  if (q) { query += ' AND p.nama LIKE ?'; params.push(`%${q}%`); }
  if (unggulan_saja === 'true') { query += ' AND p.is_unggulan = 1'; }

  query += ' ORDER BY p.is_unggulan DESC, p.updated_at DESC LIMIT 200';

  const rows = db.prepare(query).all(...params);
  return ok(res, rows);
});

router.get('/desa-list', (req, res) => {
  const rows = db.prepare(`SELECT DISTINCT desa FROM users WHERE desa IS NOT NULL AND is_active = 1 ORDER BY desa ASC`).all();
  return ok(res, rows.map((r) => r.desa));
});

// Admin desa menandai produk sebagai "produk unggulan desa"
router.patch('/produk/:id/unggulan', authRequired, roleRequired('admin_desa'), (req, res) => {
  const { is_unggulan } = req.body;
  db.prepare(`UPDATE products SET is_unggulan = ? WHERE id = ?`).run(is_unggulan ? 1 : 0, req.params.id);
  return ok(res, null, 'Status produk unggulan diperbarui.');
});

module.exports = router;

const express = require('express');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// PUBLIK: halaman katalog / toko mini milik satu UMKM, dibagikan sebagai link ke WA/medsos
// Contoh: GET /api/katalog/:userId
router.get('/:userId', (req, res) => {
  const user = db.prepare('SELECT id, nama_usaha, nama_pemilik, desa, no_wa, foto_profil_url, alamat FROM users WHERE id = ? AND is_active = 1').get(req.params.userId);
  if (!user) return fail(res, 'Toko tidak ditemukan.', 404);

  const produk = db
    .prepare('SELECT id, nama, kategori, deskripsi, harga_jual, satuan, foto_url FROM products WHERE user_id = ? AND is_published = 1 AND is_active = 1 ORDER BY nama ASC')
    .all(user.id);

  return ok(res, {
    toko: user,
    link_whatsapp_order: `https://wa.me/${user.no_wa}`,
    link_katalog: `${process.env.APP_URL || ''}/katalog/${user.id}`,
    produk,
  });
});

// Toggle tampil/tidaknya produk di katalog (perlu login)
router.patch('/produk/:id/publish', authRequired, (req, res) => {
  const { is_published } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!product) return fail(res, 'Produk tidak ditemukan.', 404);
  db.prepare(`UPDATE products SET is_published = ?, updated_at = datetime('now') WHERE id = ?`).run(is_published ? 1 : 0, product.id);
  return ok(res, db.prepare('SELECT * FROM products WHERE id = ?').get(product.id), 'Status katalog diperbarui.');
});

module.exports = router;

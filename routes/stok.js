const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// Tambah produk baru
router.post('/produk', (req, res) => {
  const { nama, kategori, deskripsi, harga_modal, harga_jual, satuan, stok, stok_minimum, foto_url, is_published, device_id, local_id } = req.body;
  if (!nama) return fail(res, 'Nama produk wajib diisi.');

  const id = nanoid();
  db.prepare(
    `INSERT INTO products (id, user_id, nama, kategori, deskripsi, harga_modal, harga_jual, satuan, stok, stok_minimum, foto_url, is_published, device_id, local_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, req.user.id, nama, kategori || null, deskripsi || null,
    harga_modal || 0, harga_jual || 0, satuan || 'pcs',
    stok || 0, stok_minimum || 5, foto_url || null,
    is_published ? 1 : 0, device_id || null, local_id || null
  );

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  return ok(res, row, 'Produk ditambahkan.', 201);
});

// Daftar produk milik UMKM
router.get('/produk', (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE user_id = ? AND is_active = 1 ORDER BY nama ASC').all(req.user.id);
  return ok(res, rows);
});

router.put('/produk/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return fail(res, 'Produk tidak ditemukan.', 404);

  const f = { ...existing, ...req.body };
  db.prepare(
    `UPDATE products SET nama=?, kategori=?, deskripsi=?, harga_modal=?, harga_jual=?, satuan=?,
     stok_minimum=?, foto_url=?, is_published=?, is_unggulan=?, updated_at=datetime('now') WHERE id=?`
  ).run(
    f.nama, f.kategori, f.deskripsi, f.harga_modal, f.harga_jual, f.satuan,
    f.stok_minimum, f.foto_url, f.is_published ? 1 : 0, f.is_unggulan ? 1 : 0, req.params.id
  );

  return ok(res, db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id), 'Produk diperbarui.');
});

router.delete('/produk/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return fail(res, 'Produk tidak ditemukan.', 404);
  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
  return ok(res, null, 'Produk dihapus.');
});

// Penyesuaian stok manual (restock / koreksi)
router.post('/produk/:id/movement', (req, res) => {
  const { tipe, jumlah, keterangan } = req.body;
  if (!['masuk', 'keluar', 'penyesuaian'].includes(tipe)) return fail(res, 'tipe movement tidak valid.');
  if (jumlah == null) return fail(res, 'jumlah wajib diisi.');

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!product) return fail(res, 'Produk tidak ditemukan.', 404);

  let stokBaru = product.stok;
  if (tipe === 'masuk') stokBaru += Number(jumlah);
  else if (tipe === 'keluar') stokBaru -= Number(jumlah);
  else stokBaru = Number(jumlah);

  if (stokBaru < 0) return fail(res, 'Stok tidak boleh negatif.');

  const tx = db.transaction(() => {
    db.prepare(`UPDATE products SET stok = ?, updated_at = datetime('now') WHERE id = ?`).run(stokBaru, product.id);
    db.prepare(`INSERT INTO stok_movement (id, product_id, user_id, tipe, jumlah, keterangan) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(nanoid(), product.id, req.user.id, tipe, jumlah, keterangan || null);
  });
  tx();

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
  return ok(res, updated, 'Stok diperbarui.');
});

// Notifikasi produk yang stoknya menipis (dipanggil dashboard, atau bisa dipolling berkala)
router.get('/notifikasi/stok-menipis', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM products WHERE user_id = ? AND is_active = 1 AND stok <= stok_minimum ORDER BY stok ASC')
    .all(req.user.id);
  return ok(res, {
    jumlah_produk_menipis: rows.length,
    produk: rows,
    pesan: rows.length > 0 ? `${rows.length} produk perlu segera di-restock!` : 'Semua stok aman.',
  });
});

router.get('/riwayat/:productId', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM stok_movement WHERE product_id = ? AND user_id = ? ORDER BY created_at DESC')
    .all(req.params.productId, req.user.id);
  return ok(res, rows);
});

module.exports = router;

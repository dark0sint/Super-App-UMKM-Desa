const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

/**
 * MODE OFFLINE — cara kerja:
 * 1. Aplikasi client (mobile/web PWA) tetap menyimpan input transaksi/stok ke local storage/IndexedDB
 *    saat sinyal internet hilang, masing-masing diberi local_id unik oleh device.
 * 2. Saat sinyal kembali, client memanggil endpoint ini dengan daftar data yang menumpuk (batch).
 * 3. Server mengecek local_id di sync_log agar tidak dobel dicatat jika endpoint dipanggil ulang
 *    (idempotent), lalu mengembalikan pemetaan local_id -> server_id supaya client bisa update cache-nya.
 */
router.post('/push', (req, res) => {
  const { device_id, keuangan = [], products = [], kasir_transaksi = [] } = req.body;
  if (!device_id) return fail(res, 'device_id wajib diisi.');

  const mapping = { keuangan: [], products: [], kasir_transaksi: [] };

  const alreadySynced = (entity, local_id) =>
    db.prepare('SELECT server_id FROM sync_log WHERE user_id=? AND device_id=? AND entity=? AND local_id=?')
      .get(req.user.id, device_id, entity, local_id);

  const tx = db.transaction(() => {
    for (const item of keuangan) {
      const existing = alreadySynced('keuangan', item.local_id);
      if (existing) { mapping.keuangan.push({ local_id: item.local_id, server_id: existing.server_id }); continue; }

      const id = nanoid();
      db.prepare(
        `INSERT INTO keuangan (id, user_id, tipe, kategori, jumlah, keterangan, sumber, tanggal, device_id, local_id)
         VALUES (?, ?, ?, ?, ?, ?, 'manual', COALESCE(?, date('now')), ?, ?)`
      ).run(id, req.user.id, item.tipe, item.kategori || 'lainnya', item.jumlah, item.keterangan || null, item.tanggal, device_id, item.local_id);
      db.prepare(`INSERT INTO sync_log (id, user_id, device_id, entity, local_id, server_id) VALUES (?, ?, ?, 'keuangan', ?, ?)`)
        .run(nanoid(), req.user.id, device_id, item.local_id, id);
      mapping.keuangan.push({ local_id: item.local_id, server_id: id });
    }

    for (const item of products) {
      const existing = alreadySynced('products', item.local_id);
      if (existing) { mapping.products.push({ local_id: item.local_id, server_id: existing.server_id }); continue; }

      const id = nanoid();
      db.prepare(
        `INSERT INTO products (id, user_id, nama, kategori, deskripsi, harga_modal, harga_jual, satuan, stok, stok_minimum, foto_url, device_id, local_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, req.user.id, item.nama, item.kategori || null, item.deskripsi || null,
        item.harga_modal || 0, item.harga_jual || 0, item.satuan || 'pcs',
        item.stok || 0, item.stok_minimum || 5, item.foto_url || null, device_id, item.local_id
      );
      db.prepare(`INSERT INTO sync_log (id, user_id, device_id, entity, local_id, server_id) VALUES (?, ?, ?, 'products', ?, ?)`)
        .run(nanoid(), req.user.id, device_id, item.local_id, id);
      mapping.products.push({ local_id: item.local_id, server_id: id });
    }

    for (const item of kasir_transaksi) {
      const existing = alreadySynced('kasir_transaksi', item.local_id);
      if (existing) { mapping.kasir_transaksi.push({ local_id: item.local_id, server_id: existing.server_id }); continue; }

      const id = nanoid();
      const kode = `TRX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${nanoid(6).toUpperCase()}`;
      db.prepare(
        `INSERT INTO kasir_transaksi (id, user_id, kode_transaksi, total, diterima, kembalian, metode_bayar, status, catatan, device_id, local_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'selesai', ?, ?, ?)`
      ).run(id, req.user.id, kode, item.total, item.diterima || null, item.kembalian || null, item.metode_bayar || 'tunai', item.catatan || null, device_id, item.local_id);

      for (const it of item.items || []) {
        db.prepare(`INSERT INTO kasir_items (id, transaksi_id, product_id, nama_produk, harga, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(nanoid(), id, it.product_id || null, it.nama_produk, it.harga, it.qty, it.subtotal);
        if (it.product_id) {
          db.prepare(`UPDATE products SET stok = stok - ? WHERE id = ?`).run(it.qty, it.product_id);
        }
      }

      db.prepare(
        `INSERT INTO keuangan (id, user_id, tipe, kategori, jumlah, keterangan, sumber, ref_id, device_id)
         VALUES (?, ?, 'pemasukan', 'penjualan', ?, ?, 'kasir', ?, ?)`
      ).run(nanoid(), req.user.id, item.total, `Penjualan kasir ${kode} (sinkron offline)`, id, device_id);

      db.prepare(`INSERT INTO sync_log (id, user_id, device_id, entity, local_id, server_id) VALUES (?, ?, ?, 'kasir_transaksi', ?, ?)`)
        .run(nanoid(), req.user.id, device_id, item.local_id, id);
      mapping.kasir_transaksi.push({ local_id: item.local_id, server_id: id });
    }
  });

  tx();

  return ok(res, mapping, 'Sinkronisasi berhasil.');
});

// Client memanggil ini untuk menarik data terbaru dari server (misalnya setelah ganti perangkat)
router.get('/pull', (req, res) => {
  const since = req.query.since || '1970-01-01T00:00:00.000Z';
  const data = {
    keuangan: db.prepare('SELECT * FROM keuangan WHERE user_id = ? AND created_at > ?').all(req.user.id, since),
    products: db.prepare('SELECT * FROM products WHERE user_id = ? AND updated_at > ?').all(req.user.id, since),
    kasir_transaksi: db.prepare('SELECT * FROM kasir_transaksi WHERE user_id = ? AND created_at > ?').all(req.user.id, since),
    server_time: new Date().toISOString(),
  };
  return ok(res, data);
});

module.exports = router;

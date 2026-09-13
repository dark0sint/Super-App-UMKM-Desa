const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/db');
const { ok, fail } = require('../utils/response');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function generateKodeTransaksi() {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `TRX-${ymd}-${nanoid(6).toUpperCase()}`;
}

/**
 * Proses transaksi kasir.
 * body: { items: [{product_id, qty}], metode_bayar, diterima, device_id, local_id }
 * - Otomatis mengurangi stok
 * - Otomatis mencatat ke keuangan (pemasukan, kategori 'penjualan')
 */
router.post('/transaksi', (req, res) => {
  const { items, metode_bayar, diterima, catatan, device_id, local_id } = req.body;
  if (!Array.isArray(items) || items.length === 0) return fail(res, 'items wajib diisi minimal 1 produk.');

  const detailItems = [];
  let total = 0;

  for (const it of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ? AND is_active = 1').get(it.product_id, req.user.id);
    if (!product) return fail(res, `Produk dengan id ${it.product_id} tidak ditemukan.`, 404);
    if (product.stok < it.qty) return fail(res, `Stok "${product.nama}" tidak mencukupi (tersisa ${product.stok}).`);

    const subtotal = product.harga_jual * it.qty;
    total += subtotal;
    detailItems.push({ product, qty: it.qty, subtotal });
  }

  const kode = generateKodeTransaksi();
  const trxId = nanoid();
  const kembalian = metode_bayar === 'tunai' && diterima != null ? diterima - total : null;

  if (metode_bayar === 'tunai' && diterima != null && diterima < total) {
    return fail(res, 'Uang diterima kurang dari total belanja.');
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO kasir_transaksi (id, user_id, kode_transaksi, total, diterima, kembalian, metode_bayar, status, catatan, device_id, local_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'selesai', ?, ?, ?)`
    ).run(trxId, req.user.id, kode, total, diterima || null, kembalian, metode_bayar || 'tunai', catatan || null, device_id || null, local_id || null);

    for (const d of detailItems) {
      db.prepare(
        `INSERT INTO kasir_items (id, transaksi_id, product_id, nama_produk, harga, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(nanoid(), trxId, d.product.id, d.product.nama, d.product.harga_jual, d.qty, d.subtotal);

      db.prepare(`UPDATE products SET stok = stok - ?, updated_at = datetime('now') WHERE id = ?`).run(d.qty, d.product.id);
      db.prepare(
        `INSERT INTO stok_movement (id, product_id, user_id, tipe, jumlah, keterangan) VALUES (?, ?, ?, 'keluar', ?, ?)`
      ).run(nanoid(), d.product.id, req.user.id, d.qty, `Terjual via kasir ${kode}`);
    }

    // Auto-catat ke pembukuan keuangan
    db.prepare(
      `INSERT INTO keuangan (id, user_id, tipe, kategori, jumlah, keterangan, sumber, ref_id)
       VALUES (?, ?, 'pemasukan', 'penjualan', ?, ?, 'kasir', ?)`
    ).run(nanoid(), req.user.id, total, `Penjualan kasir ${kode}`, trxId);
  });

  tx();

  const transaksi = db.prepare('SELECT * FROM kasir_transaksi WHERE id = ?').get(trxId);
  const finalItems = db.prepare('SELECT * FROM kasir_items WHERE transaksi_id = ?').all(trxId);

  return ok(res, { transaksi, items: finalItems }, 'Transaksi berhasil.', 201);
});

router.get('/transaksi', (req, res) => {
  const { dari, sampai } = req.query;
  let query = 'SELECT * FROM kasir_transaksi WHERE user_id = ?';
  const params = [req.user.id];
  if (dari) { query += ' AND date(created_at) >= ?'; params.push(dari); }
  if (sampai) { query += ' AND date(created_at) <= ?'; params.push(sampai); }
  query += ' ORDER BY created_at DESC';
  const rows = db.prepare(query).all(...params);
  return ok(res, rows);
});

router.post('/transaksi/:id/batal', (req, res) => {
  const trx = db.prepare('SELECT * FROM kasir_transaksi WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!trx) return fail(res, 'Transaksi tidak ditemukan.', 404);
  if (trx.status === 'batal') return fail(res, 'Transaksi sudah dibatalkan sebelumnya.');

  const items = db.prepare('SELECT * FROM kasir_items WHERE transaksi_id = ?').all(trx.id);

  const tx = db.transaction(() => {
    for (const it of items) {
      if (it.product_id) {
        db.prepare(`UPDATE products SET stok = stok + ? WHERE id = ?`).run(it.qty, it.product_id);
        db.prepare(
          `INSERT INTO stok_movement (id, product_id, user_id, tipe, jumlah, keterangan) VALUES (?, ?, ?, 'masuk', ?, ?)`
        ).run(nanoid(), it.product_id, req.user.id, it.qty, `Pembatalan transaksi ${trx.kode_transaksi}`);
      }
    }
    db.prepare(`UPDATE kasir_transaksi SET status = 'batal' WHERE id = ?`).run(trx.id);
    db.prepare(`DELETE FROM keuangan WHERE ref_id = ? AND sumber = 'kasir'`).run(trx.id);
  });
  tx();

  return ok(res, null, 'Transaksi dibatalkan, stok & keuangan disesuaikan otomatis.');
});

// Data struk (dipakai untuk cetak via bluetooth printer ESC/POS di app, atau tampil sebagai struk digital)
router.get('/transaksi/:id/struk', (req, res) => {
  const trx = db.prepare('SELECT * FROM kasir_transaksi WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!trx) return fail(res, 'Transaksi tidak ditemukan.', 404);
  const items = db.prepare('SELECT * FROM kasir_items WHERE transaksi_id = ?').all(trx.id);

  return ok(res, {
    toko: { nama_usaha: req.user.nama_usaha, alamat: req.user.alamat, no_wa: req.user.no_wa },
    transaksi: trx,
    items,
    // format teks siap-cetak untuk printer thermal 32/48 kolom (dipakai library ESC/POS di sisi mobile app)
    struk_text: buildStrukText(req.user, trx, items),
    link_struk_digital: `${process.env.APP_URL || ''}/struk/${trx.id}`,
  });
});

function buildStrukText(user, trx, items) {
  const line = '--------------------------------';
  let s = `${user.nama_usaha}\n${user.alamat || ''}\n${line}\n`;
  s += `No: ${trx.kode_transaksi}\nTgl: ${trx.created_at}\n${line}\n`;
  for (const it of items) {
    s += `${it.nama_produk}\n  ${it.qty} x ${it.harga} = ${it.subtotal}\n`;
  }
  s += `${line}\nTOTAL: Rp${trx.total}\n`;
  if (trx.metode_bayar === 'tunai') {
    s += `Tunai: Rp${trx.diterima || 0}\nKembali: Rp${trx.kembalian || 0}\n`;
  } else {
    s += `Metode: QRIS\n`;
  }
  s += `${line}\nTerima kasih!\n`;
  return s;
}

module.exports = router;

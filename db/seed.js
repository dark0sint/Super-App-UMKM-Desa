// Jalankan sekali: node db/seed.js
require('dotenv').config();
const { nanoid } = require('nanoid');
const db = require('./db');

const edukasi = [
  {
    judul: 'Cara Menghitung Untung Rugi Sederhana',
    tipe: 'tips',
    kategori: 'keuangan',
    isi_singkat: 'Untung = Total Penjualan - Total Modal - Biaya Operasional. Catat setiap hari agar tidak lupa.',
    ukuran_kb: 5,
  },
  {
    judul: 'Video: Cara Pakai Kasir Digital UMKM SMART',
    tipe: 'video',
    kategori: 'operasional',
    url_konten: 'https://contoh-cdn-desa.id/video/tutorial-kasir-1.mp4',
    ukuran_kb: 8000,
    durasi_detik: 90,
  },
  {
    judul: 'Tips Foto Produk Pakai HP Biar Menarik',
    tipe: 'tips',
    kategori: 'pemasaran',
    isi_singkat: 'Gunakan cahaya matahari pagi, latar polos, dan ambil foto dari 3 sudut berbeda.',
    ukuran_kb: 4,
  },
];

const insertEdukasi = db.prepare(`INSERT INTO edukasi_konten
  (id, judul, tipe, kategori, isi_singkat, url_konten, ukuran_kb, durasi_detik)
  VALUES (@id, @judul, @tipe, @kategori, @isi_singkat, @url_konten, @ukuran_kb, @durasi_detik)`);

const tx = db.transaction(() => {
  for (const e of edukasi) {
    insertEdukasi.run({
      id: nanoid(),
      judul: e.judul,
      tipe: e.tipe,
      kategori: e.kategori || null,
      isi_singkat: e.isi_singkat || null,
      url_konten: e.url_konten || null,
      ukuran_kb: e.ukuran_kb || null,
      durasi_detik: e.durasi_detik || null,
    });
  }

  db.prepare(`INSERT INTO kurir (id, nama, no_wa, jenis_kendaraan, wilayah_layanan)
    VALUES (?, ?, ?, ?, ?)`).run(nanoid(), 'Pak Joko (Ojek Desa)', '6281200000001', 'motor', 'Desa Sukamaju & sekitarnya');
});

tx();
console.log('Seed data berhasil dimasukkan.');

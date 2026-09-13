const express = require('express');
const { ok, fail } = require('../utils/response');

const router = express.Router();

// Konten panduan bisa dipindah ke DB/CMS nanti; untuk saat ini disusun statis agar cepat dipakai & mudah diubah.
const PANDUAN = {
  nib: {
    judul: 'Cara Membuat NIB (Nomor Induk Berusaha)',
    ringkasan: 'NIB adalah identitas resmi pelaku usaha, gratis dan bisa dibuat sendiri lewat OSS.',
    langkah: [
      { no: 1, judul: 'Siapkan dokumen', detail: 'KTP, NPWP (jika ada), dan nomor HP aktif.' },
      { no: 2, judul: 'Buka situs OSS', detail: 'Akses oss.go.id lalu buat akun baru menggunakan NIK.' },
      { no: 3, judul: 'Isi data usaha', detail: 'Masukkan nama usaha, bidang usaha (KBLI), alamat, dan modal usaha.' },
      { no: 4, judul: 'Ajukan perizinan berusaha', detail: 'Lengkapi kuesioner risiko usaha yang muncul otomatis di sistem.' },
      { no: 5, judul: 'Unduh NIB', detail: 'Setelah disetujui, NIB dan dokumen izin bisa langsung diunduh dalam bentuk PDF.' },
    ],
    catatan: 'Proses ini gratis. Jika kesulitan, minta pendampingan petugas BUMDes atau pendamping UMKM desa.',
  },
  halal: {
    judul: 'Cara Mengurus Sertifikasi Halal',
    ringkasan: 'Untuk UMKM makanan/minuman, sertifikasi halal bisa lewat jalur Self-Declare (gratis) untuk usaha mikro tertentu.',
    langkah: [
      { no: 1, judul: 'Pastikan kriteria', detail: 'Usaha mikro/kecil, produk tidak berisiko tinggi, proses produksi sederhana dan halal.' },
      { no: 2, judul: 'Daftar akun SIHALAL', detail: 'Buka ptsp.halal.go.id dan buat akun pelaku usaha.' },
      { no: 3, judul: 'Ikuti pendampingan', detail: 'Daftar ke Pendamping Proses Produk Halal (P3H) yang ditunjuk BPJPH, biasanya difasilitasi lewat program desa/dinas koperasi.' },
      { no: 4, judul: 'Isi pernyataan pelaku usaha', detail: 'Lengkapi data bahan baku dan proses produksi di sistem SIHALAL.' },
      { no: 5, judul: 'Tunggu penetapan', detail: 'Sertifikat halal terbit setelah diverifikasi oleh Komite Fatwa/BPJPH.' },
    ],
    catatan: 'Jalur Self-Declare umumnya gratis untuk pelaku usaha mikro yang memenuhi syarat.',
  },
  pirt: {
    judul: 'Cara Membuat Izin P-IRT',
    ringkasan: 'P-IRT (Produksi Industri Rumah Tangga) wajib untuk produk pangan olahan skala rumahan.',
    langkah: [
      { no: 1, judul: 'Siapkan NIB', detail: 'P-IRT terbit setelah pelaku usaha memiliki NIB dari OSS.' },
      { no: 2, judul: 'Ikuti Penyuluhan Keamanan Pangan (PKP)', detail: 'Wajib mengikuti pelatihan yang diadakan Dinas Kesehatan setempat.' },
      { no: 3, judul: 'Pemeriksaan sarana produksi', detail: 'Petugas akan mengecek kelayakan dapur/tempat produksi.' },
      { no: 4, judul: 'Ajukan lewat OSS/Dinas Kesehatan', detail: 'Lengkapi berkas dan ajukan sertifikat P-IRT.' },
      { no: 5, judul: 'Terima nomor P-IRT', detail: 'Nomor P-IRT dicetak pada label kemasan produk.' },
    ],
    catatan: 'Koordinasikan jadwal PKP dan pemeriksaan sarana lewat kantor desa/Puskesmas terdekat.',
  },
};

router.get('/', (req, res) => {
  const list = Object.entries(PANDUAN).map(([slug, v]) => ({ slug, judul: v.judul, ringkasan: v.ringkasan }));
  return ok(res, list);
});

router.get('/:slug', (req, res) => {
  const panduan = PANDUAN[req.params.slug];
  if (!panduan) return fail(res, 'Panduan tidak ditemukan.', 404);
  return ok(res, { slug: req.params.slug, ...panduan });
});

module.exports = router;

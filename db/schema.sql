-- ================================================
-- UMKM SMART - Database Schema (SQLite)
-- ================================================

-- Pelaku UMKM / Pengguna
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  no_wa TEXT UNIQUE NOT NULL,
  nama_pemilik TEXT NOT NULL,
  nama_usaha TEXT NOT NULL,
  desa TEXT,
  kategori_usaha TEXT,
  alamat TEXT,
  foto_profil_url TEXT,
  role TEXT NOT NULL DEFAULT 'umkm',   -- umkm | admin_desa | admin_bumdes | kurir
  device_token TEXT,                   -- untuk gate biometrik lokal (fingerprint) di HP
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- OTP login via WhatsApp (tanpa password)
CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  no_wa TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ KEUANGAN ============
CREATE TABLE IF NOT EXISTS keuangan (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tipe TEXT NOT NULL CHECK(tipe IN ('pemasukan','pengeluaran')),
  kategori TEXT NOT NULL,             -- penjualan, belanja_stok, operasional, gaji, lainnya
  jumlah REAL NOT NULL,
  keterangan TEXT,
  sumber TEXT NOT NULL DEFAULT 'manual',  -- manual | kasir
  ref_id TEXT,                        -- id transaksi kasir jika sumber=kasir
  tanggal TEXT NOT NULL DEFAULT (date('now')),
  device_id TEXT,                     -- untuk keperluan sinkronisasi offline
  local_id TEXT,                      -- id sementara dari client saat offline
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ STOK / PRODUK ============
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  nama TEXT NOT NULL,
  kategori TEXT,
  deskripsi TEXT,
  harga_modal REAL NOT NULL DEFAULT 0,
  harga_jual REAL NOT NULL DEFAULT 0,
  satuan TEXT NOT NULL DEFAULT 'pcs',
  stok REAL NOT NULL DEFAULT 0,
  stok_minimum REAL NOT NULL DEFAULT 5,
  foto_url TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,   -- tampil di katalog & marketplace desa
  is_unggulan INTEGER NOT NULL DEFAULT 0,    -- produk unggulan desa
  is_active INTEGER NOT NULL DEFAULT 1,
  device_id TEXT,
  local_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stok_movement (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK(tipe IN ('masuk','keluar','penyesuaian')),
  jumlah REAL NOT NULL,
  keterangan TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ KASIR / POS ============
CREATE TABLE IF NOT EXISTS kasir_transaksi (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kode_transaksi TEXT UNIQUE NOT NULL,
  total REAL NOT NULL,
  diterima REAL,
  kembalian REAL,
  metode_bayar TEXT NOT NULL DEFAULT 'tunai',  -- tunai | qris
  status TEXT NOT NULL DEFAULT 'selesai',      -- pending | selesai | batal
  catatan TEXT,
  device_id TEXT,
  local_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kasir_items (
  id TEXT PRIMARY KEY,
  transaksi_id TEXT NOT NULL REFERENCES kasir_transaksi(id),
  product_id TEXT,
  nama_produk TEXT NOT NULL,
  harga REAL NOT NULL,
  qty REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- ============ QRIS ============
CREATE TABLE IF NOT EXISTS qris_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  transaksi_id TEXT,                 -- kasir_transaksi.id (opsional)
  qris_ref TEXT NOT NULL,
  qr_string TEXT,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | expired | failed
  provider TEXT NOT NULL DEFAULT 'none',
  expires_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ BUMDES / PERMODALAN ============
CREATE TABLE IF NOT EXISTS bumdes_pengajuan (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  jenis TEXT NOT NULL CHECK(jenis IN ('modal_usaha','pembiayaan_mikro')),
  jumlah_diajukan REAL NOT NULL,
  tenor_bulan INTEGER,
  tujuan_penggunaan TEXT NOT NULL,
  dokumen_pendukung_url TEXT,
  status TEXT NOT NULL DEFAULT 'diajukan',  -- diajukan | ditinjau | disetujui | ditolak | cair
  catatan_admin TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ LOGISTIK DESA ============
CREATE TABLE IF NOT EXISTS kurir (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  no_wa TEXT NOT NULL,
  jenis_kendaraan TEXT,
  wilayah_layanan TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pengiriman (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  transaksi_id TEXT,
  kurir_id TEXT REFERENCES kurir(id),
  alamat_tujuan TEXT NOT NULL,
  penerima TEXT NOT NULL,
  no_wa_penerima TEXT,
  ongkir REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'menunggu_kurir', -- menunggu_kurir | diambil | dikirim | selesai | batal
  catatan TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ EDUKASI ============
CREATE TABLE IF NOT EXISTS edukasi_konten (
  id TEXT PRIMARY KEY,
  judul TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK(tipe IN ('video','tips','artikel')),
  kategori TEXT,
  isi_singkat TEXT,
  url_konten TEXT,
  ukuran_kb INTEGER,          -- perkiraan pemakaian kuota, untuk info ke pengguna
  durasi_detik INTEGER,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ SYNC OFFLINE ============
CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  entity TEXT NOT NULL,        -- keuangan | products | kasir_transaksi
  local_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_keuangan_user ON keuangan(user_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_published ON products(is_published, is_active);
CREATE INDEX IF NOT EXISTS idx_kasir_user ON kasir_transaksi(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pengiriman_user ON pengiriman(user_id, status);

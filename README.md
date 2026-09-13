# UMKM SMART — Super App untuk UMKM Desa

Backend REST API (Node.js + Express + SQLite) lengkap dengan dashboard uji coba, mencakup:

📦 **Operasional** — Keuangan otomatis, Stok + notifikasi menipis, Kasir Digital (POS) + struk
💰 **Pembayaran & Modal** — QRIS, Kemitraan BUMDes (pengajuan modal usaha/pembiayaan mikro)
🚚 **Pemasaran & Logistik** — Katalog digital per UMKM, Pasar Bersama (marketplace desa), Logistik kolektif
💡 **Edukasi** — Panduan perizinan (NIB/Halal/P-IRT), Pojok Belajar hemat kuota
🛠️ **Teknis** — Mode offline (sync), Login tanpa password (WhatsApp OTP + biometrik lokal)

---

## 1. Persiapan

Butuh **Node.js 18+** dan npm di server (VPS Ubuntu/Debian direkomendasikan).

```bash
# Ekstrak proyek, lalu masuk ke folder
cd umkm-smart

# Install dependency
npm install

# Salin file environment dan isi sesuai kebutuhan
cp .env.example .env
nano .env
```

Variabel penting di `.env`:
- `JWT_SECRET` — WAJIB diganti dengan string acak panjang & rahasia (`openssl rand -hex 32`).
- `WA_GATEWAY_PROVIDER` — isi `fonnte`/`wablas` + token untuk kirim OTP asli lewat WhatsApp. Jika dibiarkan `none`, OTP hanya tampil di log server (cocok untuk testing).
- `QRIS_PROVIDER` — isi `midtrans`/`xendit` + kredensial merchant untuk QRIS produksi (uang masuk langsung ke rekening/e-wallet pelaku UMKM). Jika `none`, sistem berjalan mode simulasi.

Database SQLite (`db/umkm_smart.db`) dan seluruh tabel akan **dibuat otomatis** saat server pertama kali dijalankan — tidak perlu setup database manual.

## 2. Jalankan (development)

```bash
npm run dev
# atau
npm start
```

Buka `http://localhost:4000` untuk dashboard uji coba, atau panggil API langsung ke `http://localhost:4000/api/...`.

Isi data contoh (kurir & materi edukasi):
```bash
node db/seed.js
```

## 3. Deploy produksi (contoh: VPS + PM2 + Nginx)

```bash
# Install PM2 sekali saja
npm install -g pm2

# Jalankan aplikasi sebagai service, auto-restart jika crash
pm2 start server.js --name umkm-smart
pm2 save
pm2 startup     # ikuti instruksi yang ditampilkan agar auto-start saat server reboot
```

Contoh konfigurasi Nginx sebagai reverse proxy (`/etc/nginx/sites-available/umkm-smart`):

```nginx
server {
    listen 80;
    server_name umkmsmart.desa-anda.id;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Lalu aktifkan HTTPS gratis dengan Let's Encrypt:
```bash
sudo certbot --nginx -d umkmsmart.desa-anda.id
```

## 4. Struktur Proyek

```
umkm-smart/
├── server.js              # entry point
├── db/
│   ├── schema.sql          # struktur seluruh tabel
│   ├── db.js               # koneksi SQLite + auto-migrate
│   └── seed.js             # data contoh
├── middleware/auth.js       # JWT auth & role guard
├── routes/
│   ├── auth.js              # login WA-OTP & biometrik, tanpa password
│   ├── keuangan.js          # pencatatan & laporan untung-rugi otomatis
│   ├── stok.js              # manajemen stok & notifikasi menipis
│   ├── kasir.js             # POS: transaksi, struk, auto-update stok & keuangan
│   ├── qris.js              # buat & cek status pembayaran QRIS
│   ├── webhook.js           # penerima callback dari PSP (Midtrans/Xendit) di produksi
│   ├── katalog.js           # toko online mini per UMKM
│   ├── marketplace.js       # Pasar Bersama desa
│   ├── logistik.js          # kurir/ojek desa & pengiriman
│   ├── bumdes.js            # pengajuan modal usaha/pembiayaan mikro
│   ├── edukasi.js           # pojok belajar UMKM
│   ├── perizinan.js         # panduan NIB/Halal/P-IRT
│   └── sync.js              # sinkronisasi data mode offline
├── utils/
│   ├── waGateway.js         # adapter pengirim OTP WhatsApp (Fonnte, dll)
│   ├── qrisGateway.js       # adapter QRIS (Midtrans/Xendit, ada mode simulasi)
│   └── response.js
└── public/index.html        # dashboard uji coba semua fitur (opsional, boleh diganti app mobile)
```

## 5. Ringkasan Endpoint

| Modul | Endpoint utama |
|---|---|
| Auth | `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `POST /api/auth/biometric/exchange`, `GET/PUT /api/auth/me` |
| Keuangan | `POST/GET /api/keuangan`, `GET /api/keuangan/laporan/untung-rugi`, `GET /api/keuangan/laporan/harian` |
| Stok | `POST/GET/PUT/DELETE /api/stok/produk`, `POST /api/stok/produk/:id/movement`, `GET /api/stok/notifikasi/stok-menipis` |
| Kasir | `POST /api/kasir/transaksi`, `POST /api/kasir/transaksi/:id/batal`, `GET /api/kasir/transaksi/:id/struk` |
| QRIS | `POST /api/qris/create`, `GET /api/qris/:id/status`, `POST /api/qris/:id/simulate-paid` (mode dev) |
| Webhook | `POST /api/webhook/qris` (dipanggil server PSP di produksi) |
| Katalog | `GET /api/katalog/:userId` (publik), `PATCH /api/katalog/produk/:id/publish` |
| Marketplace | `GET /api/marketplace`, `GET /api/marketplace/desa-list` |
| Logistik | `GET /api/logistik/kurir`, `POST/GET /api/logistik/pengiriman` |
| BUMDes | `POST/GET /api/bumdes/pengajuan`, `GET/PATCH /api/bumdes/admin/pengajuan` (role admin_bumdes) |
| Edukasi | `GET /api/edukasi` (publik) |
| Perizinan | `GET /api/perizinan`, `GET /api/perizinan/:slug` (publik) |
| Sync offline | `POST /api/sync/push`, `GET /api/sync/pull?since=...` |

Semua endpoint (kecuali yang ditandai publik) butuh header:
```
Authorization: Bearer <token>
```

## 6. Yang perlu Anda lengkapi sebelum benar-benar "live" ke masyarakat

Kode ini sudah lengkap secara arsitektur dan fungsional, tapi 2 hal berikut butuh **kredensial resmi milik desa/BUMDes** yang tidak bisa dibuatkan orang lain:

1. **QRIS asli**: daftar sebagai merchant QRIS lewat bank/BUMDes/PSP (Midtrans, Xendit, atau bank pemerintah desa), lalu isi `QRIS_PROVIDER`, `QRIS_MERCHANT_ID`, `QRIS_API_KEY` di `.env`. Kode di `utils/qrisGateway.js` sudah punya kerangka pemanggilan API-nya, tinggal disambungkan.
2. **Gateway WhatsApp OTP**: daftar akun di Fonnte/Wablas (atau provider resmi WhatsApp Business API), isi tokennya di `.env`. Tanpa ini, OTP tetap berfungsi tapi hanya tercetak di log server (untuk uji coba internal).

Selebihnya (keuangan, stok, kasir, katalog, marketplace, logistik, BUMDes, edukasi, perizinan, offline sync, login tanpa password) sudah berfungsi penuh begitu server dijalankan.

## 7. Tentang mode offline

Endpoint API mendukung sinkronisasi (`/api/sync/push` & `/api/sync/pull`), tapi **penyimpanan offline sesungguhnya terjadi di sisi aplikasi client** (mobile app atau PWA) memakai IndexedDB/local storage, lalu dikirim batch ke server saat sinyal kembali. Jika ingin dashboard `public/index.html` ini dijadikan PWA offline, tambahkan Service Worker untuk cache aset + IndexedDB untuk antrian transaksi — silakan sampaikan jika ingin saya buatkan sekalian.

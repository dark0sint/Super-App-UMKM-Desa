require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

require('./db/db'); // inisialisasi & migrasi schema otomatis saat start

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limit global dasar (anti abuse)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'UMKM SMART API berjalan normal.', time: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/keuangan', require('./routes/keuangan'));
app.use('/api/stok', require('./routes/stok'));
app.use('/api/kasir', require('./routes/kasir'));
app.use('/api/qris', require('./routes/qris'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/katalog', require('./routes/katalog'));
app.use('/api/marketplace', require('./routes/marketplace'));
app.use('/api/logistik', require('./routes/logistik'));
app.use('/api/bumdes', require('./routes/bumdes'));
app.use('/api/edukasi', require('./routes/edukasi'));
app.use('/api/perizinan', require('./routes/perizinan'));
app.use('/api/sync', require('./routes/sync'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ UMKM SMART API berjalan di port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

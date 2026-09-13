const jwt = require('jsonwebtoken');
const { fail } = require('../utils/response');
const db = require('../db/db');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 'Token tidak ditemukan. Silakan login.', 401);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.uid);
    if (!user) return fail(res, 'Akun tidak ditemukan atau nonaktif.', 401);
    req.user = user;
    next();
  } catch (err) {
    return fail(res, 'Token tidak valid atau kedaluwarsa.', 401);
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 'Anda tidak memiliki akses untuk aksi ini.', 403);
    }
    next();
  };
}

module.exports = { authRequired, roleRequired };

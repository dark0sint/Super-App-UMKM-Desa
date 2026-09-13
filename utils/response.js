function ok(res, data, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function fail(res, message = 'Terjadi kesalahan', status = 400, errors = null) {
  return res.status(status).json({ success: false, message, errors });
}

module.exports = { ok, fail };

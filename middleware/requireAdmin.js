// Sesi hanya sah selama user-nya masih ada di DB (reset password menghapus sesinya).
export function currentAdmin(req) {
  const id = req.session?.userId;
  if (!id) return null;
  return req.app.locals.db.prepare('SELECT id, username FROM users WHERE id = ?').get(id) ?? null;
}

export function requireAdmin(req, res, next) {
  if (!currentAdmin(req)) return res.status(401).json({ error: 'Silakan login' });
  next();
}

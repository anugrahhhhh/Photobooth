export function requireAdmin(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Silakan login' });
  next();
}

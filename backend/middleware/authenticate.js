const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

function authenticate(req, res, next) {
  let token = req.cookies?.access_token;

  // Fallback: Bearer header
  if (!token) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) token = auth.slice(7);
  }

  // Fallback: query param (for SSE EventSource which can't set headers)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
}

module.exports = authenticate;
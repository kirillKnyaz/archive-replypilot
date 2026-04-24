const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET;

async function authenticate(req, res, next) {
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

  // API token path (long-lived, used by browser extension and other integrations)
  if (token.startsWith('rp_')) {
    try {
      const user = await prisma.user.findUnique({ where: { apiToken: token } });
      if (!user) return res.status(403).json({ error: 'Invalid API token' });
      req.user = { userId: user.id, email: user.email };
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Auth lookup failed' });
    }
  }

  // JWT path (short-lived, used by web app sessions)
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
}

module.exports = authenticate;

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma.js');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Check user exists
router.get('/exists', async (req, res) => {
  const { email } = req.query;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) return res.status(200).json({ exists: true });
    res.status(204).json({ exists: false });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check user' });
  }
});

// POST /register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.trim() === '') {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(400).json({ message: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, password: true },
    });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1d' });

    // 3) Send it as an HTTP-only cookie
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // must be true on HTTPS in prod
      sameSite: 'lax', // if FE and BE are on different top-level domains, use 'none'
      maxAge: 1000 * 60 * 60, // 1 hour
      path: '/',              // send cookie to all routes
      // domain: '.yourdomain.com', // (optional) set in prod if needed
    });

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message});
  }
});

// AUTH check
const authenticate = require('../middleware/authenticate');

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true },
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
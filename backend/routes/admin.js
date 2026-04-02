const router = require('express').Router();
const prisma = require('../lib/prisma.js');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

router.use(async (req, res, next) => {
  if (!ADMIN_EMAIL) return res.status(403).json({ error: 'Admin not configured' });
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { email: true } });
  if (user?.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  next();
});

// GET /api/admin/stats — funnel metrics
router.get('/stats', async (req, res) => {
  try {
    const [users, campaigns, leads, statusCounts] = await Promise.all([
      prisma.user.count(),
      prisma.campaign.count(),
      prisma.lead.count(),
      prisma.lead.groupBy({ by: ['status'], _count: true }),
    ]);

    const byStatus = {};
    for (const row of statusCounts) byStatus[row.status] = row._count;

    res.json({
      users,
      campaigns,
      leads,
      byStatus,
      contacted: byStatus.CONTACTED || 0,
      replied: byStatus.REPLIED || 0,
      won: byStatus.WON || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

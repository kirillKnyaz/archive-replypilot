const router = require('express').Router({ mergeParams: true });
const prisma = require('../lib/prisma');
const { computeNextFollowUp } = require('../service/nextAction');

// POST /api/leads/:id/reaches — log a new reach attempt
router.post('/', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;
  const { channel, result, transcript } = req.body;

  if (!channel || !result) {
    return res.status(400).json({ error: 'channel and result are required' });
  }

  const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const reach = await prisma.reach.create({
    data: {
      leadId,
      campaignId: lead.campaignId || null,
      userId,
      channel,
      result,
      transcript: transcript || null,
    },
  });

  const newReachCount = (lead.followUpCount || 0) + 1;
  const { nextFollowUpAt, suggestedAction } = computeNextFollowUp({ channel, result, reachCount: newReachCount });

  const leadUpdate = {
    lastReachedAt: reach.createdAt,
    followUpCount: { increment: 1 },
    activeChannel: channel,
    nextFollowUpAt,
  };
  if (result === 'NEGATIVE' || result === 'DO_NOT_CONTACT') {
    leadUpdate.lostReason = result;
  }

  await prisma.lead.update({ where: { id: leadId }, data: leadUpdate });

  res.status(201).json({ ...reach, suggestedAction });
});

// GET /api/leads/:id/reaches — list all reaches for a lead, newest first
router.get('/', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;

  const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const reaches = await prisma.reach.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
  });

  res.json(reaches);
});

module.exports = router;

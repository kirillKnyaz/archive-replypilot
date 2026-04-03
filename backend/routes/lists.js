// routes/lists.js
const router = require('express').Router();
const prisma = require('../lib/prisma.js');

// Create a new list
router.post('/', async (req, res) => {
  const userId = req.user.userId;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const list = await prisma.list.create({
      data: { userId, name: name.trim() }
    });
    res.json(list);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'List name already exists' });
    }
    console.error('POST /lists error', e);
    res.status(500).json({ error: 'Failed to create list' });
  }
});

// Get lists 
router.get('/', async (req, res) => {
  const userId = req.user.userId;
  const lists = await prisma.list.findMany({
    where: { userId },
    select: { id: true, name: true }
  });
  res.json(lists);
});

router.post('/subscribe', async (req, res) => {
  const userId = req.user.userId;
  const { listId, leadId } = req.body;

  if (!listId || !leadId) {
    return res.status(400).json({ error: 'List ID and Lead ID are required' });
  }

  try {
    const leadList = await prisma.leadList.create({
      data: {
        leadId,
        listId,
      },
      select: {
        list: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    res.json(leadList);
  } catch (e) {
    console.error('POST /lists/subscribe error', e);
    res.status(500).json({ error: 'Failed to subscribe to list' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  const userId = req.user.userId;
  const { listId, leadId } = req.body;

  if (!listId || !leadId) {
    return res.status(400).json({ error: 'List ID and Lead ID are required' });
  }

  try {
    await prisma.leadList.deleteMany({
      where: {
        leadId,
        listId
      }
    });
    res.json({ success: true });
  } catch (e) {
    console.error('POST /lists/unsubscribe error', e);
    res.status(500).json({ error: 'Failed to unsubscribe from list' });
  }
});

module.exports = router;
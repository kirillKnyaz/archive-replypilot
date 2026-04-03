const router = require('express').Router();
const prisma = require('../lib/prisma.js');
const z = require('zod');

const newMessageSchema = z.object({
  content: z.string().min(1).max(500),
  
});

router.get('/:id', async (req, res) => {
  const leadId = req.params.id;

  try {
    const messages = await prisma.message.findMany({
      where: { leadId: leadId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/:id', async (req, res) => {
  const userId = req.user.id;
  const leadId = req.params.id;
  const { message } = req.body;

  const validation = newMessageSchema.safeParse(message);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid message data', issues: validation.error.issues });
  }

  try {
    const newMessage = await prisma.message.create({
      data: {
        userId: userId,
        leadId: leadId,
        content: message.content ?? '',
        method: message.method ?? 'EMAIL', // Default to EMAIL if not provided
      }
    });
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

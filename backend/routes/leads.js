const router = require('express').Router();
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient();
// import zod
const z = require('zod');

// const prisma = require('../lib/prisma.js');
const { generateTextSearchQueryFromICP } = require('../service/gpt');
const { enrichIdentity } = require('../service/enrichLead/identity');
const { enrichContact } = require('../service/enrichLead/contact');

// all fields optional
const leadManual = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  website: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  tiktok: z.string().optional(),
  location: z.string().optional()
})

router.get('/:id/enrichmentLog/:goal', async (req, res) => {
  const leadId = req.params.id;
  const goal = req.params.goal;
  
  try {
    const log = await prisma.leadEnrichmentLog.findFirst({
      where: { leadId, goal },
      orderBy: { createdAt: 'desc' },
    });
    res.json(log);
  } catch (err) {
    console.log('Error fetching enrichment logs:', err);
    res.status(500).json({ message: 'Failed to fetch enrichment logs', error: err.message });
  }
});

// routes/leads.js
router.patch('/:id', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;
  const data = req.body;

  let keywords = data.keywords;
  if (keywords && typeof keywords === 'string') {
    keywords = keywords
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  } else if (!keywords || keywords.length === 0) {
    keywords = []; // Set to empty array if empty or undefined
  }

  const identityComplete = (
    (data.name !== null && data.name !== undefined && data.name !== '') 
    && (data.type !== null && data.type !== undefined && data.type !== '') 
    && (data.description !== null && data.description !== undefined && data.description !== '') 
    && (data.keywords !== null && data.keywords !== undefined && data.keywords.length > 0)
  );

  const contactComplete = (
    (data.website !== null && data.website !== undefined && data.website !== '') 
    && (data.email !== null && data.email !== undefined && data.email !== '') 
    && (data.phone !== null && data.phone !== undefined && data.phone !== '') 
    && (data.instagram !== null && data.instagram !== undefined && data.instagram !== '') 
    && (data.facebook !== null && data.facebook !== undefined && data.facebook !== '') 
    && (data.tiktok !== null && data.tiktok !== undefined && data.tiktok !== '')
  );

  try {
    const lead = await prisma.lead.update({
      where: { id: leadId, userId },
      data: {
        name: data.name,
        type: data.type,
        description: data.description,
        keywords: keywords,
        website: data.website,
        email: data.email,
        phone: data.phone,
        instagram: data.instagram,
        facebook: data.facebook,
        tiktok: data.tiktok,
        identityComplete,
        contactComplete,
      }
    });

    return res.json(lead);
  } catch (err) {
    console.log('Error updating lead:', err);
    res.status(500).json({ message: 'Failed to update lead', error: err.message });
  }
});

// PATCH /api/leads/:id/status — lightweight status update for review UI
router.patch('/:id/status', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;
  const { status } = req.body;

  const allowed = ['CONTACTED', 'ARCHIVED', 'QUEUED', 'QUALIFIED'];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
  }

  try {
    const lead = await prisma.lead.update({
      where: { id: leadId, userId },
      data: { status },
    });
    return res.json(lead);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update lead status', error: err.message });
  }
});

router.patch('/:id/priority', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;
  const { priority } = req.body;

  try {
    const lead = await prisma.lead.update({
      where: { id: leadId, userId },
      data: { priority },
      include: {
        sources: true,
        lists: { select: {
          id: true,
          list: { select: { id: true, name: true} }
        } }
      }
    });

    const shaped = {
      ...lead,
      lists: lead.lists.map(x => x.list) // [{id, name}]
    };

    return res.json(shaped);
  } catch (err) {
    console.log('Error updating lead priority:', err);
    res.status(500).json({ message: 'Failed to update lead priority', error: err.message });
  }
});

router.get('/', async (req, res) => {
  const userId = req.user.userId;

  try {
    const leads = await prisma.lead.findMany({
      where: { userId },
      include: {
        sources: true,
        lists: { select: {
          id: true,
          list: { select: { id: true, name: true} }
        } }
      }
    });

    const shaped = leads.map(l => ({
      ...l,
      lists: l.lists.map(x => x.list) // [{id, name}]
    }));

    res.json(shaped);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch leads', error: err.message });
  }
});

router.post('/', async (req, res) => {
  const userId = req.user.userId;

  const { name, website, location, additionalData } = req.body;
  if (!name || !location) {
    return res.status(400).json({ message: 'Name and location are required' });
  }

  try {
    let existingLead = null;
    if (additionalData?.placesId) {
      existingLead = await prisma.lead.findUnique({
        where: {
          placesId: additionalData?.placesId,
        }
      })
    } 

    if (existingLead) {
      return res.status(409).json({ message: 'Lead with this Places ID already exists' });
    }

    const lead = await prisma.lead.create({
      data: {
        userId,
        name,
        website: website || null,
        location,
        mapsUri: additionalData.googleMapsUri ?? null,
        placesId: additionalData.placesId ?? null,
      },
      include: {
        lists: { select: 
          { list: { select: { id: true, name: true } } }
        }
      }
    });

    const shapedLead = {
      ...lead,
      lists: lead.lists.map(x => x.list) // [{id, name}]
    };

    res.status(201).json(shapedLead);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create lead', error: err.message });
  }
});

// routes/leads.js (delete route)
router.delete('/:id', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;

  try {
    // Auth check: ensure the lead belongs to the user
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, userId },
    });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    await prisma.$transaction([
      prisma.leadSource.deleteMany({ where: { leadId } }),
      prisma.leadList.deleteMany({ where: { leadId } }),            
      prisma.leadEnrichmentLog.deleteMany({ where: { leadId } }),
      prisma.lead.delete({ where: { id: leadId } }),
    ]);

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete lead', error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;

  try {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, userId },
      include: {
        campaign: { select: { id: true, name: true, vertical: true, offer: true } },
        sources: true,
      },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch lead', error: err.message });
  }
});

router.patch('/:id/message', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;
  const { generatedMessage } = req.body;

  try {
    const lead = await prisma.lead.update({
      where: { id: leadId, userId },
      data: { generatedMessage },
    });
    return res.json(lead);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update message', error: err.message });
  }
});

router.get('/generateQuery', async (req, res) => {
  const userId = req.user.userId;

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile?.icpSummary) {
    return res.status(400).json({ error: 'No ICP summary found' });
  }

  try {
    const query = await generateTextSearchQueryFromICP(profile.icpSummary);
    res.json({ query });
  } catch (err) {
    console.error('Error generating search query:', err);
    res.status(500).json({ error: 'Failed to generate search query' });
  }
})

router.post('/:id/enrich/identity', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;

  try{
    const { updatedLead, gptEval } = await enrichIdentity({
      userId,
      leadId,
    });

    return res.json({ updatedLead, gptEval });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to enrich identity', error: error.message });
  }
})

router.post('/:id/enrich/contact', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;

  try {
    const { updatedLead, eval } = await enrichContact({
      userId,
      leadId,
    });

    return res.json({ updatedLead, eval });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to enrich contact', error: error.message });
  }
})

router.post('/:id/enrich/social', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;

  try {
    const updatedLead = await enrichSocial({
      userId,
      leadId,
    });

    return res.json({ updatedLead });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to enrich social', error: error.message });
  }
})

router.get('/:id/enrich/status/:goal', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;
  const goal = req.params.goal;

  try {
    const log = await getLatestLog({ userId, leadId, goal });
    res.json({ log });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch enrichment status', error: error.message });
  }
})

module.exports = router;
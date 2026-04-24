const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma.js');
const z = require('zod');
const { enrichIdentity } = require('../service/enrichLead/identity');
const { enrichContact } = require('../service/enrichLead/contact');
const { fetchPlaceDetails } = require('../service/searchPlaces');

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

router.patch('/bulk-status', async (req, res) => {
  const userId = req.user.userId;
  const { ids, status } = req.body;

  const allowed = ['CONTACTED', 'REPLIED', 'WON', 'ARCHIVED', 'QUEUED', 'QUALIFIED'];
  if (!status || !allowed.includes(status) || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    await prisma.lead.updateMany({
      where: { id: { in: ids }, userId },
      data: { status },
    });
    res.json({ updated: ids.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed to bulk update status', error: err.message });
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

  const allowed = ['CONTACTED', 'REPLIED', 'WON', 'ARCHIVED', 'QUEUED', 'QUALIFIED'];
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

router.delete('/bulk', async (req, res) => {
  const userId = req.user.userId;
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }

  try {
    const owned = await prisma.lead.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true },
    });
    const ownedIds = owned.map(l => l.id);

    await prisma.$transaction([
      prisma.leadSource.deleteMany({ where: { leadId: { in: ownedIds } } }),
      prisma.leadList.deleteMany({ where: { leadId: { in: ownedIds } } }),
      prisma.leadEnrichmentLog.deleteMany({ where: { leadId: { in: ownedIds } } }),
      prisma.lead.deleteMany({ where: { id: { in: ownedIds } } }),
    ]);

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: 'Failed to bulk delete leads', error: err.message });
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


// POST /api/leads/:id/rescrape
// Step 1: pull fresh phone/website from Google Places.
// Step 2: re-run website contact scrape to pick up email/facebook.
router.post('/:id/rescrape', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;

  const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  // Step 1 — Google Places refresh
  if (lead.placesId) {
    try {
      const place = await fetchPlaceDetails(lead.placesId);
      const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || null;
      const updates = {};
      if (phone) updates.phone = phone;
      if (place.websiteUri && !lead.website) updates.website = place.websiteUri;
      if (Object.keys(updates).length > 0) {
        await prisma.lead.update({ where: { id: leadId }, data: updates });
      }
    } catch (e) {
      console.error('[rescrape] Places fetch failed:', e.message);
    }
  }

  // Step 2 — website contact scrape (email, facebook)
  try {
    await enrichContact({ userId, leadId });
  } catch (e) {
    console.error('[rescrape] Contact scrape failed:', e.message);
  }

  const updated = await prisma.lead.findFirst({ where: { id: leadId, userId } });
  return res.json(updated);
});

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

// POST /:id/maps-data — receive scraped Google Maps listing data from the browser extension
router.post('/:id/maps-data', async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;

  const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const {
    reviewCount, reviewAvg, reviewSamples, photoCount,
    hoursText, attributes, ownerClaimed, ownerResponseRate,
  } = req.body;

  const data = { lastMapsSyncAt: new Date() };
  if (reviewCount !== undefined) data.reviewCount = reviewCount;
  if (reviewAvg !== undefined) data.reviewAvg = reviewAvg;
  if (reviewSamples !== undefined) data.reviewSamples = reviewSamples;
  if (photoCount !== undefined) data.photoCount = photoCount;
  if (hoursText !== undefined) data.hoursText = hoursText;
  if (Array.isArray(attributes)) data.attributes = attributes;
  if (ownerClaimed !== undefined) data.ownerClaimed = ownerClaimed;
  if (ownerResponseRate !== undefined) data.ownerResponseRate = ownerResponseRate;

  try {
    const updated = await prisma.lead.update({ where: { id: leadId }, data });
    return res.json(updated);
  } catch (err) {
    console.error('POST /maps-data error:', err);
    res.status(500).json({ error: 'Failed to save maps data' });
  }
});

// POST /:id/maps-screenshot — vision-model fallback when DOM scraping misses fields
router.post('/:id/maps-screenshot', express.json({ limit: '10mb' }), async (req, res) => {
  const userId = req.user.userId;
  const leadId = req.params.id;

  const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const { screenshotBase64, missingFields } = req.body;
  if (!screenshotBase64 || !Array.isArray(missingFields) || missingFields.length === 0) {
    return res.status(400).json({ error: 'screenshotBase64 and missingFields required' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const fieldList = missingFields.join(', ');
    const prompt = `You are looking at a Google Maps listing for a business. Extract ONLY these fields from the image: ${fieldList}.

Return STRICT JSON with these keys (use null for any field you cannot determine):
{
  "reviewCount": <integer or null>,
  "reviewAvg": <float 0-5 or null>,
  "photoCount": <integer or null>,
  "hoursText": <string or null>,
  "ownerClaimed": <boolean or null>
}

Only include keys from the requested missing fields list. Return nothing else.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const raw = response.content[0].text.trim();
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(500).json({ error: 'Failed to parse vision response', raw });
    }

    // Persist only the fields that came back non-null and were in the missing list
    const data = { lastMapsSyncAt: new Date() };
    for (const field of missingFields) {
      if (parsed[field] !== undefined && parsed[field] !== null) {
        data[field] = parsed[field];
      }
    }

    const updated = await prisma.lead.update({ where: { id: leadId }, data });
    return res.json({ updated, filled: Object.keys(data).filter(k => k !== 'lastMapsSyncAt') });
  } catch (err) {
    console.error('POST /maps-screenshot error:', err);
    res.status(500).json({ error: 'Vision fallback failed', detail: err.message });
  }
});


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
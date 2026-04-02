const router = require("express").Router();
const prisma = require("../lib/prisma");

const { routeAndExtract } = require("../service/campaignSetup/routeGpt");
const { handleMetaFlow } = require("../service/campaignSetup/metaFlow");
const { pickNextSlot, isSetupComplete, progress } = require("../service/campaignSetup/slotPicker");
const { REQUIRED_SLOTS } = require("../service/campaignSetup/steps");
const { runCampaign } = require("../service/campaignRunner");
const { startRun, emitEvent, endRun, getActiveRun, addListener, removeListener } = require("../service/runTracker");

// ── Helpers ──

const ALLOWED_FIELDS = new Set(REQUIRED_SLOTS);

/** Build a Prisma-safe update object from the campaign_delta. */
function buildColumnUpdate(delta) {
  if (!delta) return {};
  const out = {};
  for (const [k, v] of Object.entries(delta)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (v === null || v === undefined) {
      out[k] = null;
      continue;
    }
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

// ── CRUD ──

// POST /api/campaigns — create a new campaign (name only, starts setup)
router.post("/", async (req, res) => {
  const userId = req.user.userId;
  const { name } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Campaign name is required" });
  }

  // Enforce campaign limit for free tier
  const campaignCount = await prisma.campaign.count({ where: { userId } });
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const maxCampaigns = sub?.stripeId?.startsWith("free_") ? 3 : 50;
  if (campaignCount >= maxCampaigns) {
    return res.status(403).json({ error: `Campaign limit reached (${maxCampaigns})` });
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      name: name.trim(),
      vertical: "",
      location: "",
      offer: "",
    },
  });

  res.status(201).json(campaign);
});

// GET /api/campaigns/review/queued — all QUEUED leads across all campaigns (for dashboard)
// Must be BEFORE /:id routes to avoid matching "review" as a campaign ID
router.get("/review/queued", async (req, res) => {
  const leads = await prisma.lead.findMany({
    where: { userId: req.user.userId, status: "QUEUED" },
    include: { campaign: { select: { id: true, name: true } } },
    orderBy: { id: "desc" },
  });
  res.json(leads);
});

// GET /api/campaigns — list user's campaigns
router.get("/", async (req, res) => {
  const campaigns = await prisma.campaign.findMany({
    where: { userId: req.user.userId },
    orderBy: { id: "desc" },
    include: { _count: { select: { leads: true, runs: true } } },
  });
  res.json(campaigns);
});

// GET /api/campaigns/:id — single campaign
router.get("/:id", async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
    include: { _count: { select: { leads: true, runs: true } } },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  // Status counts for the campaign header
  const statusCounts = await prisma.lead.groupBy({
    by: ['status'],
    where: { campaignId: campaign.id },
    _count: true,
  });
  const stats = {};
  for (const row of statusCounts) stats[row.status] = row._count;

  res.json({ ...campaign, stats });
});

// PATCH /api/campaigns/:id — update fields (activate/pause, edit config)
router.patch("/:id", async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  // Allow updating: name, active, dailyTarget, and the 6 slot fields
  const { name, active, dailyTarget, ...rest } = req.body;
  const data = {};
  if (name !== undefined) data.name = name;
  if (active !== undefined) {
    // Can only activate if setup is complete
    if (active && !campaign.setupComplete) {
      return res.status(400).json({ error: "Complete campaign setup before activating" });
    }
    data.active = active;
  }
  if (dailyTarget !== undefined) data.dailyTarget = dailyTarget;

  // Allow slot field updates
  const slotUpdate = buildColumnUpdate(rest);
  Object.assign(data, slotUpdate);

  // Recompute setupComplete if slot fields changed
  if (Object.keys(slotUpdate).length > 0) {
    const merged = { ...campaign, ...data };
    data.setupComplete = isSetupComplete(merged);
  }

  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data,
  });
  res.json(updated);
});

// DELETE /api/campaigns/:id
router.delete("/:id", async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  await prisma.campaign.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── Manual Run ──

// POST /api/campaigns/:id/run — start a campaign run, returns immediately
router.post("/:id/run", async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (!campaign.setupComplete) {
    return res.status(400).json({ error: "Complete campaign setup before running" });
  }

  // Check if already running
  const existing = getActiveRun(campaign.id);
  if (existing && existing.running) {
    return res.json({ alreadyRunning: true });
  }

  // Start tracked run in background
  startRun(campaign.id);
  res.json({ started: true });

  // Run async — emitting events to the tracker
  runCampaign(campaign, (event) => {
    emitEvent(campaign.id, event);
  }).finally(() => {
    endRun(campaign.id);
  });
});

// GET /api/campaigns/:id/run/live — SSE stream (connect or reconnect to watch a run)
router.get("/:id/run/live", async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const activeRun = getActiveRun(campaign.id);
  if (!activeRun) {
    return res.status(404).json({ error: "No active run" });
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Replay all buffered events
  for (const event of activeRun.events) {
    res.write(`data: ${JSON.stringify({ type: event.type, ...event.data })}\n\n`);
  }

  // If run already finished, close immediately
  if (!activeRun.running) {
    res.end();
    return;
  }

  // Listen for new events
  const onEvent = (event) => {
    res.write(`data: ${JSON.stringify({ type: event.type, ...event.data })}\n\n`);
    if (event.type === "complete" || event.type === "error") {
      res.end();
    }
  };

  addListener(campaign.id, onEvent);

  req.on("close", () => {
    removeListener(campaign.id, onEvent);
  });
});

// GET /api/campaigns/:id/run/status — check if a run is active (for reconnect on page load)
router.get("/:id/run/status", async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const activeRun = getActiveRun(campaign.id);
  res.json({
    active: !!activeRun,
    running: activeRun?.running ?? false,
    eventCount: activeRun?.events.length ?? 0,
  });
});

// ── Campaign Leads + Runs ──

// GET /api/campaigns/:id/leads — leads for a campaign, optionally filtered by status
router.get("/:id/leads", async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const where = { campaignId: campaign.id };
  if (req.query.status) where.status = req.query.status;

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { id: "desc" },
  });
  res.json(leads);
});

// GET /api/campaigns/:id/runs — run history for a campaign
router.get("/:id/runs", async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const runs = await prisma.campaignRun.findMany({
    where: { campaignId: campaign.id },
    orderBy: { runAt: "desc" },
    take: 20,
  });
  res.json(runs);
});

// ── Setup Chat ──

// GET /api/campaigns/:id/chat — start/resume setup chat
router.get("/:id/chat", async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  if (campaign.setupComplete) {
    return res.json({
      bot: `Campaign "${campaign.name}" is fully configured. You can update any field or activate it.`,
      question: null,
      progress: progress(campaign),
    });
  }

  const nextQ = pickNextSlot(campaign);
  res.json({
    bot: `Let's set up "${campaign.name}". I'll ask you a few questions to configure your campaign.`,
    question: nextQ,
    progress: progress(campaign),
  });
});

// POST /api/campaigns/:id/chat — process a user message in setup chat
router.post("/:id/chat", async (req, res) => {
  const { message, history } = req.body;
  if (!message || (typeof message === "string" && !message.trim())) {
    return res.status(400).json({ error: "Message is required" });
  }

  let campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  // Route + extract via Claude
  const routed = await routeAndExtract({
    userMessage: typeof message === "string" ? message.trim() : message,
    campaign,
    history: history || [],
  });

  // Build column update and persist
  const columnDelta = buildColumnUpdate(routed.campaign_delta);

  // Handle meta-flow reset
  let resetData = {};
  if (routed.intent === "META_FLOW") {
    const meta = handleMetaFlow({ message, campaign });
    if (meta.resetFields) {
      for (const f of meta.resetFields) resetData[f] = "";
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { ...resetData, setupComplete: false },
    });

    return res.json({
      bot: meta.reply,
      question: meta.asked_slot,
      progress: progress(updated),
      campaign: updated,
    });
  }

  // Persist extracted fields
  if (Object.keys(columnDelta).length > 0) {
    campaign = await prisma.campaign.update({
      where: { id: campaign.id },
      data: columnDelta,
    });
  }

  // Check completion and update flag
  const complete = isSetupComplete(campaign);
  if (complete !== campaign.setupComplete) {
    campaign = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { setupComplete: complete },
    });
  }

  const nextQ = pickNextSlot(campaign);

  // Handle different intents
  if (routed.intent === "OFF_TOPIC") {
    return res.json({
      bot: nextQ
        ? `That's outside campaign setup. Let's continue — ${nextQ.prompt}`
        : "That's outside campaign setup, but your campaign is fully configured!",
      question: nextQ,
      progress: progress(campaign),
      campaign,
    });
  }

  if (routed.intent === "ANSWER_SLOT") {
    if (complete) {
      return res.json({
        bot: "Your campaign is fully configured! You can now activate it from the campaign list, or say 'summarize' to review.",
        question: null,
        progress: progress(campaign),
        campaign,
      });
    }
    return res.json({
      bot: nextQ ? `Got it. ${nextQ.prompt}` : "Got it.",
      question: nextQ,
      progress: progress(campaign),
      campaign,
    });
  }

  if (routed.intent === "ASK_QUESTION_IN_SCOPE") {
    // Simple inline answer for campaign setup questions
    return res.json({
      bot: nextQ
        ? `Good question. For campaign setup, focus on what works for your specific vertical. ${nextQ.prompt}`
        : "Good question. Your campaign config looks complete — you can activate it or update any field.",
      question: nextQ,
      progress: progress(campaign),
      campaign,
    });
  }

  // Fallback
  return res.json({
    bot: nextQ ? nextQ.prompt : "Your campaign setup is complete.",
    question: nextQ,
    progress: progress(campaign),
    campaign,
  });
});

module.exports = router;

const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ONBOARDING_STEPS = require('../service/onboarding/steps');
const { routeAndExtract } = require('../service/onboarding/routeGpt'); // GPT: classifier+extractor
const { answerer } = require('../service/onboarding/answererGpt');
const { handleMetaFlow } = require('../service/onboarding/metaFlow');

// ===== Helpers kept local to this file =====
const CATEGORIES = {
  business: ["businessPurpose", "businessOffer", "businessAdvantage", "businessGoals"],
  audience: ["audienceDefinition", "audienceAge", "audienceLocation", "audienceProblem"],
  offer:    ["offerMonetization", "offerPricing", "offerExclusivity", "offerOptions"],
};
const CATEGORY_ORDER = ["business", "audience", "offer"];

// Pick first missing field according to category order
function getNextQuestion(profile) {
  for (const step of ONBOARDING_STEPS) {
    if (!isFilled(profile?.[step.id])) {
      return step;
    }
  }
  return null; // all done
}

function isFilled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

// Merge profile_delta directly into columns we allow
function buildColumnUpdate(delta) {
  console.log("BUILDING COLUMN UPDATE:", JSON.stringify(delta));
  if (!delta) return {};
  const allowed = new Set([
    ...CATEGORIES.business,
    ...CATEGORIES.audience,
    ...CATEGORIES.offer
  ]);

  const out = {};
  for (const [k, v] of Object.entries(delta)) {
    if (!allowed.has(k)) continue;
    if (v === null || v === undefined) { out[k] = null; continue; }
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

// After update, recompute completion flags
function computeCompletionFlags(profile) {
  const allFilled = (keys) => keys.every(k => isFilled(profile?.[k]));
  return {
    businessComplete: allFilled(CATEGORIES.business),
    audienceComplete: allFilled(CATEGORIES.audience),
    offerComplete:    allFilled(CATEGORIES.offer),
  };
}

function progress(profile) {
  const all = [...CATEGORIES.business, ...CATEGORIES.audience, ...CATEGORIES.offer];
  const known = all.filter(k => isFilled(profile?.[k])).length;
  return { requiredKnown: known, requiredTotal: all.length };
}

// ====== ROUTES ======

// GET /onboarding/start — idempotent, no GPT, just say where we are and ask next
router.get('/start', async (req, res) => {
  const userId = req.user.userId;

  // ensure a profile row exists (optional: create on first visit)
  let userProfile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!userProfile) {
    userProfile = await prisma.userProfile.create({ data: { userId } });
  }

  const allDone =
    userProfile.offerComplete &&
    userProfile.businessComplete &&
    userProfile.audienceComplete;

  if (allDone) {
    return res.json({
      bot: "Welcome back! You've completed all onboarding steps. Ask me anything about pricing, channels, or scripts.",
      progress: progress(userProfile),
      question: null
    });
  }

  const nextQ = getNextQuestion(userProfile);
  if (nextQ) {
    return res.json({
      bot: `Welcome back! Let’s continue.`,
      progress: progress(userProfile),
      question: { id: nextQ.id, prompt: nextQ.prompt, category: nextQ.category, type: nextQ.type ?? "text" }
    });
  }

  // If flags aren’t set but everything is filled, we still consider it done:
  return res.json({
    bot: "Welcome! I am OnboardingPilot. Ready to finish your setup.",
    progress: progress(userProfile),
    question: null
  });
});

// POST /onboarding/answer — run router+extractor, merge into columns, return next step or tailored guidance hook
router.post('/answer', async (req, res) => {
  const userId = req.user.userId;
  const { answer } = req.body;
  if (!answer || (typeof answer === "string" && answer.trim() === '')) {
    return res.status(400).json({ error: "Invalid answer" });
  }

  // load profile + tiny history
  let userProfile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!userProfile) userProfile = await prisma.userProfile.create({ data: { userId } });

  // This is your single GPT call for the turn
  const routed = await routeAndExtract({
    userMessage: typeof answer === "string" ? answer.trim() : answer,
    profile: userProfile,
    history: [] // plug your conversation turns if you keep them
  });

  console.log("ROUTED:", JSON.stringify(routed));

  // Build column update and persist (atomic)
  const columnDelta = buildColumnUpdate(routed.profile_delta);
  let updated;
  await prisma.$transaction(async (tx) => {
    // Write fields
    const afterFields = await tx.userProfile.update({
      where: { userId },
      data: columnDelta
    });

    // Recompute completion flags using the *merged* picture:
    const mergedView = { ...afterFields, ...columnDelta }; // rough view; reload for full correctness
    const flags = computeCompletionFlags(mergedView);

    updated = await tx.userProfile.update({
      where: { userId },
      data: flags
    });
  });

  // Decide what to do next (deterministic)
  const nextQ = getNextQuestion(updated);
  const allDone =
    updated.offerComplete &&
    updated.businessComplete &&
    updated.audienceComplete;

  if (routed.intent === "OFF_TOPIC") {
    return res.json({
      bot: nextQ
        ? `That’s outside our current objective (define your offer & ICP). ${nextQ.prompt}`
        : "That’s outside our current objective (define your offer & ICP). Ask me about pricing, channels, or scripts.",
      question: nextQ ? { id: nextQ.id, prompt: nextQ.prompt, category: nextQ.category, type: nextQ.type ?? "text" } : null,
      progress: progress(updated)
    });
  }

  // When user filled a slot (ANSWER_SLOT), just ack + ask next (no second GPT call)
  if (routed.intent === "ANSWER_SLOT") {
    if (allDone) {
      return res.json({
        bot: "Nice — your essentials are captured. Ask a question (pricing, channels, scripts) or say 'summarize'.",
        question: null,
        progress: progress(updated)
      });
    }
    return res.json({
      bot: nextQ ? `Got it. ${nextQ.prompt}` : "Got it.",
      question: nextQ ? { id: nextQ.id, prompt: nextQ.prompt, category: nextQ.category, type: nextQ.type ?? "text" } : null,
      progress: progress(updated)
    });
  }

  if (routed.intent === "ASK_QUESTION_IN_SCOPE" && !nextQ) {
    const reply = await answerer({ topic: routed.user_question_topic || "general", profile: updated, history: [] });
    return res.json({
      bot: reply,
      question: null,
      progress: progress(updated)
    });
  }

  if (routed.intent === "META_FLOW") {
    const out = await handleMetaFlow({ message: answer, profile: updated });
    return res.json({
      bot: out.reply,
      question: out.asked_slot,
      progress: progress(updated)
    });
}

  // Fallback: ask next or declare done
  if (allDone) {
    return res.json({
      bot: "All set. Ask anything in-scope or say 'summarize' to see your profile.",
      question: null,
      progress: progress(updated)
    });
  }
  return res.json({
    bot: nextQ ? nextQ.prompt : "What would you like to cover next?",
    question: nextQ ? { id: nextQ.id, prompt: nextQ.prompt, category: nextQ.category, type: nextQ.type ?? "text" } : null,
    progress: progress(updated)
  });
});

module.exports = router;

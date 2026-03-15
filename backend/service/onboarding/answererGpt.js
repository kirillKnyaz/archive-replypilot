// service/onboarding/answerer.js
// GPT #2 used ONLY when intent === ASK_QUESTION_IN_SCOPE and required fields are known.

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * @typedef {{ role: 'user'|'assistant', text: string }} Turn
 * @typedef {{
 *   topic: string,                 // e.g., "pricing", "channels", "scripts", "bundles"
 *   profile: Record<string, any>,  // your column-only UserProfile row
 *   history?: Turn[]               // last few turns (4–6)
 * }} AnswerArgs
 */

/**
 * Generate a concise, tactical answer grounded ONLY in the profile + short chat window.
 * Returns a string.
 * @param {AnswerArgs} args
 */
async function answerer({ topic, profile, history = [] }) {
  const t = (topic || "").toLowerCase();

  // Hard guard: if crucial fields are missing, make the dependency explicit.
  const missing = requiredForTopic(t).filter(k => !isFilled(profile?.[k]));
  if (missing.length) {
    const humanList = missing.map(k => humanizeField(k)).join(", ");
    return `I need one detail before giving a proper ${topic} answer: ${humanList}.`;
  }

  const SYSTEM = [
    "You are a senior growth consultant answering with concise, tactical guidance.",
    "GROUNDING RULES:",
    "- Use ONLY the provided business profile and the last few turns.",
    "- If something is unknown, do not invent it.",
    "- Prefer concrete steps, short bullets, small formulas, and immediate actions.",
    "- Keep the answer 3–7 lines. No fluff.",
    "",
    "FORMAT:",
    "- Start with the direct recommendation.",
    "- Add 2–4 crisp bullets (how to execute, simple numbers).",
    "- End with one Next step line."
  ].join("\n");

  const rubric = rubricForTopic(t, profile);
  const profileBlock = prettyProfile(profile);
  const shortHistory = (history || [])
    .slice(-6)
    .map(turn => `${turn.role}: ${String(turn.text || "").trim()}`)
    .join("\n");

  const USER = [
    "=== PROFILE ===",
    profileBlock,
    "\n=== RECENT TURNS (most recent last) ===",
    shortHistory || "(none)",
    "\n=== TOPIC ===",
    t || "general",
    "\n=== RUBRIC (guidance to tailor the answer) ===",
    rubric
  ].join("\n");

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: "user", content: USER }],
  });

  const out = resp.content?.[0]?.text?.trim();
  return out || "Here’s a concise recommendation based on what you’ve shared.";
}

// ---------- Topic helpers ----------

/** Which fields must be known to answer confidently per topic */
function requiredForTopic(topic) {
  switch (topic) {
    case "pricing":
    case "pricing bundles":
    case "bundles":
      return ["businessOffer", "audienceDefinition"]; // optionally audienceAge/Location
    case "channels":
    case "outreach":
    case "lead gen":
      return ["businessOffer", "audienceDefinition"];
    case "scripts":
    case "copy":
    case "messaging":
      return ["businessOffer", "audienceProblem", "audienceDefinition"];
    case "positioning":
    case "offer design":
      return ["businessOffer", "businessAdvantage", "audienceProblem"];
    default:
      // generic: require at least offer + audience
      return ["businessOffer", "audienceDefinition"];
  }
}

/** Human-friendly labels for missing fields */
function humanizeField(key) {
  const map = {
    businessPurpose: "business purpose",
    businessOffer: "your main offer",
    businessAdvantage: "your unique advantage",
    businessGoals: "your main business goals",
    audienceDefinition: "who your ideal client is",
    audienceAge: "audience age range",
    audienceLocation: "audience location",
    audienceProblem: "the main problem your audience faces",
    offerMonetization: "how you monetize the offer",
    offerPricing: "your pricing approach",
    offerExclusivity: "who it’s exclusive to (if any)",
    offerOptions: "the options/tiers you’ll offer"
  };
  return map[key] || key;
}

function isFilled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

/** Rubrics nudge the model to be concrete for each topic */
function rubricForTopic(topic, profile) {
  const offer = safe(profile.businessOffer);
  const avg = safe(profile.offerPricing) || safe(profile.businessGoals); // soft hint
  switch (topic) {
    case "pricing":
    case "pricing bundles":
    case "bundles":
      return [
        "- Recommend a price or range using 3 anchors: Core, Bundle, Premium.",
        "- Use a simple formula (e.g., Premium ≈ 1.6–2.0 × Core).",
        "- Tie to the audience’s main problem and perceived ROI.",
        "- Suggest one fast way to validate (e.g., 5 paid trials this week).",
        `- Offer context: Offer='${offer}'.`
      ].join("\n");
    case "channels":
    case "outreach":
    case "lead gen":
      return [
        "- Recommend 2 channels only: one outbound, one inbound.",
        "- Specify weekly activity targets (e.g., 30 DMs, 2 posts).",
        "- Include a qualifying line for the ICP and a CTA to booked call.",
        `- Offer context: Offer='${offer}'.`
      ].join("\n");
    case "scripts":
    case "copy":
    case "messaging":
      return [
        "- Provide a 3-line cold opener (Pain → Proof → CTA).",
        "- Include ONE personalization token placeholder.",
        "- Keep to 50–80 words total.",
        `- Offer context: Offer='${offer}'.`
      ].join("\n");
    case "positioning":
    case "offer design":
      return [
        "- Write a one-sentence positioning statement (For… who…, we…, unlike…).",
        "- Add two bullets: 'Best for' and 'Not for'.",
        "- Suggest one differentiator to highlight on the site."
      ].join("\n");
    default:
      return [
        "- Provide one direct recommendation.",
        "- Add 2–3 bullets with concrete steps and a simple metric.",
        "- End with 'Next step: …' that can be done today."
      ].join("\n");
  }
}

function safe(v) { return (v == null ? "" : String(v)).trim(); }

function prettyProfile(p) {
  const keys = [
    "businessPurpose","businessOffer","businessAdvantage","businessGoals",
    "audienceDefinition","audienceAge","audienceLocation","audienceProblem",
    "offerMonetization","offerPricing","offerExclusivity","offerOptions"
  ];
  const lines = keys
    .map(k => p?.[k] ? `• ${k}: ${String(p[k])}` : null)
    .filter(Boolean);
  return lines.length ? lines.join("\n") : "(empty)";
}

module.exports = { answerer };
// service/campaignSetup/routeGpt.js
// Claude-based intent classifier + field extractor for campaign setup chat.

const Anthropic = require("@anthropic-ai/sdk");
const { CampaignRouterOutputZ } = require("../../schemas/campaignRouterSchema");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Classify user intent and extract campaign config fields.
 * @param {{ userMessage: string, campaign: object, history: Array }} args
 */
async function routeAndExtract({ userMessage, campaign, history = [] }) {
  const msg = (userMessage ?? "").toString().trim();
  if (!msg) {
    return { intent: "META_FLOW", confidence: 1.0, campaign_delta: {}, user_question_topic: null };
  }

  const trimmedTurns = history
    .slice(-6)
    .map(t => `${t.role === "user" ? "User" : "Assistant"}: ${String(t.text ?? "").trim()}`)
    .join("\n");

  const SYSTEM = [
    "You are a routing + extraction module for a guided campaign setup chat.",
    "The user is setting up a lead-generation campaign. You must classify their intent and extract campaign fields.",
    "Return STRICT JSON ONLY matching the schema below.",
    "",
    "Intents:",
    "- ANSWER_SLOT: user is providing a value for one of the campaign fields",
    "- ASK_QUESTION_IN_SCOPE: user is asking a relevant question about campaign setup",
    "- OFF_TOPIC: user message is unrelated to campaign setup",
    "- META_FLOW: user wants to go back, restart, summarize, or navigate",
    "",
    "Extract ONLY these fields when explicitly present and unambiguous:",
    "- vertical: type of business being targeted (e.g. restaurants, hair salons)",
    "- location: geographic area (e.g. Bristol, UK)",
    "- offer: what's being pitched to the businesses",
    "- angle: specific problem being solved for this vertical",
    "- qualifier: what makes a business a BAD fit (filter criteria)",
    "- goodFitSignals: what makes a business a GOOD fit (positive signals to score higher)",
    "- tone: message style — casual, professional, or direct",
    "",
    "If a field should be cleared, set it to null. Never invent values.",
    "If the user asked a relevant question, set user_question_topic to a short noun phrase.",
    "",
    "JSON schema: { intent, confidence (0-1), campaign_delta: { vertical?, location?, offer?, angle?, qualifier?, tone? }, user_question_topic: string|null }",
  ].join("\n");

  const USER_BLOCK = [
    "=== CAMPAIGN CONFIG (current) ===",
    JSON.stringify(campaign || {}, null, 2),
    "\n=== RECENT TURNS (most recent last) ===",
    trimmedTurns || "(none)",
    "\n=== NEW USER MESSAGE ===",
    msg,
    "\n=== TASK ===",
    "Return STRICT JSON conforming to the schema.",
  ].join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: "user", content: USER_BLOCK }],
  });

  const raw = response.content[0].text ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    parsed = {};
  }

  const safe = CampaignRouterOutputZ.safeParse(parsed);
  if (!safe.success) {
    return { intent: "ANSWER_SLOT", confidence: 0.5, campaign_delta: {}, user_question_topic: null };
  }
  return safe.data;
}

module.exports = { routeAndExtract };

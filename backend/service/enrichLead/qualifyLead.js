// service/enrichLead/qualifyLead.js
// Claude evaluates a lead's ICP fit against the campaign config.
// Returns icpFitScore (0-10), icpFitReason, inactiveSuspected.

const Anthropic = require("@anthropic-ai/sdk");
const prisma = require("../../lib/prisma");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Score a lead 0-10 for campaign fit using Claude Haiku.
 * Updates the lead record with score, reason, and status.
 *
 * @param {{ lead: object, campaign: object }} args
 * @returns {{ icpFitScore: number, icpFitReason: string, inactiveSuspected: boolean, status: string }}
 */
async function qualifyLead({ lead, campaign }) {
  const prompt = [
    "You are a lead qualification AI. Score how well this business fits the campaign.",
    "",
    "=== CAMPAIGN ===",
    `Offer: ${campaign.offer}`,
    `Angle: ${campaign.angle || "not specified"}`,
    `Bad-fit signals (skip if these apply): ${campaign.qualifier || "none"}`,
    `Vertical: ${campaign.vertical}`,
    "",
    "=== BUSINESS ===",
    `Name: ${lead.name}`,
    `Type: ${lead.type || "unknown"}`,
    `Location: ${lead.location}`,
    `Description: ${lead.description || "no description available"}`,
    `Website: ${lead.website || "none"}`,
    `Has email: ${lead.email ? "yes" : "no"}`,
    `Has phone: ${lead.phone ? "yes" : "no"}`,
    `Has social: ${[lead.instagram, lead.facebook, lead.tiktok].filter(Boolean).length > 0 ? "yes" : "no"}`,
    "",
    "=== TASK ===",
    "Return STRICT JSON only:",
    "{",
    '  "score": <0-10, where 10 = clearly needs what we offer>,',
    '  "reason": "<1-2 sentence explanation>",',
    '  "inactive_suspected": <true/false — true if sparse listing, no website, no recent activity>',
    "}",
  ].join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].text.trim();
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    // Fallback: neutral score
    parsed = { score: 5, reason: "Could not evaluate — insufficient data", inactive_suspected: false };
  }

  const icpFitScore = Math.max(0, Math.min(10, parsed.score ?? 5));
  const icpFitReason = parsed.reason || "No reason provided";
  const inactiveSuspected = !!parsed.inactive_suspected;

  // Determine status: score >= 4 → QUALIFIED, else ARCHIVED
  // Low threshold — let borderline leads through for manual review
  const newStatus = icpFitScore >= 4 ? "QUALIFIED" : "ARCHIVED";

  // Check if lead has any contact info
  const hasContact = !!(lead.email || lead.phone || lead.instagram || lead.facebook || lead.tiktok);
  const noContactFound = !hasContact;

  // Update lead
  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      icpFitScore,
      icpFitReason,
      inactiveSuspected,
      noContactFound,
      status: newStatus,
    },
  });

  return {
    icpFitScore,
    icpFitReason,
    inactiveSuspected,
    noContactFound,
    status: newStatus,
  };
}

module.exports = { qualifyLead };

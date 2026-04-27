// service/enrichLead/qualifyLead.js
// Claude evaluates a lead's ICP fit against the campaign config.
// Returns icpFitScore (0-10), icpFitReason, status.

const Anthropic = require("@anthropic-ai/sdk");
const prisma = require("../../lib/prisma");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function qualifyLead({ lead, campaign }) {
  const businessLines = [
    `Name: ${lead.name}`,
    `Type: ${lead.type || "unknown"}`,
    `Location: ${lead.location}`,
    `Description: ${lead.description || "no description available"}`,
  ];

  // Website + quality
  if (lead.website) {
    businessLines.push(`Website: ${lead.website}`);
    if (lead.websiteQuality != null) {
      businessLines.push(`Website quality: ${lead.websiteQuality}/10 — ${lead.websiteQualityReason || ""}`);
    }
  } else {
    businessLines.push(`Website: none`);
  }

  // Google Maps signals
  if (lead.reviewCount != null) {
    let reviewLine = `Google reviews: ${lead.reviewCount} reviews`;
    if (lead.reviewAvg != null) reviewLine += `, ${lead.reviewAvg} avg rating`;
    businessLines.push(reviewLine);
  }
  if (lead.photoCount != null) {
    businessLines.push(`Photos on listing: ${lead.photoCount}`);
  }
  if (lead.ownerClaimed != null) {
    let ownerLine = `Owner: ${lead.ownerClaimed ? "claimed" : "unclaimed"}`;
    if (lead.ownerResponseRate != null) {
      ownerLine += `, ${Math.round(lead.ownerResponseRate * 100)}% review response rate`;
    }
    businessLines.push(ownerLine);
  }

  // Contact presence
  businessLines.push(`Has email: ${lead.email ? "yes" : "no"}`);
  businessLines.push(`Has phone: ${lead.phone ? "yes" : "no"}`);
  businessLines.push(
    `Has social: ${[lead.instagram, lead.facebook, lead.tiktok].filter(Boolean).length > 0 ? "yes" : "no"}`
  );

  // Review snippets (up to 3)
  const samples = Array.isArray(lead.reviewSamples) ? lead.reviewSamples.slice(0, 3) : [];
  if (samples.length > 0) {
    businessLines.push("");
    businessLines.push("Recent reviews:");
    samples.forEach((r) => {
      businessLines.push(`- "${r.text}"${r.rating != null ? ` (${r.rating}/5)` : ""}`);
    });
  }

  const prompt = [
    "You are a lead qualification AI. Score how well this business fits the campaign.",
    "",
    "=== CAMPAIGN ===",
    `Vertical: ${campaign.vertical}`,
    `Offer: ${campaign.offer}`,
    `Angle: ${campaign.angle || "not specified"}`,
    "",
    `GOOD-FIT signals — score HIGHER when these apply:`,
    campaign.goodFitSignals || "not specified",
    "",
    `BAD-FIT signals — score LOWER or skip when these apply:`,
    campaign.qualifier || "none",
    "",
    "=== BUSINESS ===",
    ...businessLines,
    "",
    "=== TASK ===",
    "Score 0-10 where 10 = perfect fit based on the good-fit and bad-fit signals above.",
    'Return STRICT JSON only: { "score": <0-10>, "reason": "<1-2 sentence explanation>" }',
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
    parsed = { score: 5, reason: "Could not evaluate — insufficient data" };
  }

  const icpFitScore = Math.max(0, Math.min(10, parsed.score ?? 5));
  const icpFitReason = parsed.reason || "No reason provided";

  const threshold = campaign.qualifyThreshold ?? 4;
  const newStatus = icpFitScore >= threshold ? "QUALIFIED" : "ARCHIVED";

  const hasContact = !!(lead.email || lead.phone || lead.instagram || lead.facebook || lead.tiktok);

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      icpFitScore,
      icpFitReason,
      noContactFound: !hasContact,
      status: newStatus,
    },
  });

  return { icpFitScore, icpFitReason, noContactFound: !hasContact, status: newStatus };
}

module.exports = { qualifyLead };

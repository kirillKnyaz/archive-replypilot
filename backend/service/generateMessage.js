// service/generateMessage.js
// Claude Sonnet writes a personalised cold outreach message for a qualified lead.

const Anthropic = require("@anthropic-ai/sdk");
const prisma = require("../lib/prisma");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Generate a personalised outreach message for a lead.
 * Stores the message in lead.generatedMessage and sets status to QUEUED.
 *
 * @param {{ lead: object, campaign: object }} args
 * @returns {{ message: string }}
 */
async function generateMessage({ lead, campaign }) {
  const voiceBlock = campaign.voiceExamples?.length
    ? `- Voice examples (match this style):\n${campaign.voiceExamples.map((v) => `  "${v}"`).join("\n")}`
    : "";

  const prompt = [
    "You're writing a cold outreach message for a local business owner.",
    "",
    "Campaign context:",
    `- Offer: ${campaign.offer}`,
    `- Angle: ${campaign.angle || "not specified"}`,
    `- Tone: ${campaign.tone || "professional"}`,
    voiceBlock,
    "",
    "Business:",
    `- Name: ${lead.name}`,
    `- Type: ${lead.type || "local business"}`,
    `- Location: ${lead.location}`,
    `- Description: ${lead.description || "no description available"}`,
    `- Website: ${lead.website || "none"}`,
    lead.icpFitReason ? `- Why they're a fit: ${lead.icpFitReason}` : "",
    "",
    "Write a short (3-5 sentence), personalised cold outreach message.",
    "Lead with something specific about their business — show you've done your homework.",
    "End with a low-friction CTA (e.g. 'Would it be worth a quick chat?').",
    "No subject line. No sign-off. No 'Hi [name]' opener. Just the message body.",
    "Return ONLY the message text, nothing else.",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const message = response.content[0].text.trim();

  // Store message and set status to QUEUED
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      generatedMessage: message,
      status: "QUEUED",
    },
  });

  return { message };
}

module.exports = { generateMessage };

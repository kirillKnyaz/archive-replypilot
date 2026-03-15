// service/campaignSetup/metaFlow.js
// Deterministic handlers for META_FLOW intents during campaign setup.

const { pickNextSlot } = require("./slotPicker");
const { REQUIRED_SLOTS } = require("./steps");

function handleMetaFlow({ message, campaign }) {
  const msg = (message || "").toLowerCase().trim();
  const nextSlot = pickNextSlot(campaign);

  // Back / Undo
  if (/(^|\b)(back|undo|previous)\b/.test(msg)) {
    return {
      reply: nextSlot
        ? `Okay, let's revisit. ${nextSlot.prompt}`
        : "We're at the beginning. Tell me what you'd like to update.",
      asked_slot: nextSlot || null,
    };
  }

  // Restart / Reset
  if (/(restart|reset|start over)/.test(msg)) {
    return {
      reply: "Restarting campaign setup. What type of local business are you targeting?",
      asked_slot: { id: "vertical", prompt: "What type of local business are you targeting?", category: "targeting", type: "text" },
      resetFields: REQUIRED_SLOTS,
    };
  }

  // Summarize / Recap
  if (/summari[sz]e|recap|overview/.test(msg)) {
    return {
      reply: summarizeCampaign(campaign),
      asked_slot: nextSlot || null,
    };
  }

  // What's next?
  if (/what'?s next|next step|continue/.test(msg)) {
    return {
      reply: nextSlot
        ? nextSlot.prompt
        : "All campaign fields are filled. You can activate the campaign or update any field.",
      asked_slot: nextSlot || null,
    };
  }

  // Default fallback
  return {
    reply: nextSlot
      ? `Let's keep going. ${nextSlot.prompt}`
      : "All fields are captured. You can review the summary or activate the campaign.",
    asked_slot: nextSlot || null,
  };
}

function summarizeCampaign(c) {
  const lines = [];
  if (c.vertical) lines.push(`• Vertical: ${c.vertical}`);
  if (c.location) lines.push(`• Location: ${c.location}`);
  if (c.offer) lines.push(`• Offer: ${c.offer}`);
  if (c.angle) lines.push(`• Angle: ${c.angle}`);
  if (c.qualifier) lines.push(`• Bad-fit filter: ${c.qualifier}`);
  if (c.tone) lines.push(`• Tone: ${c.tone}`);
  return lines.length
    ? `Here's your campaign so far:\n${lines.join("\n")}`
    : "We haven't captured anything yet. Let's start — what type of business are you targeting?";
}

module.exports = { handleMetaFlow };

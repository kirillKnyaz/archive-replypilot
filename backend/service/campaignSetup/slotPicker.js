// service/campaignSetup/slotPicker.js
// Picks the next unfilled campaign slot.

const { CAMPAIGN_STEPS, REQUIRED_SLOTS } = require("./steps");

function isFilled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

/** Return the next unfilled slot as a question object, or null if all done. */
function pickNextSlot(campaign) {
  for (const step of CAMPAIGN_STEPS) {
    if (!isFilled(campaign?.[step.id])) {
      return { id: step.id, prompt: step.prompt, category: step.category, type: "text" };
    }
  }
  return null;
}

/** Check if all required slots are filled. */
function isSetupComplete(campaign) {
  return REQUIRED_SLOTS.every(f => isFilled(campaign?.[f]));
}

/** Progress counter for the UI. */
function progress(campaign) {
  const known = REQUIRED_SLOTS.filter(k => isFilled(campaign?.[k])).length;
  return { requiredKnown: known, requiredTotal: REQUIRED_SLOTS.length };
}

module.exports = { pickNextSlot, isSetupComplete, progress, isFilled };

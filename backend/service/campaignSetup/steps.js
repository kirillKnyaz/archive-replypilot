// service/campaignSetup/steps.js
// The 6 slots that define a campaign.

const CAMPAIGN_STEPS = [
  {
    id: "vertical",
    prompt: "What type of local business are you targeting? (e.g. restaurants, hair salons, gyms)",
    category: "targeting",
  },
  {
    id: "location",
    prompt: "What area or city should we search in? (e.g. Bristol, UK)",
    category: "targeting",
  },
  {
    id: "offer",
    prompt: "What are you offering these businesses? (e.g. website redesign, social media management)",
    category: "offer",
  },
  {
    id: "angle",
    prompt: "What specific problem does your offer solve for this vertical? (e.g. 'most restaurant websites are outdated and don't take reservations online')",
    category: "offer",
  },
  {
    id: "qualifier",
    prompt: "What makes a business a BAD fit — when should we skip them? (e.g. 'already has a modern website with online booking')",
    category: "filter",
  },
  {
    id: "goodFitSignals",
    prompt: "What makes a business a GOOD fit? (e.g. 'no website, outdated website, few Google photos, owner-operated')",
    category: "filter",
  },
  {
    id: "tone",
    prompt: "What tone should the outreach messages use? (casual / professional / direct)",
    category: "style",
  },
];

const REQUIRED_SLOTS = ["vertical", "location", "offer", "angle", "qualifier", "tone"];

module.exports = { CAMPAIGN_STEPS, REQUIRED_SLOTS };

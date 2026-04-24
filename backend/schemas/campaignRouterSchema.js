// schemas/campaignRouterSchema.js
const { z } = require("zod");

/**
 * Campaign setup slot-filling schema.
 * Keys match Campaign Prisma columns.
 */

const CampaignDeltaZ = z.object({
  vertical:  z.string().min(1).optional().nullable(),
  location:  z.string().min(1).optional().nullable(),
  offer:     z.string().min(1).optional().nullable(),
  angle:     z.string().min(1).optional().nullable(),
  qualifier:      z.string().min(1).optional().nullable(),
  goodFitSignals: z.string().min(1).optional().nullable(),
  tone:           z.string().min(1).optional().nullable(),
}).strict();

const CampaignRouterOutputZ = z.object({
  intent: z.enum(["ANSWER_SLOT", "ASK_QUESTION_IN_SCOPE", "OFF_TOPIC", "META_FLOW"]),
  confidence: z.number().min(0).max(1),
  campaign_delta: CampaignDeltaZ.default({}),
  user_question_topic: z.string().min(1).nullable().default(null),
}).strict();

module.exports = {
  CampaignDeltaZ,
  CampaignRouterOutputZ,
};

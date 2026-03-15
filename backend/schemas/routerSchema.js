// schemas/routerSchema.js
const { z } = require("zod");

/**
 * IMPORTANT:
 * - Keys MUST match Prisma columns exactly (column-only profile).
 * - Strings are trimmed downstream; use explicit `null` to clear a field.
 * - Keep this schema tiny to make the router cheap & reliable.
 */

// Profile delta limited to your 12 fields (plus future-proof icpSummary optional)
const ProfileDeltaZ = z.object({
  // understanding the business
  businessPurpose:    z.string().min(1).optional().nullable(),
  businessOffer:      z.string().min(1).optional().nullable(),
  businessAdvantage:  z.string().min(1).optional().nullable(),
  businessGoals:      z.string().min(1).optional().nullable(),

  // understanding the audience
  audienceDefinition: z.string().min(1).optional().nullable(),
  audienceAge:        z.string().min(1).optional().nullable(),      // keep string (e.g., "25–45", "18+")
  audienceLocation:   z.string().min(1).optional().nullable(),
  audienceProblem:    z.string().min(1).optional().nullable(),

  // understanding the offer
  offerMonetization:  z.string().min(1).optional().nullable(),      // e.g., "subscription", "one-time"
  offerPricing:       z.string().min(1).optional().nullable(),
  offerExclusivity:   z.string().min(1).optional().nullable(),
  offerOptions:       z.string().min(1).optional().nullable(),

  // we do NOT let the model set *Complete flags directly
  // icpSummary is produced by summarizer; router shouldn't fill it
}).strict();

// Router output: intent + confidence + delta + (optional) topic for Q&A turns
const RouterOutputZ = z.object({
  intent: z.enum(["ANSWER_SLOT", "ASK_QUESTION_IN_SCOPE", "OFF_TOPIC", "META_FLOW"]),
  confidence: z.number().min(0).max(1),
  profile_delta: ProfileDeltaZ.default({}),
  user_question_topic: z.string().min(1).nullable().default(null)
}).strict();

const RouterJsonSchema = {
  name: "router_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "string", enum: ["ANSWER_SLOT", "ASK_QUESTION_IN_SCOPE", "OFF_TOPIC", "META_FLOW"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      user_question_topic: { type: ["string", "null"] },
      profile_delta: {
        type: "object",
        additionalProperties: false,
        properties: {
          businessPurpose: { type: ["string", "null"] },
          businessOffer: { type: ["string", "null"] },
          businessAdvantage: { type: ["string", "null"] },
          businessGoals: { type: ["string", "null"] },
          audienceDefinition: { type: ["string", "null"] },
          audienceAge: { type: ["string", "null"] },
          audienceLocation: { type: ["string", "null"] },
          audienceProblem: { type: ["string", "null"] },
          offerMonetization: { type: ["string", "null"] },
          offerPricing: { type: ["string", "null"] },
          offerExclusivity: { type: ["string", "null"] },
          offerOptions: { type: ["string", "null"] }
        },
        required: [] // profile_delta can be empty object
      }
    },
    required: ["intent", "confidence", "profile_delta", "user_question_topic"]
  }
};

module.exports = {
  ProfileDeltaZ,
  RouterOutputZ,
  RouterJsonSchema,
  /** @typedef {import("zod").infer<typeof RouterOutputZ>} RouterOutput */
};
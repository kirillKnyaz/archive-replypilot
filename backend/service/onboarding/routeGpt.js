// service/onboarding/routeGpt.js
// Campaign setup slot-filling via Claude.
// Classifies user intent and extracts campaign config fields.

const Anthropic = require('@anthropic-ai/sdk');
const { RouterOutputZ } = require('../../schemas/routerSchema');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * @typedef {{ role: 'user'|'assistant', text: string }} Turn
 * @typedef {Object} RouteArgs
 * @property {string} userMessage
 * @property {object} profile - current campaign config (partial)
 * @property {Turn[]} [history]
 */

async function routeAndExtract({ userMessage, profile, history = [] }) {
  const msg = (userMessage ?? '').toString().trim();
  if (!msg) {
    return { intent: 'META_FLOW', confidence: 1.0, profile_delta: {}, user_question_topic: null };
  }

  const trimmedTurns = history.slice(-6)
    .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${String(t.text ?? '').trim()}`)
    .join('\n');

  const SYSTEM = [
    'You are a routing + extraction module for a guided campaign setup chat.',
    'Return STRICT JSON ONLY that matches the provided JSON schema.',
    'Intents: ANSWER_SLOT | ASK_QUESTION_IN_SCOPE | OFF_TOPIC | META_FLOW.',
    'Extract ONLY these fields when explicitly present and unambiguous:',
    'vertical, location, offer, angle, qualifier, tone.',
    'If the user asked a relevant question, set user_question_topic to a short noun phrase.',
    'If OFF_TOPIC, still extract any fields you can; user_question_topic must be null.',
    'If a field should be cleared, set it to null. Never invent values.',
  ].join('\n');

  const USER_BLOCK = [
    '=== CAMPAIGN CONFIG (current) ===',
    JSON.stringify(profile || {}, null, 2),
    '\n=== RECENT TURNS (most recent last) ===',
    trimmedTurns || '(none)',
    '\n=== NEW USER MESSAGE ===',
    msg,
    '\n=== TASK ===',
    'Return STRICT JSON conforming to the schema.',
  ].join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: 'user', content: USER_BLOCK }],
  });

  const raw = response.content[0].text ?? '{}';
  let parsed;
  try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch { parsed = {}; }

  const safe = RouterOutputZ.safeParse(parsed);
  if (!safe.success) {
    return { intent: 'ANSWER_SLOT', confidence: 0.5, profile_delta: {}, user_question_topic: null };
  }
  return safe.data;
}

module.exports = { routeAndExtract };

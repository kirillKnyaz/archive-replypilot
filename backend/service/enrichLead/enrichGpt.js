const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const evaluateIdentityWithGPT = async (rawText, leadInfo = {}) => {
  const prompt = `You are a lead enrichment AI. Analyze the following business data and return a structured summary.

Respond in STRICT JSON only, using this exact format:
{
  "completed": true or false,
  "type": "Business category or niche",
  "description": "One-liner explaining what the business does and for whom",
  "keywords": ["keyword1", "keyword2"],
  "reason": "Why this is or isn't sufficient"
}

-- Lead Info --
Name: ${leadInfo.name || 'Unknown'}
Location: ${leadInfo.location || 'Unknown'}

-- Raw Text (from website) --
${rawText.slice(0, 6000)}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].text.trim();

  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (err) {
    throw new Error('Failed to parse Claude response: ' + raw);
  }
};

module.exports = { evaluateIdentityWithGPT };

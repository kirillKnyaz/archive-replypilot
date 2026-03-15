const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateTextSearchQueryFromCampaign({ vertical, location, offer }) {
  const prompt = `You're a sales strategist. Generate 1 Google Places text search query to find ${vertical} businesses in ${location} that might need: ${offer}. Return only the search query string, nothing else.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

module.exports = { generateTextSearchQueryFromCampaign };

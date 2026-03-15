const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateTextSearchQueryFromICP(idealCustomerProfile) {
  const prompt = `You're a growth-focused sales strategist. Based on this ICP, generate 1 text search query I can use in Google Places or Google Search to find highly relevant businesses. Use natural search phrasing, keywords, and examples from the ICP.

ICP:
${JSON.stringify(idealCustomerProfile, null, 2)}

Respond with only the query, no extra explanation.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

module.exports = { generateTextSearchQueryFromICP };

const prisma = require('../../lib/prisma.js');
const { getNextSource } = require('./getNextSource.js');
const { evaluateIdentityWithGPT } = require('./enrichGpt.js');
const { startEnrichmentStep, updateEnrichmentStep} = require('./logger.js');
const puppeteer = require('puppeteer');

const enrichIdentity = async ({ userId, leadId }) => {
  console.log(`Enriching identity for lead ID: ${leadId}`);
  const logId = await startEnrichmentStep({userId, leadId, goal: 'IDENTITY', step: 'GET_LEAD'});
  const lead = await prisma.lead.findUnique({
    where: { id: leadId, userId: userId },
    include: { sources: true },
  });

  if (!lead) {
    await updateEnrichmentStep(logId, 'ERROR', `Lead with ID ${leadId} not found for user ${userId}`);
    throw new Error(`Lead with ID ${leadId} not found for user ${userId}`);
  }
  await updateEnrichmentStep(logId, 'SUCCESS', 'Lead loaded successfully');

  let { url, type } = {};
  try {
    ({ url, type } = await getNextSource(lead, 'IDENTITY'));
    console.log(`Next source for enrichment: ${url} of type ${type}`);
    if (!url || url === null) throw new Error('No contact sources available for enrichment.');
    await prisma.leadSource.create({
      data: { leadId: lead.id, type: type, url: url, goal: 'IDENTITY' }
    });
  } catch (error) {
    return {
      lead,
      eval: { completed: false, reason: `Failed to get next identity source: ${error.message}` }
    };
  }

  let pageData;
  const scrapeLogId = await startEnrichmentStep({ userId, leadId, goal: 'IDENTITY', step: 'SCRAPE_SOURCE' });
  try {
    pageData = await scrapePage(url);
    await updateEnrichmentStep(scrapeLogId, 'SUCCESS', `Source scraped successfully: ${url}`);
  } catch (err) {
    await updateEnrichmentStep(scrapeLogId, 'ERROR', `Failed to scrape source: ${err.message}`);
    return {
      lead,
      eval: { completed: false, reason: `Failed to scrape lead source: ${url}: ${err.message}` }
    };
  }

  let gptResult;
  const gptLogId = await startEnrichmentStep({ userId, leadId, goal: 'IDENTITY', step: 'EVALUATE_GPT' });
  try {
    gptResult = await evaluateIdentityWithGPT(pageData.text, {
      name: lead.name,
      location: lead.location,
    });
    await updateEnrichmentStep(gptLogId, 'SUCCESS', `GPT evaluation completed successfully for lead: ${lead.name}`);
  } catch (err) {
    await updateEnrichmentStep(gptLogId, 'ERROR', `GPT evaluation failed: ${err.message}`);
    return {
      lead,
      eval: { completed: false, reason: `GPT evaluation failed: ${err.message}` }
    };
  }

  // Score website quality only for actual business websites, not search results
  const qualityData = type === 'WEBSITE' ? scoreWebsiteQuality(pageData.signals) : {};

  const updatedLead = await prisma.lead.update({
    where: { id: leadId, userId: userId },
    data: {
      website: url,
      identityComplete: gptResult.completed,
      description: gptResult.description,
      type: gptResult.type,
      keywords: gptResult.keywords,
      ...qualityData,
    },
    include: {
      sources: { where: { leadId: leadId, goal: 'IDENTITY' } },
    },
  });

  return {
    updatedLead,
    gptEval: { completed: gptResult.completed, reason: gptResult.reason },
  };
};

// Returns { score, websiteQualityReason } from HTML signals. No LLM call.
function scoreWebsiteQuality(signals) {
  if (!signals) return {};

  let score = 5;
  const notes = [];

  if (signals.hasViewport && signals.hasDoctype && signals.hasMetaDescription) {
    score += 2;
  } else {
    if (!signals.hasViewport) { score -= 2; notes.push('no viewport meta'); }
    if (!signals.hasDoctype) notes.push('no doctype');
    if (!signals.hasMetaDescription) notes.push('no meta description');
  }

  if (signals.stylesheetCount > 0 && !signals.hasTableLayout) {
    score += 1;
  }

  if (signals.hasTableLayout || signals.hasFontTags) {
    score -= 3;
    notes.push('table/font-tag layout (old site)');
  }

  if (signals.brokenImgCount > 2) {
    score -= 1;
    notes.push(`${signals.brokenImgCount} broken images`);
  }

  if (signals.titleLength >= 20) {
    score += 1;
  }

  score = Math.max(1, Math.min(10, score));

  const websiteQualityReason = notes.length
    ? `Score ${score}/10. Issues: ${notes.join(', ')}.`
    : `Score ${score}/10. Modern, well-structured site.`;

  return { websiteQuality: score, websiteQualityReason };
}

const tryClosePopups = async (page) => {
  const selectors = [
    '[aria-label="Close"][role="button"]',
    '[aria-label="Dismiss"][role="button"]',
    '[aria-label="Close"]',
    '[aria-label="Dismiss"]',
    'svg[aria-label="Close"]'
  ];
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 3000 });
      await page.click(selector);
      console.log(`Popup closed with: ${selector}`);
      break;
    } catch (_) {
      continue;
    }
  }
};

const scrapePage = async (url) => {
  console.log(`Scraping page: ${url}`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await tryClosePopups(page);

  const { text, signals } = await page.evaluate(() => ({
    text: document.body.innerText,
    signals: {
      hasViewport: !!document.querySelector('meta[name="viewport"]'),
      hasDoctype: document.doctype !== null,
      hasMetaDescription: !!document.querySelector('meta[name="description"]'),
      stylesheetCount: document.querySelectorAll('link[rel="stylesheet"]').length,
      hasTableLayout: document.querySelectorAll('table[border]').length > 0,
      hasFontTags: document.querySelectorAll('font').length > 0,
      brokenImgCount: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
      titleLength: document.title?.length || 0,
    },
  }));

  await browser.close();
  return { text, signals };
};

module.exports = { enrichIdentity };

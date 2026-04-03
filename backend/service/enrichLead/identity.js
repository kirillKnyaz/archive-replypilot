const prisma = require('../../lib/prisma.js');
const { getNextSource } = require('./getNextSource.js');
const { evaluateIdentityWithGPT } = require('./enrichGpt.js');
const { startEnrichmentStep, updateEnrichmentStep} = require('./logger.js');
const puppeteer = require('puppeteer');

const enrichIdentity = async ({ userId, leadId }) => {
  // load lead
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
    // get the next source to enrich
    ({ url, type } = await getNextSource(lead, 'IDENTITY'));
    console.log(`Next source for enrichment: ${url} of type ${type}`);
    // if no source is available (equal to null), return null
    if (!url || url === null) throw new Error('No contact sources available for enrichment.');
    // if there is a source, save it now
    await prisma.leadSource.create({
      data: {
        leadId: lead.id,
        type: type,
        url: url,
        goal: 'IDENTITY'
      }
    })
  } catch (error) {
    return {
      lead,
      eval: {
        completed: false,
        reason: `Failed to get next identity source: ${error.message}`
      }
    }
  }

  let htmlContent;
  const scrapeLogId = await startEnrichmentStep({ userId, leadId, goal: 'IDENTITY', step: 'SCRAPE_SOURCE' });
  try {
    htmlContent = await scrapePageText(url);
    await updateEnrichmentStep(scrapeLogId, 'SUCCESS', `Source scraped successfully: ${url}`);
  } catch (err) {
    await updateEnrichmentStep(scrapeLogId, 'ERROR', `Failed to scrape source: ${err.message}`);
    return {
      lead,
      eval: {
        completed: false,
        reason: `Failed to scrape lead source: ${url}: ${err.message}`
      }
    };      
  }

  // evaluate the scraped content with GPT
  let gptResult;
  const gptLogId = await startEnrichmentStep({ userId, leadId, goal: 'IDENTITY', step: 'EVALUATE_GPT' });
  try {
    gptResult = await evaluateIdentityWithGPT(htmlContent, {
      name: lead.name,
      location: lead.location,
    });
    await updateEnrichmentStep(gptLogId, 'SUCCESS', `GPT evaluation completed successfully for lead: ${lead.name}`);
  } catch (err) {
    await updateEnrichmentStep(gptLogId, 'ERROR', `GPT evaluation failed: ${err.message}`);
    return {
      lead,
      eval: {
        completed: false,
        reason: `GPT evaluation failed: ${err.message}`
      }
    }
  }

  // update lead with enriched data
  const updatedLead = await prisma.lead.update({
    where: { id: leadId, userId: userId },
    data: {
      website: url,
      identityComplete: gptResult.completed,
      description: gptResult.description,
      type: gptResult.type,
      keywords: gptResult.keywords,
    },
    include: {
      sources: {
        where: { leadId: leadId, goal: 'IDENTITY' },
      },
    },
  });

  return { 
    updatedLead,
    gptEval: {
      completed: gptResult.completed,
      reason: gptResult.reason,
    }
  };
};

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

const scrapePageText = async (url) => {
  console.log(`Scraping page: ${url}`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await tryClosePopups(page);
  const text = await page.evaluate(() => document.body.innerText);

  await browser.close();
  return text;
};

module.exports = { enrichIdentity };
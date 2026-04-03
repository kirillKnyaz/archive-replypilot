const SerpApi = require('google-search-results-nodejs');
const search = new SerpApi.GoogleSearch(process.env.SERP_API_KEY);
const stringSimilarity = require('string-similarity');
const { startEnrichmentStep, updateEnrichmentStep } = require('./logger.js');

const customSearchRequest = async (query) => {
  console.log(`Performing custom search for query: ${query}`);
  return new Promise((resolve, reject) => {
    search.json(
      {
        q: query,
        hl: 'en',
        gl: 'ca', // prioritize Canadian results
        num: 10,
      },
      (data) => {
        if (!data || !data.organic_results || data.organic_results.length === 0) {
          return resolve([]);
        }

        const filtered = data.organic_results
          .map(r => r.link)
          .filter(url => url && !isBlockedDomain(url) && !url.endsWith('.pdf'));

        console.log(`Found ${filtered.length} valid URLs for query "${query}"`);

        resolve(filtered);
      }
    );
  });
};

const getNextSource = async (lead, goal) => {
  const logId = await startEnrichmentStep({ userId: lead.userId, leadId: lead.id, goal, step: 'GET_SOURCE' });
  console.log(`Getting next source for lead: ${lead.name}`);
  // check if contacts are already enriched
  const foundFlags = {
    website: lead.website ? true : false,
    email: lead.email ? true : false,
    phone: lead.phone ? true : false,
    instagram: lead.instagram ? true : false,
    facebook: lead.facebook ? true : false,
    tiktok: lead.tiktok ? true : false,
  }

  // if all sources are enriched, return null
  if (Object.values(foundFlags).every(flag => flag)) {
    await updateEnrichmentStep(logId, 'SUCCESS', `All sources already enriched for lead: ${lead.name}`);
    return { url: null, type: null };
  }

  // step by step, start checking the sources
  // first, the lead's website
  if (lead.website !== null && lead.website !== '') {
    await updateEnrichmentStep(logId, 'SUCCESS', `Found website source: ${lead.website}`);
    return { url: lead.website, type: 'WEBSITE' };
  }

  // if website is not provided straight away, check all the sources 
  if (lead.sources.length > 0) {
    for (const source of lead.sources) {
      if (source.type === 'WEBSITE' || source.type === 'GCS_WEBSITE') { 
        await updateEnrichmentStep(logId, 'SUCCESS', `Found website source: ${source.url}`);
        return { url: source.url, type: source.type };
      }
      if (source.type === 'SOCIAL') {
        await updateEnrichmentStep(logId, 'SUCCESS', `Found social source: ${source.url}`);
        return { url: source.url, type: source.type };
      }
    }
  }

  // if website not provided from places, search manually
  const searchQuery = `${lead.name} ${lead.location} contact`;
  const searchResultUrls = await customSearchRequest(searchQuery);
  if (searchResultUrls.length === 0 || searchResultUrls === null) {
    await updateEnrichmentStep(logId, 'ERROR', `No search results found for query: ${searchQuery}`);
    throw new Error('No search results');
  }

  for (const url of searchResultUrls) {
    // check if the URL is a valid website
    if (url && url.startsWith('https') && !isBlockedDomain(url)) {
      // inside search results, look for the first website that matches the lead's name
      // check string similarity to the lead name
      const { hostname } = new URL(url);
      const leadName = lead.name.toLowerCase();
      const similarity = stringSimilarity.compareTwoStrings(leadName, hostname);
      console.log(`Checking URL: ${url}, similarity: ${similarity} for lead: ${leadName}`);
      if (similarity > 0.6) {
        await updateEnrichmentStep(logId, 'SUCCESS', `Found GCS website source: ${url}`);
        return { url: url, type: 'GCS_WEBSITE' };
      }
      
      // if no website was found, look for facebook, then instagram, then tiktok
      if (url.includes('facebook.com') && !foundFlags.facebook) {
        await updateEnrichmentStep(logId, 'SUCCESS', `Found Facebook source: ${url}`);
        return { url: url, type: 'SOCIAL' };
      } else if (url.includes('instagram.com') && !foundFlags.instagram) {
        await updateEnrichmentStep(logId, 'SUCCESS', `Found Instagram source: ${url}`);
        return { url: url, type: 'SOCIAL' };
      } else if (url.includes('tiktok.com') && !foundFlags.tiktok) {
        await updateEnrichmentStep(logId, 'SUCCESS', `Found TikTok source: ${url}`);
        return { url: url, type: 'SOCIAL' };
      }
    }
  }

  // if nothing comes up, return null, no more sources to check
  await updateEnrichmentStep(logId, 'ERROR', 'No valid sources found for lead');
  return { url: null, type: null };
}

function isBlockedDomain(url) {
  const blocked = [
    'google.com',
    'support.google.com'
  ];
  return blocked.some(domain => url.includes(domain));
}

module.exports = { getNextSource };
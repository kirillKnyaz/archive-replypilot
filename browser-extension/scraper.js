// scraper.js — DOM scraping logic for Google Maps listing pages.
// Uses defensive selectors with fallbacks. Returns partial data with _missing
// list if any fields fail, so background.js can invoke the screenshot fallback.

console.log('[ReplyPilot] scraper.js loaded');

(function () {
  function text(el) {
    return (el?.textContent || '').trim();
  }

  function parseNumber(s) {
    if (!s) return null;
    const m = String(s).replace(/,/g, '').match(/[\d.]+/);
    return m ? Number(m[0]) : null;
  }

  function waitForSidebar(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const heading = document.querySelector('h1[class*="fontHeadlineLarge"], h1.DUwDvf');
        if (heading) return resolve(true);
        if (Date.now() - start > timeoutMs) return reject(new Error('sidebar-timeout'));
        setTimeout(check, 300);
      };
      check();
    });
  }

  function scrapeReviewCountAndAvg() {
    // Attempt 1: header block with rating + review count
    const ratingEl = document.querySelector('[class*="F7nice"] span[aria-hidden="true"]');
    const ratingText = text(ratingEl);
    const rating = parseNumber(ratingText);

    const countEl = document.querySelector('[class*="F7nice"] span[aria-label*="review" i]');
    const countText = text(countEl);
    const count = parseNumber(countText);

    return { reviewAvg: rating, reviewCount: count };
  }

  function scrapePhotoCount() {
    // Photos tab button shows a count sometimes
    const photoBtn = document.querySelector('button[aria-label^="Photos"], button[aria-label*="photo" i]');
    const label = photoBtn?.getAttribute('aria-label') || '';
    return parseNumber(label);
  }

  function scrapeHours() {
    // Expand hours if collapsed
    const hoursBtn = document.querySelector('[aria-label*="Hours" i][role="button"]');
    const hoursEl = document.querySelector('table[class*="eK4R0e"], div[aria-label*="hours" i]');
    return text(hoursEl).slice(0, 500) || null;
  }

  function scrapeAttributes() {
    // "About" section attributes
    const items = document.querySelectorAll('[aria-label="About"] li, [data-tooltip*="attribute"] span');
    const attrs = [];
    items.forEach((el) => {
      const t = text(el);
      if (t && t.length < 60) attrs.push(t);
    });
    return attrs;
  }

  function scrapeOwnerClaimed() {
    // Unclaimed listings often show "Claim this business" button
    const claimBtn = document.querySelector('button[aria-label*="Claim this business" i], a[aria-label*="Claim this business" i]');
    if (claimBtn) return false;
    // Verified badge is a positive signal
    const verified = document.querySelector('[aria-label*="Verified" i]');
    if (verified) return true;
    return null;
  }

  async function scrapeReviewSamples(maxCount = 5) {
    // Best-effort sample from whatever reviews are currently rendered
    const cards = document.querySelectorAll('[data-review-id], div[class*="jftiEf"]');
    const samples = [];
    cards.forEach((card, i) => {
      if (i >= maxCount) return;
      const author = text(card.querySelector('[class*="d4r55"], [class*="TSUbDb"]'));
      const body = text(card.querySelector('[class*="wiI7pd"], span[class*="MyEned"]'));
      const ratingLabel = card.querySelector('[aria-label*="star" i]')?.getAttribute('aria-label') || '';
      const rating = parseNumber(ratingLabel);
      if (body) samples.push({ author: author || null, rating, text: body.slice(0, 400) });
    });
    return samples;
  }

  function scrapeOwnerResponseRate(samples) {
    if (!samples || samples.length === 0) return null;
    // Cheap heuristic: check if review cards contain "Response from owner"
    const cards = document.querySelectorAll('[data-review-id], div[class*="jftiEf"]');
    let withResponse = 0;
    let total = 0;
    cards.forEach((card, i) => {
      if (i >= 10) return;
      total++;
      if (card.textContent.match(/response from/i) || card.querySelector('[class*="CDe7pd"]')) {
        withResponse++;
      }
    });
    return total > 0 ? withResponse / total : null;
  }

  async function scrapeMapsPage() {
    await waitForSidebar();
    // Small settle delay — reviews lazy-load
    await new Promise((r) => setTimeout(r, 800));

    const missing = [];
    const out = {};

    try {
      const { reviewCount, reviewAvg } = scrapeReviewCountAndAvg();
      if (reviewCount == null) missing.push('reviewCount');
      else out.reviewCount = reviewCount;
      if (reviewAvg == null) missing.push('reviewAvg');
      else out.reviewAvg = reviewAvg;
    } catch { missing.push('reviewCount', 'reviewAvg'); }

    try {
      const photoCount = scrapePhotoCount();
      if (photoCount == null) missing.push('photoCount');
      else out.photoCount = photoCount;
    } catch { missing.push('photoCount'); }

    try {
      const hoursText = scrapeHours();
      if (!hoursText) missing.push('hoursText');
      else out.hoursText = hoursText;
    } catch { missing.push('hoursText'); }

    try { out.attributes = scrapeAttributes(); } catch { out.attributes = []; }

    try {
      const ownerClaimed = scrapeOwnerClaimed();
      if (ownerClaimed == null) missing.push('ownerClaimed');
      else out.ownerClaimed = ownerClaimed;
    } catch { missing.push('ownerClaimed'); }

    try {
      const samples = await scrapeReviewSamples(5);
      out.reviewSamples = samples;
      out.ownerResponseRate = scrapeOwnerResponseRate(samples);
    } catch { out.reviewSamples = []; out.ownerResponseRate = null; }

    out._missing = missing;
    return out;
  }

  // Expose globally for content.js
  window.__ReplyPilotScrape = scrapeMapsPage;
})();

// content.js — runs on Google Maps pages.
// Asks background whether this tab was triggered by ReplyPilot; if so, scrapes
// and reports data back.

console.log('[ReplyPilot] content script loaded on', location.href);

(async function () {
  let ctx;
  try {
    ctx = await chrome.runtime.sendMessage({ type: 'who-am-i' });
  } catch (err) {
    console.error('[ReplyPilot] who-am-i failed:', err);
    return;
  }

  if (!ctx || !ctx.leadId) {
    console.log('[ReplyPilot] not a ReplyPilot-triggered tab, idle.');
    return;
  }

  console.log('[ReplyPilot] enriching lead', ctx.leadId);

  try {
    const data = await window.__ReplyPilotScrape();
    console.log('[ReplyPilot] scraped:', data);
    chrome.runtime.sendMessage({ type: 'maps-scraped', data });
  } catch (err) {
    console.error('[ReplyPilot] scrape failed:', err);
    chrome.runtime.sendMessage({ type: 'maps-error', error: String(err?.message || err) });
  }
})();

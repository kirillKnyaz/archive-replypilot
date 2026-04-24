// content.js — runs on Google Maps pages.
// Two modes:
//   1. Bound: on load, asks background "who-am-i?". If ReplyPilot opened this tab
//      for enrichment, we auto-scrape and POST. (Day 4 behavior.)
//   2. Unbound: no enrichment context. Content script idles. Side panel can
//      request on-demand scraping via "extract-place" message. (Day 5 behavior.)

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
    console.log('[ReplyPilot] not a ReplyPilot-triggered tab, idle (discovery mode).');
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

// Discovery-mode: respond to on-demand scrape requests from the side panel.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'extract-place') {
    (async () => {
      try {
        const data = await window.__ReplyPilotScrape();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }
});

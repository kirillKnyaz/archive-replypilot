// background.js — service worker. Orchestrates enrichment jobs using
// chrome.storage.session. Each enrichment is bound to a tabId when the tab
// is created and cleared when scraping completes or the tab closes.

const PENDING_TAB = 'pending_tab_';

async function setTabCtx(tabId, ctx) {
  await chrome.storage.session.set({ [PENDING_TAB + tabId]: ctx });
}
async function getTabCtx(tabId) {
  const key = PENDING_TAB + tabId;
  const out = await chrome.storage.session.get(key);
  return out[key] || null;
}
async function clearTabCtx(tabId) {
  await chrome.storage.session.remove(PENDING_TAB + tabId);
}

async function getToken() {
  const { apiToken } = await chrome.storage.sync.get('apiToken');
  return apiToken || null;
}

async function postJson(url, token, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function captureScreenshot(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      resolve(dataUrl.replace(/^data:image\/png;base64,/, ''));
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'prepare-enrich') {
    console.log('[ReplyPilot bg] prepare-enrich', msg.leadId, '→', msg.mapsUrl);
    (async () => {
      const tab = await chrome.tabs.create({ url: msg.mapsUrl });
      await setTabCtx(tab.id, {
        leadId: msg.leadId,
        apiBase: msg.apiBase,
        mapsUrl: msg.mapsUrl,
        injected: false,
      });
      console.log('[ReplyPilot bg] opened tab', tab.id, 'bound to lead', msg.leadId);
    })();
    return;
  }

  if (msg.type === 'who-am-i') {
    const tabId = sender.tab?.id;
    (async () => {
      const ctx = await getTabCtx(tabId);
      console.log('[ReplyPilot bg] who-am-i', tabId, ctx ? '→ lead ' + ctx.leadId : 'no bound ctx');
      sendResponse(ctx || null);
    })();
    return true;
  }

  if (msg.type === 'maps-scraped') {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    (async () => {
      const ctx = await getTabCtx(tabId);
      if (!ctx) {
        console.warn('[ReplyPilot bg] maps-scraped from unbound tab', tabId);
        return;
      }
      const token = await getToken();
      if (!token) {
        console.error('[ReplyPilot bg] No API token configured — open extension options.');
        return;
      }
      try {
        const { _missing, ...payload } = msg.data;
        console.log('[ReplyPilot bg] POSTing maps-data for lead', ctx.leadId, 'missing:', _missing);
        await postJson(`${ctx.apiBase}/api/leads/${ctx.leadId}/maps-data`, token, payload);

        if (_missing && _missing.length > 0 && windowId !== undefined) {
          try {
            const screenshotBase64 = await captureScreenshot(windowId);
            await postJson(`${ctx.apiBase}/api/leads/${ctx.leadId}/maps-screenshot`, token, {
              screenshotBase64, missingFields: _missing,
            });
            console.log('[ReplyPilot bg] screenshot fallback ok');
          } catch (fbErr) {
            console.error('[ReplyPilot bg] screenshot fallback failed:', fbErr);
          }
        }

        await clearTabCtx(tabId);
        setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 1500);
      } catch (err) {
        console.error('[ReplyPilot bg] POST failed:', err);
      }
    })();
    return;
  }

  if (msg.type === 'maps-error') {
    console.error('[ReplyPilot bg] scrape error:', msg.error);
    return;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabCtx(tabId).catch(() => {});
});

// Inject scraper + content scripts into our bound Maps tabs once they finish loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  if (!tab.url.startsWith('https://www.google.com/maps/') && !tab.url.startsWith('https://maps.google.com/')) return;

  const ctx = await getTabCtx(tabId);
  if (!ctx || ctx.injected) return;

  await setTabCtx(tabId, { ...ctx, injected: true });

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scraper.js', 'content.js'],
    });
    console.log('[ReplyPilot bg] injected scripts into tab', tabId, 'for lead', ctx.leadId, 'at', tab.url);
  } catch (err) {
    console.error('[ReplyPilot bg] scripting.executeScript failed:', err, 'tab url:', tab.url);
  }
});

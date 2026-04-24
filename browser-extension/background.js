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

  // === Side-panel discovery mode (Day 5) ===

  // Ask content script on the active tab to scrape the current Maps place.
  // If the content script isn't there (extension was reloaded while the Maps
  // tab was open), inject it on demand and retry.
  if (msg.type === 'extract-current-place') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url || !tab.url.includes('/maps/place/')) {
          sendResponse({ ok: false, error: 'not-a-place-page', tabUrl: tab?.url || null });
          return;
        }

        let res;
        try {
          res = await chrome.tabs.sendMessage(tab.id, { type: 'extract-place' });
        } catch (err) {
          // Orphaned or missing content script — inject and retry
          console.log('[ReplyPilot bg] content script unreachable, injecting into tab', tab.id);
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['scraper.js', 'content.js'],
          });
          await new Promise((r) => setTimeout(r, 500));
          res = await chrome.tabs.sendMessage(tab.id, { type: 'extract-place' });
        }
        sendResponse({ ...res, tabId: tab.id, apiBase: msg.apiBase });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  // Fetch the user's campaigns (for the panel's dropdown)
  if (msg.type === 'list-campaigns') {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return sendResponse({ ok: false, error: 'no-token' });
        const res = await fetch(`${msg.apiBase}/api/campaigns`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return sendResponse({ ok: false, error: `${res.status}` });
        const campaigns = await res.json();
        sendResponse({ ok: true, campaigns });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  // Check whether a place is already a lead for this user
  if (msg.type === 'lookup-by-maps-url') {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return sendResponse({ ok: false, error: 'no-token' });
        const qs = new URLSearchParams({ mapsUrl: msg.mapsUrl, name: msg.name || '', address: msg.address || '' });
        const res = await fetch(`${msg.apiBase}/api/leads/lookup-by-maps?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return sendResponse({ ok: false, error: `${res.status}` });
        const json = await res.json();
        sendResponse({ ok: true, ...json });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  // Create a new lead from the currently-scraped Maps data
  if (msg.type === 'create-from-maps') {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return sendResponse({ ok: false, error: 'no-token' });
        const res = await fetch(`${msg.apiBase}/api/leads/from-maps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ campaignId: msg.campaignId, ...msg.data }),
        });
        const json = await res.json();
        if (!res.ok) return sendResponse({ ok: false, status: res.status, ...json });
        sendResponse({ ok: true, lead: json });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabCtx(tabId).catch(() => {});
});

// Open side panel when user clicks the extension toolbar icon
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// Notify any open side panel when the active Maps tab changes or navigates.
// Panel listens and re-runs its detection flow.
function notifyPanel(tabId, url) {
  chrome.runtime.sendMessage({ type: 'panel-refresh', tabId, url }).catch(() => {});
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Maps is a SPA — URL changes fire without a full reload
  if (!changeInfo.url) return;
  notifyPanel(tabId, changeInfo.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    notifyPanel(tabId, tab.url || '');
  } catch {}
});

// bridge.js — runs on the ReplyPilot web app.
// Forwards enrichment requests from the page to the extension's background
// worker, and announces the extension's presence back to the page.

(function () {
  console.log('[ReplyPilot] bridge loaded on', location.origin);

  function extensionAlive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'rp_enrich_request') {
      if (!extensionAlive()) {
        console.warn('[ReplyPilot] extension context invalidated — refresh the page to reconnect.');
        window.postMessage(
          { type: 'rp_extension_error', error: 'invalidated' },
          window.location.origin
        );
        return;
      }
      try {
        chrome.runtime.sendMessage({
          type: 'prepare-enrich',
          leadId: data.leadId,
          mapsUrl: data.mapsUrl,
          apiBase: data.apiBase,
        });
      } catch (err) {
        console.error('[ReplyPilot] failed to reach extension:', err);
        window.postMessage(
          { type: 'rp_extension_error', error: String(err?.message || err) },
          window.location.origin
        );
      }
    }
  });

  // Announce presence so the frontend can detect the extension is installed
  try {
    window.postMessage({ type: 'rp_extension_ready', version: '2.1.0' }, window.location.origin);
  } catch {}
})();

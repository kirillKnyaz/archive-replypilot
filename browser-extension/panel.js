const statusEl = document.getElementById('status');

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'enrich-started') {
    statusEl.textContent = `Capturing lead ${msg.leadId}...`;
    statusEl.classList.remove('muted');
  }
  if (msg.type === 'maps-scraped') {
    statusEl.textContent = `Captured. Closing tab...`;
  }
  if (msg.type === 'maps-error') {
    statusEl.textContent = `Error: ${msg.error}`;
  }
});

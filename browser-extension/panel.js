const API_BASE = 'http://localhost:3001';
const APP_BASE = 'http://localhost:5173';
const contentEl = document.getElementById('content');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function render(html) {
  contentEl.innerHTML = html;
}

function send(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, apiBase: API_BASE, ...payload }, (res) => resolve(res));
  });
}

async function showNotAPlacePage() {
  render(`
    <div class="card">
      <div class="muted">
        Open a Google Maps business page (any result with reviews, photos, hours)
        to add it to a ReplyPilot campaign.
      </div>
    </div>
  `);
}

async function showNoToken() {
  render(`
    <div class="card">
      <div class="err">No API token configured.</div>
      <div class="muted" style="margin-top:6px;">
        Open the extension options and paste your ReplyPilot API token.
      </div>
    </div>
  `);
}

async function showError(err) {
  render(`
    <div class="card">
      <div class="err">Error: ${esc(err)}</div>
    </div>
  `);
}

function renderPlaceSummary(data) {
  const parts = [];
  if (data.reviewCount != null) {
    parts.push(`<strong>${data.reviewCount}</strong> reviews`);
    if (data.reviewAvg != null) parts.push(`<strong>${data.reviewAvg}</strong>★`);
  }
  if (data.photoCount != null) parts.push(`${data.photoCount} photos`);
  if (data.ownerClaimed != null) parts.push(data.ownerClaimed ? 'owner claimed' : 'unclaimed');
  return `
    <div><strong>${esc(data.name || 'Unknown')}</strong></div>
    ${data.address ? `<div class="muted">${esc(data.address)}</div>` : ''}
    ${parts.length ? `<div style="margin-top:4px;font-size:12px;">${parts.join(' · ')}</div>` : ''}
  `;
}

async function renderExistingLead(data, existing) {
  const lead = existing.lead;
  render(`
    <div class="card">
      ${renderPlaceSummary(data)}
    </div>
    <div class="card">
      <div class="row">
        <span class="badge blue">In ReplyPilot</span>
        <span class="muted">${esc(lead.campaign?.name || 'No campaign')}</span>
      </div>
      <div class="row">
        <span class="label">Status</span>
        <span>${esc(lead.status)}</span>
      </div>
      ${lead.icpFitScore != null ? `
        <div class="row">
          <span class="label">Fit</span>
          <span>${lead.icpFitScore}/10</span>
        </div>
      ` : ''}
      <hr>
      <div style="display:flex; gap:8px;">
        <a class="secondary" style="padding:6px 12px; border-radius:4px; background:#fff; border:1px solid #ced4da; color:#222;" href="${APP_BASE}/leads/${lead.id}" target="_blank">Open in ReplyPilot</a>
      </div>
    </div>
  `);
}

async function renderNewLeadUI(data, campaigns) {
  const setup = campaigns.filter((c) => c.setupComplete);
  if (setup.length === 0) {
    render(`
      <div class="card">${renderPlaceSummary(data)}</div>
      <div class="card">
        <div class="muted">No campaigns configured. Create one in ReplyPilot first.</div>
        <div style="margin-top:8px;"><a href="${APP_BASE}/campaigns" target="_blank">Open ReplyPilot →</a></div>
      </div>
    `);
    return;
  }

  const options = setup.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  render(`
    <div class="card">${renderPlaceSummary(data)}</div>
    <div class="card">
      <div class="label">Add to campaign</div>
      <select id="campaignSelect">${options}</select>
      <div style="margin-top:10px;">
        <button id="addBtn" class="primary">Add to campaign</button>
      </div>
      <div id="addResult" style="margin-top:8px;"></div>
    </div>
  `);

  document.getElementById('addBtn').addEventListener('click', async () => {
    const campaignId = document.getElementById('campaignSelect').value;
    const btn = document.getElementById('addBtn');
    const result = document.getElementById('addResult');
    btn.disabled = true;
    result.innerHTML = '<span class="muted">Adding...</span>';

    const { _missing, ...payload } = data;
    const res = await send('create-from-maps', { campaignId, data: payload });
    if (res?.ok) {
      const leadId = res.lead.id;
      result.innerHTML = `<span class="ok">Added.</span> <a href="${APP_BASE}/leads/${leadId}" target="_blank">Open lead →</a>`;
      btn.textContent = 'Added';
    } else if (res?.status === 409 && res.existing) {
      result.innerHTML = `<span class="muted">Already in campaign "${esc(res.existing.campaign?.name || '')}".</span> <a href="${APP_BASE}/leads/${res.existing.id}" target="_blank">Open →</a>`;
      btn.disabled = false;
    } else {
      result.innerHTML = `<span class="err">Failed: ${esc(res?.error || res?.message || 'unknown')}</span>`;
      btn.disabled = false;
    }
  });
}

async function main() {
  const extract = await send('extract-current-place');
  if (!extract) return showError('Extension not responding.');
  if (!extract.ok) {
    if (extract.error === 'not-a-place-page') return showNotAPlacePage();
    return showError(extract.error);
  }

  const data = extract.data;
  if (!data?.name || !data?.mapsUrl) {
    return showError('Could not read the Maps listing. Wait for the page to finish loading and reopen the panel.');
  }

  // Lookup by mapsUrl (backend will canonicalize via placesId text search)
  const lookup = await send('lookup-by-maps-url', {
    mapsUrl: data.mapsUrl,
    name: data.name,
    address: data.address,
  });

  if (!lookup?.ok) {
    if (lookup?.error === 'no-token') return showNoToken();
    return showError(lookup?.error || 'Lookup failed.');
  }

  if (lookup.exists) return renderExistingLead(data, lookup);

  const camps = await send('list-campaigns');
  if (!camps?.ok) {
    if (camps?.error === 'no-token') return showNoToken();
    return showError(camps?.error || 'Failed to load campaigns.');
  }

  renderNewLeadUI(data, camps.campaigns);
}

main();

// Re-run detection whenever the active Maps tab changes or navigates.
// Debounced so Maps' rapid pushState events don't cause thrash.
let refreshTimer = null;
let lastUrl = null;
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'panel-refresh') return;
  if (msg.url === lastUrl) return;
  lastUrl = msg.url;

  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    main();
  }, 600);
});

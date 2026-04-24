const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('save');
const resultEl = document.getElementById('result');

chrome.storage.sync.get('apiToken', ({ apiToken }) => {
  if (apiToken) tokenInput.value = apiToken;
});

saveBtn.addEventListener('click', () => {
  const token = tokenInput.value.trim();
  if (!token.startsWith('rp_')) {
    resultEl.textContent = 'Token should start with rp_';
    resultEl.className = 'muted';
    return;
  }
  chrome.storage.sync.set({ apiToken: token }, () => {
    resultEl.textContent = 'Saved.';
    resultEl.className = 'ok';
  });
});

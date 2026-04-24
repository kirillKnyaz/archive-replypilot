import { useEffect, useState } from 'react';
import API from '../../api';

export default function SettingsTab() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    API.get('/auth/token')
      .then(({ data }) => setToken(data.token))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function generate() {
    if (token && !window.confirm('Generating a new token invalidates the current one. Continue?')) return;
    setGenerating(true);
    try {
      const { data } = await API.post('/auth/token');
      setToken(data.token);
      setRevealed(true);
    } catch (e) {
      console.error('Generate token failed', e);
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const masked = token ? token.slice(0, 4) + '•'.repeat(28) : '';

  return (
    <div style={{ maxWidth: 640 }}>
      <h5 className="mb-3">Extension API token</h5>
      <p className="text-muted" style={{ fontSize: '0.9rem' }}>
        Used by the ReplyPilot browser extension to send scraped Google Maps data back to your account.
        Paste this token into the extension's options page.
      </p>

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : token ? (
        <div className="card card-body">
          <div className="d-flex align-items-center gap-2" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            <code className="flex-grow-1">{revealed ? token : masked}</code>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setRevealed((v) => !v)}>
              {revealed ? 'Hide' : 'Show'}
            </button>
            <button className="btn btn-sm btn-outline-primary" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="mt-2">
            <button className="btn btn-sm btn-outline-warning" onClick={generate} disabled={generating}>
              {generating ? 'Generating...' : 'Regenerate token'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card card-body">
          <p className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
            No token yet. Generate one to connect the browser extension.
          </p>
          <button className="btn btn-sm btn-primary" onClick={generate} disabled={generating}>
            {generating ? 'Generating...' : 'Generate token'}
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import API from '../../api';
import RunsTable from '../../components/campaigns/RunsTable';

export default function CampaignConfigPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [campaign, setCampaign]     = useState(null);
  const [runs, setRuns]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editing, setEditing]       = useState(false);
  const [fields, setFields]         = useState({});
  const [saving, setSaving]         = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    Promise.all([
      API.get(`/campaigns/${id}`),
      API.get(`/campaigns/${id}/runs`),
    ]).then(([campRes, runsRes]) => {
      setCampaign(campRes.data);
      setRuns(runsRes.data);
    }).catch(() => navigate(`/campaigns/${id}`))
      .finally(() => setLoading(false));
  }, [id]);

  function startEditing() {
    setFields({
      vertical:          campaign.vertical || '',
      location:          campaign.location || '',
      offer:             campaign.offer || '',
      angle:             campaign.angle || '',
      goodFitSignals:    campaign.goodFitSignals || '',
      qualifier:         campaign.qualifier || '',
      qualifyThreshold:  campaign.qualifyThreshold ?? 4,
      tone:              campaign.tone || '',
      dailyTarget:       campaign.dailyTarget ?? 10,
      radiusMeters:      campaign.radiusMeters ?? 5000,
      gridRadiusMeters:  campaign.gridRadiusMeters ?? 2000,
      gridSpacingMeters: campaign.gridSpacingMeters ?? 3000,
      cellsPerRun:       campaign.cellsPerRun ?? 3,
      rotateQueries:     campaign.rotateQueries ?? false,
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const { data } = await API.patch(`/campaigns/${id}`, fields);
      setCampaign(data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function set(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) return <div className="container py-4"><p className="text-muted">Loading…</p></div>;
  if (!campaign) return null;

  const cells = Array.isArray(campaign.searchCenters) ? campaign.searchCenters : [];

  return (
    <div className="container-fluid py-4 px-4">
      {/* ── Header ── */}
      <div className="d-flex align-items-center gap-2 mb-4">
        <Link to={`/campaigns/${id}`} className="btn btn-sm btn-outline-secondary">←</Link>
        <span className="fw-semibold">{campaign.name}</span>
        <span className="text-muted" style={{ fontSize: '0.85rem' }}>/ Config</span>
      </div>

      {/* ── Campaign config ── */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="card-title mb-0">Campaign config</h6>
            {!editing && (
              <button className="btn btn-sm btn-outline-secondary" onClick={startEditing}>Edit</button>
            )}
          </div>

          {editing ? (
            <>
              <div className="row g-3" style={{ fontSize: '0.9rem' }}>
                <div className="col-md-6">
                  <label className="form-label fw-semibold mb-1">Vertical</label>
                  <input className="form-control form-control-sm" value={fields.vertical}
                    onChange={(e) => set('vertical', e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold mb-1">Location</label>
                  <input className="form-control form-control-sm" value={fields.location}
                    onChange={(e) => set('location', e.target.value)} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold mb-1">Offer</label>
                  <input className="form-control form-control-sm" value={fields.offer}
                    onChange={(e) => set('offer', e.target.value)} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold mb-1">Angle</label>
                  <textarea className="form-control form-control-sm" rows={2} value={fields.angle}
                    onChange={(e) => set('angle', e.target.value)} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold mb-1">
                    Good-fit signals <small className="text-muted fw-normal">score higher when these apply</small>
                  </label>
                  <textarea className="form-control form-control-sm" rows={2} value={fields.goodFitSignals}
                    onChange={(e) => set('goodFitSignals', e.target.value)} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold mb-1">
                    Qualifier <small className="text-muted fw-normal">bad-fit signals</small>
                  </label>
                  <textarea className="form-control form-control-sm" rows={2} value={fields.qualifier}
                    onChange={(e) => set('qualifier', e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold mb-1">Tone</label>
                  <select className="form-select form-select-sm" value={fields.tone}
                    onChange={(e) => set('tone', e.target.value)}>
                    <option value="">— select —</option>
                    <option value="casual">Casual</option>
                    <option value="professional">Professional</option>
                    <option value="direct">Direct</option>
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold mb-1">Daily target</label>
                  <input type="number" className="form-control form-control-sm" min={1} max={100}
                    value={fields.dailyTarget} onChange={(e) => set('dailyTarget', Number(e.target.value))} />
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold mb-1">
                    Qualify threshold <small className="text-muted fw-normal">1–10</small>
                  </label>
                  <input type="number" className="form-control form-control-sm" min={1} max={10}
                    value={fields.qualifyThreshold} onChange={(e) => set('qualifyThreshold', Number(e.target.value))} />
                </div>
              </div>

              <div className="mt-3">
                <button type="button" className="btn btn-sm btn-link p-0 text-decoration-none"
                  onClick={() => setShowAdvanced((v) => !v)}>
                  {showAdvanced ? '▼' : '▶'} Advanced (search area, grid)
                </button>
              </div>

              {showAdvanced && (
                <div className="row g-3 mt-1" style={{ fontSize: '0.9rem' }}>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold mb-1">
                      Area radius (m) <small className="text-muted fw-normal">total ground covered</small>
                    </label>
                    <input type="number" className="form-control form-control-sm" min={1000} max={50000} step={500}
                      value={fields.radiusMeters} onChange={(e) => set('radiusMeters', Number(e.target.value))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold mb-1">
                      Grid spacing (m) <small className="text-muted fw-normal">distance between cells</small>
                    </label>
                    <input type="number" className="form-control form-control-sm" min={1000} max={10000} step={500}
                      value={fields.gridSpacingMeters} onChange={(e) => set('gridSpacingMeters', Number(e.target.value))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold mb-1">Per-cell radius (m)</label>
                    <input type="number" className="form-control form-control-sm" min={500} max={5000} step={250}
                      value={fields.gridRadiusMeters} onChange={(e) => set('gridRadiusMeters', Number(e.target.value))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold mb-1">Cells per run</label>
                    <input type="number" className="form-control form-control-sm" min={1} max={20}
                      value={fields.cellsPerRun} onChange={(e) => set('cellsPerRun', Number(e.target.value))} />
                  </div>
                  <div className="col-12">
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" id="rotateQueries"
                        checked={fields.rotateQueries} onChange={(e) => set('rotateQueries', e.target.checked)} />
                      <label className="form-check-label" htmlFor="rotateQueries">
                        Rotate query phrasings <small className="text-muted">(experimental)</small>
                      </label>
                    </div>
                  </div>
                  <div className="col-12">
                    <small className="text-muted">Changing area or spacing rebuilds the search grid on the next run.</small>
                  </div>
                </div>
              )}

              <div className="d-flex gap-2 mt-3">
                <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <div className="row g-2" style={{ fontSize: '0.875rem' }}>
              <div className="col-md-6">
                <Field label="Vertical"   value={campaign.vertical} />
                <Field label="Location"   value={campaign.location} />
                <Field label="Offer"      value={campaign.offer} />
                <Field label="Angle"      value={campaign.angle} />
              </div>
              <div className="col-md-6">
                <Field label="Good-fit"   value={campaign.goodFitSignals} />
                <Field label="Qualifier"  value={campaign.qualifier} />
                <Field label="Tone"       value={campaign.tone} />
                <Field label="Daily target" value={campaign.dailyTarget} />
                <Field label="Threshold"  value={campaign.qualifyThreshold ?? 4} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Search coverage ── */}
      <div className="card mb-3">
        <div className="card-body">
          <h6 className="card-title mb-3">Search coverage</h6>
          {cells.length === 0 ? (
            <p className="text-muted mb-0" style={{ fontSize: '0.85rem' }}>Grid not built yet — generates on first run.</p>
          ) : (
            <div className="d-flex gap-4 flex-wrap" style={{ fontSize: '0.875rem' }}>
              <div><strong>{cells.length}</strong> <span className="text-muted">total cells</span></div>
              <div>
                <strong>{cells.filter((c) => c.lastSearchedAt && Date.now() - new Date(c.lastSearchedAt).getTime() < 7 * 864e5).length}</strong>
                <span className="text-muted"> searched this week</span>
              </div>
              <div>
                <strong>{cells.filter((c) => !c.lastSearchedAt).length}</strong>
                <span className="text-muted"> never searched</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Run history ── */}
      <div className="card">
        <div className="card-body">
          <h6 className="card-title mb-3">Run history</h6>
          {runs.length === 0
            ? <p className="text-muted mb-0" style={{ fontSize: '0.85rem' }}>No runs yet.</p>
            : <RunsTable runs={runs} />
          }
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="mb-2">
      <span className="text-muted me-1" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
      <span>{value || <span className="text-muted">—</span>}</span>
    </div>
  );
}

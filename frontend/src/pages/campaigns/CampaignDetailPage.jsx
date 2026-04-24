import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import API from '../../api';
import { useCampaignRun } from '../../hooks/useCampaignRun';
import LeadsTable from '../../components/campaigns/LeadsTable';
import RunsTable from '../../components/campaigns/RunsTable';

export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [runs, setRuns] = useState([]);
  const [leadsRefreshToken, setLeadsRefreshToken] = useState(0);
  const [tab, setTab] = useState('leads');
  const [editingConfig, setEditingConfig] = useState(false);
  const [configFields, setConfigFields] = useState({});
  const [configSaving, setConfigSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const logEndRef = useRef(null);

  const { running, runEvents, runStats, startLiveRun, startLiveRequalify, checkForActiveRun, dismiss, cleanup } =
    useCampaignRun(id, fetchAll);

  useEffect(() => {
    fetchAll();
    checkForActiveRun();
    return cleanup;
  }, [id]);

  // Auto-scroll run event log
  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [runEvents]);

  async function fetchAll() {
    try {
      const [campRes, runsRes, allCampsRes] = await Promise.all([
        API.get(`/campaigns/${id}`),
        API.get(`/campaigns/${id}/runs`),
        API.get('/campaigns'),
      ]);
      setCampaign(campRes.data);
      setRuns(runsRes.data);
      setCampaigns(allCampsRes.data);
      setLeadsRefreshToken((t) => t + 1);
    } catch (e) {
      console.error('Failed to load campaign detail', e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive() {
    try {
      const { data } = await API.patch(`/campaigns/${id}`, { active: !campaign.active });
      setCampaign(data);
    } catch (e) {
      console.error('Toggle failed', e);
    }
  }

  function startEditing() {
    setConfigFields({
      vertical:         campaign.vertical || '',
      location:         campaign.location || '',
      offer:            campaign.offer || '',
      angle:            campaign.angle || '',
      goodFitSignals:   campaign.goodFitSignals || '',
      qualifier:        campaign.qualifier || '',
      qualifyThreshold: campaign.qualifyThreshold ?? 4,
      tone:             campaign.tone || '',
      dailyTarget:      campaign.dailyTarget ?? 10,
    });
    setEditingConfig(true);
  }

  async function saveConfig() {
    setConfigSaving(true);
    try {
      const { data } = await API.patch(`/campaigns/${id}`, configFields);
      setCampaign(data);
      setEditingConfig(false);
    } catch (e) {
      console.error('Failed to save config', e);
    } finally {
      setConfigSaving(false);
    }
  }

  if (loading) {
    return <div className="container py-4"><p className="text-muted">Loading...</p></div>;
  }

  if (!campaign) {
    return (
      <div className="container py-4">
        <p>Campaign not found.</p>
        <Link to="/campaigns">Back to campaigns</Link>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4 px-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Link to="/campaigns" className="btn btn-sm btn-outline-secondary">&larr;</Link>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto', maxWidth: 280 }}
              value={id}
              onChange={(e) => navigate(`/campaigns/${e.target.value}`)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <StatusBadge campaign={campaign} />
          </div>
        </div>
        <div className="d-flex gap-2">
          {campaign.setupComplete && (
            <>
              <button
                className={`btn btn-sm ${campaign.active ? 'btn-outline-warning' : 'btn-outline-success'}`}
                onClick={toggleActive}
              >
                {campaign.active ? 'Pause' : 'Activate'}
              </button>
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={() => {
                  if (window.confirm('Re-score all archived, queued, and qualified leads with current criteria?')) {
                    startLiveRequalify();
                  }
                }}
                disabled={running}
              >
                Requalify
              </button>
              <button className="btn btn-sm btn-primary" onClick={startLiveRun} disabled={running}>
                {running ? 'Running...' : 'Run now'}
              </button>
            </>
          )}
          {!campaign.setupComplete && (
            <Link to={`/campaigns/${id}/setup`} className="btn btn-sm btn-outline-primary">
              Continue Setup
            </Link>
          )}
        </div>
      </div>

      {/* Config card */}
      {editingConfig ? (
        <div className="card card-body mb-3">
          <div className="row g-2" style={{ fontSize: '0.9rem' }}>
            <div className="col-md-6">
              <label className="form-label fw-semibold mb-1">Vertical</label>
              <input className="form-control form-control-sm" value={configFields.vertical}
                onChange={(e) => setConfigFields((p) => ({ ...p, vertical: e.target.value }))} />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold mb-1">Location</label>
              <input className="form-control form-control-sm" value={configFields.location}
                onChange={(e) => setConfigFields((p) => ({ ...p, location: e.target.value }))} />
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold mb-1">Offer</label>
              <input className="form-control form-control-sm" value={configFields.offer}
                onChange={(e) => setConfigFields((p) => ({ ...p, offer: e.target.value }))} />
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold mb-1">Angle</label>
              <textarea className="form-control form-control-sm" rows={2} value={configFields.angle}
                onChange={(e) => setConfigFields((p) => ({ ...p, angle: e.target.value }))} />
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold mb-1">
                Good-fit signals <small className="text-muted fw-normal">(score leads higher when these apply)</small>
              </label>
              <textarea className="form-control form-control-sm" rows={2} value={configFields.goodFitSignals}
                onChange={(e) => setConfigFields((p) => ({ ...p, goodFitSignals: e.target.value }))} />
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold mb-1">
                Qualifier <small className="text-muted fw-normal">(bad fit signals)</small>
              </label>
              <textarea className="form-control form-control-sm" rows={2} value={configFields.qualifier}
                onChange={(e) => setConfigFields((p) => ({ ...p, qualifier: e.target.value }))} />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold mb-1">Tone</label>
              <select className="form-select form-select-sm" value={configFields.tone}
                onChange={(e) => setConfigFields((p) => ({ ...p, tone: e.target.value }))}>
                <option value="">— select —</option>
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
                <option value="direct">Direct</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold mb-1">Daily target</label>
              <input type="number" className="form-control form-control-sm" min={1} max={100}
                value={configFields.dailyTarget}
                onChange={(e) => setConfigFields((p) => ({ ...p, dailyTarget: Number(e.target.value) }))} />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold mb-1">
                Qualify threshold <small className="text-muted fw-normal">(1-10, lower = more leads through)</small>
              </label>
              <input type="number" className="form-control form-control-sm" min={1} max={10}
                value={configFields.qualifyThreshold}
                onChange={(e) => setConfigFields((p) => ({ ...p, qualifyThreshold: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-sm btn-primary" onClick={saveConfig} disabled={configSaving}>
              {configSaving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingConfig(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="card card-body mb-3" style={{ fontSize: '0.85rem' }}>
          <div className="d-flex justify-content-between align-items-start">
            <div className="row flex-grow-1">
              <div className="col-md-6">
                <strong>Angle:</strong> {campaign.angle || '—'}<br />
                <strong>Good-fit:</strong> {campaign.goodFitSignals || '—'}<br />
                <strong>Qualifier:</strong> {campaign.qualifier || '—'}
              </div>
              <div className="col-md-6">
                <strong>Tone:</strong> {campaign.tone || '—'}<br />
                <strong>Daily target:</strong> {campaign.dailyTarget}<br />
                <strong>Threshold:</strong> {campaign.qualifyThreshold ?? 4}
              </div>
            </div>
            <button className="btn btn-sm btn-outline-secondary ms-3 flex-shrink-0" onClick={startEditing}>
              Edit config
            </button>
          </div>
        </div>
      )}

      {/* Live run panel */}
      {(running || runEvents.length > 0) && (
        <LiveRunPanel
          events={runEvents}
          stats={runStats}
          running={running}
          logEndRef={logEndRef}
          onDismiss={dismiss}
        />
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${tab === 'leads' ? 'active' : ''}`} onClick={() => setTab('leads')}>
            Leads
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === 'runs' ? 'active' : ''}`} onClick={() => setTab('runs')}>
            Runs ({runs.length})
          </button>
        </li>
      </ul>

      {tab === 'leads' && <LeadsTable campaignId={id} refreshToken={leadsRefreshToken} />}
      {tab === 'runs'  && <RunsTable runs={runs} />}
    </div>
  );
}

// ── Live Run Panel ──

function LiveRunPanel({ events, stats, running, logEndRef, onDismiss }) {
  const lastPhase = [...events].reverse().find((e) => e.type === 'phase');
  const lastEvent = events[events.length - 1];
  const isComplete = lastEvent?.type === 'complete';
  const isError = lastEvent?.type === 'error';

  return (
    <div className={`card mb-3 ${isError ? 'border-danger' : isComplete ? 'border-success' : 'border-primary'}`}>
      <div className="card-header d-flex justify-content-between align-items-center py-2">
        <div className="d-flex align-items-center gap-2">
          {running && <Spinner />}
          <strong>{isComplete ? 'Run complete' : isError ? 'Run failed' : lastPhase?.message || 'Starting...'}</strong>
        </div>
        {!running && (
          <button className="btn btn-sm btn-outline-secondary" onClick={onDismiss}>Dismiss</button>
        )}
      </div>

      {stats && (
        <div className="card-body py-2 border-bottom">
          <div className="d-flex flex-wrap gap-3" style={{ fontSize: '0.85rem' }}>
            {stats.total && (
              <span>Enriched: <strong>{stats.enriched || stats.created || 0}/{stats.total}</strong></span>
            )}
            {stats.qualified != null && (
              <span className="text-success">Qualified: <strong>{stats.qualified}</strong></span>
            )}
            {stats.archived != null && (
              <span className="text-muted">Archived: <strong>{stats.archived}</strong></span>
            )}
            {stats.queued != null && (
              <span className="text-primary">Queued: <strong>{stats.queued}</strong></span>
            )}
            {stats.discovered != null && (
              <span>Discovered: <strong>{stats.discovered}</strong></span>
            )}
          </div>
        </div>
      )}

      <div
        className="card-body p-2"
        style={{ maxHeight: 250, overflowY: 'auto', fontSize: '0.8rem', fontFamily: 'monospace' }}
      >
        {events.map((e, i) => <EventLine key={i} event={e} />)}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function EventLine({ event }) {
  switch (event.type) {
    case 'phase':
      return <div className="text-primary fw-bold mt-1">{event.message}</div>;

    case 'discovery_complete':
      return (
        <div className="text-success">
          Found {event.discovered} businesses ({event.newPlaces} new, {event.filtered} filtered)
        </div>
      );

    case 'leads_created':
      return <div className="text-success">Created {event.created} leads</div>;

    case 'enriching_lead':
      return <div className="text-muted">Enriching: {event.leadName} ({event.index}/{event.total})</div>;

    case 'lead_qualified': {
      const icon = event.status === 'QUALIFIED' ? '+' : event.status === 'ARCHIVED' ? '-' : '?';
      const cls = event.status === 'QUALIFIED' ? 'text-success' : event.status === 'ARCHIVED' ? 'text-muted' : 'text-warning';
      return (
        <div className={cls}>
          {icon} {event.leadName} — {event.status}
          {event.icpFitScore != null && ` (${event.icpFitScore}/10)`}
        </div>
      );
    }

    case 'generating_message':
      return <div className="text-muted">Writing: {event.leadName} ({event.index}/{event.total})</div>;

    case 'message_generated':
      return <div className="text-success">Message ready: {event.leadName}</div>;

    case 'message_error':
      return <div className="text-danger">Message failed: {event.leadName}</div>;

    case 'complete':
      return <div className="text-success fw-bold mt-1">Done — {event.queued} leads queued for review</div>;

    case 'error':
      return <div className="text-danger fw-bold mt-1">Error: {event.error}</div>;

    default:
      return <div className="text-muted">{JSON.stringify(event)}</div>;
  }
}

function Spinner() {
  return (
    <div className="spinner-border spinner-border-sm text-primary" role="status">
      <span className="visually-hidden">Running...</span>
    </div>
  );
}

function StatusBadge({ campaign }) {
  if (!campaign.setupComplete) return <span className="badge bg-warning text-dark">Setup incomplete</span>;
  if (campaign.active) return <span className="badge bg-success">Active</span>;
  return <span className="badge bg-secondary">Paused</span>;
}

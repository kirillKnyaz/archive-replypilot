import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import API from '../../api';
import { useCampaignRun } from '../../hooks/useCampaignRun';
import LeadsTable from '../../components/campaigns/LeadsTable';

export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [leadsRefreshToken, setLeadsRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);

  const logEndRef = useRef(null);

  const { running, runEvents, runStats, startLiveRun, startLiveRequalify, checkForActiveRun, dismiss, cleanup } =
    useCampaignRun(id, fetchAll);

  useEffect(() => {
    fetchAll();
    checkForActiveRun();
    return cleanup;
  }, [id]);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
  }, [runEvents]);

  async function fetchAll() {
    try {
      const [campRes, allCampsRes] = await Promise.all([
        API.get(`/campaigns/${id}`),
        API.get('/campaigns'),
      ]);
      setCampaign(campRes.data);
      setCampaigns(allCampsRes.data);
      setLeadsRefreshToken((t) => t + 1);
    } catch (e) {
      console.error('Failed to load campaign', e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive() {
    const { data } = await API.patch(`/campaigns/${id}`, { active: !campaign.active });
    setCampaign(data);
  }

  if (loading) return <div className="container py-4"><p className="text-muted">Loading…</p></div>;
  if (!campaign) return <div className="container py-4"><p>Campaign not found.</p><Link to="/campaigns">Back</Link></div>;

  return (
    <div className="container-fluid py-4 px-4">
      {/* ── Header ── */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center gap-2">
          <Link to="/campaigns" className="btn btn-sm btn-outline-secondary">←</Link>
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

        <div className="d-flex gap-2">
          {campaign.setupComplete ? (
            <>
              <Link to={`/campaigns/${id}/config`} className="btn btn-sm btn-outline-secondary">
                Config
              </Link>
              <button
                className={`btn btn-sm ${campaign.active ? 'btn-outline-warning' : 'btn-outline-success'}`}
                onClick={toggleActive}
              >
                {campaign.active ? 'Pause' : 'Activate'}
              </button>
              <button
                className="btn btn-sm btn-outline-primary"
                disabled={running}
                onClick={() => {
                  if (window.confirm('Re-score all archived, queued, and qualified leads with current criteria?')) {
                    startLiveRequalify();
                  }
                }}
              >
                Requalify
              </button>
              <button className="btn btn-sm btn-primary" onClick={startLiveRun} disabled={running}>
                {running ? 'Running…' : 'Run now'}
              </button>
            </>
          ) : (
            <Link to={`/campaigns/${id}/setup`} className="btn btn-sm btn-outline-primary">
              Continue Setup
            </Link>
          )}
        </div>
      </div>

      {/* ── Live run panel ── */}
      {(running || runEvents.length > 0) && (
        <LiveRunPanel
          events={runEvents}
          stats={runStats}
          running={running}
          logEndRef={logEndRef}
          onDismiss={dismiss}
        />
      )}

      {/* ── Leads ── */}
      <LeadsTable campaignId={id} refreshToken={leadsRefreshToken} />
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
    <div className={`card mb-4 ${isError ? 'border-danger' : isComplete ? 'border-success' : 'border-primary'}`}>
      <div className="card-header d-flex justify-content-between align-items-center py-2">
        <div className="d-flex align-items-center gap-2">
          {running && <Spinner />}
          <strong>{isComplete ? 'Run complete' : isError ? 'Run failed' : lastPhase?.message || 'Starting…'}</strong>
        </div>
        {!running && (
          <button className="btn btn-sm btn-outline-secondary" onClick={onDismiss}>Dismiss</button>
        )}
      </div>

      {stats && (
        <div className="card-body py-2 border-bottom">
          <div className="d-flex flex-wrap gap-3" style={{ fontSize: '0.85rem' }}>
            {stats.total && <span>Enriched: <strong>{stats.enriched || stats.created || 0}/{stats.total}</strong></span>}
            {stats.qualified != null && <span className="text-success">Qualified: <strong>{stats.qualified}</strong></span>}
            {stats.archived != null && <span className="text-muted">Archived: <strong>{stats.archived}</strong></span>}
            {stats.queued != null && <span className="text-primary">Queued: <strong>{stats.queued}</strong></span>}
            {stats.discovered != null && <span>Discovered: <strong>{stats.discovered}</strong></span>}
          </div>
        </div>
      )}

      <div
        ref={logEndRef}
        className="card-body p-2"
        style={{ maxHeight: 250, overflowY: 'auto', fontSize: '0.8rem', fontFamily: 'monospace' }}
      >
        {events.map((e, i) => <EventLine key={i} event={e} />)}
      </div>
    </div>
  );
}

function EventLine({ event }) {
  switch (event.type) {
    case 'phase':
      return <div className="text-primary fw-bold mt-1">{event.message}</div>;
    case 'discovery_complete':
      return <div className="text-success">Found {event.discovered} businesses ({event.newPlaces} new, {event.filtered} filtered)</div>;
    case 'leads_created':
      return <div className="text-success">Created {event.created} leads</div>;
    case 'enriching_lead':
      return <div className="text-muted">Enriching: {event.leadName} ({event.index}/{event.total})</div>;
    case 'lead_qualified': {
      const icon = event.status === 'QUALIFIED' ? '+' : event.status === 'ARCHIVED' ? '-' : '?';
      const cls  = event.status === 'QUALIFIED' ? 'text-success' : event.status === 'ARCHIVED' ? 'text-muted' : 'text-warning';
      return <div className={cls}>{icon} {event.leadName} — {event.status}{event.icpFitScore != null && ` (${event.icpFitScore}/10)`}</div>;
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
  return <div className="spinner-border spinner-border-sm text-primary" role="status"><span className="visually-hidden">Running…</span></div>;
}

function StatusBadge({ campaign }) {
  if (!campaign.setupComplete) return <span className="badge bg-warning text-dark">Setup incomplete</span>;
  if (campaign.active) return <span className="badge bg-success">Active</span>;
  return <span className="badge bg-secondary">Paused</span>;
}

import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import API from "../../api";

export default function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [leads, setLeads] = useState([]);
  const [runs, setRuns] = useState([]);
  const [tab, setTab] = useState("leads");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  // Live run state
  const [running, setRunning] = useState(false);
  const [runEvents, setRunEvents] = useState([]);
  const [runStats, setRunStats] = useState(null);
  const eventSourceRef = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => {
    fetchAll();
    checkForActiveRun();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [id]);

  // Auto-scroll event log
  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [runEvents]);

  async function fetchAll() {
    try {
      const [campRes, leadsRes, runsRes] = await Promise.all([
        API.get(`/campaigns/${id}`),
        API.get(`/campaigns/${id}/leads`),
        API.get(`/campaigns/${id}/runs`),
      ]);
      setCampaign(campRes.data);
      setLeads(leadsRes.data);
      setRuns(runsRes.data);
    } catch (e) {
      console.error("Failed to load campaign detail", e);
    } finally {
      setLoading(false);
    }
  }

  // Check for an active run on mount (reconnect after refresh)
  async function checkForActiveRun() {
    try {
      const { data } = await API.get(`/campaigns/${id}/run/status`);
      if (data.active) {
        connectToSSE();
      }
    } catch {}
  }

  // Connect to the SSE stream (works for both new runs and reconnects)
  function connectToSSE() {
    // Close existing connection if any
    if (eventSourceRef.current) eventSourceRef.current.close();

    setRunning(true);

    const token = localStorage.getItem("token");
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
    const url = `${baseUrl}/campaigns/${id}/run/live?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    // For reconnects: we'll receive all buffered events, so reset state
    const allEvents = [];

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        allEvents.push(event);
        setRunEvents([...allEvents]);

        if (event.type === "lead_qualified") {
          setRunStats({
            enriched: event.index,
            total: event.total,
            qualified: event.qualified,
            archived: event.archived,
            errors: event.errors,
          });
        }

        if (event.type === "complete") {
          setRunStats(event);
          es.close();
          setRunning(false);
          fetchAll();
        }

        if (event.type === "error") {
          es.close();
          setRunning(false);
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      setRunning(false);
    };
  }

  async function startLiveRun() {
    setRunEvents([]);
    setRunStats(null);

    try {
      const { data } = await API.post(`/campaigns/${id}/run`);
      if (data.alreadyRunning) {
        // Already running — just connect to watch
        connectToSSE();
        return;
      }
      // Give the server a moment to register the run, then connect
      setTimeout(() => connectToSSE(), 100);
    } catch (e) {
      console.error("Failed to start run", e);
    }
  }

  async function toggleActive() {
    try {
      const { data } = await API.patch(`/campaigns/${id}`, { active: !campaign.active });
      setCampaign(data);
    } catch (e) {
      console.error("Toggle failed", e);
    }
  }

  if (loading) {
    return (
      <div className="container py-4">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container py-4">
        <p>Campaign not found.</p>
        <Link to="/campaigns">Back to campaigns</Link>
      </div>
    );
  }

  const filteredLeads = statusFilter ? leads.filter((l) => l.status === statusFilter) : leads;

  const statusCounts = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Link to="/campaigns" className="btn btn-sm btn-outline-secondary">
              &larr;
            </Link>
            <h4 className="m-0">{campaign.name}</h4>
            <StatusBadge campaign={campaign} />
          </div>
          <small className="text-muted">
            {campaign.vertical} · {campaign.location} · {campaign.offer}
          </small>
        </div>
        <div className="d-flex gap-2">
          {campaign.setupComplete && (
            <>
              <button
                className={`btn btn-sm ${campaign.active ? "btn-outline-warning" : "btn-outline-success"}`}
                onClick={toggleActive}
              >
                {campaign.active ? "Pause" : "Activate"}
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={startLiveRun}
                disabled={running}
              >
                {running ? "Running..." : "Run now"}
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

      {/* Config summary */}
      <div className="card card-body mb-3" style={{ fontSize: "0.85rem" }}>
        <div className="row">
          <div className="col-md-6">
            <strong>Angle:</strong> {campaign.angle || "—"}
            <br />
            <strong>Qualifier:</strong> {campaign.qualifier || "—"}
          </div>
          <div className="col-md-6">
            <strong>Tone:</strong> {campaign.tone || "—"}
            <br />
            <strong>Daily target:</strong> {campaign.dailyTarget}
          </div>
        </div>
      </div>

      {/* Live run panel */}
      {(running || runEvents.length > 0) && (
        <LiveRunPanel
          events={runEvents}
          stats={runStats}
          running={running}
          logEndRef={logEndRef}
          onDismiss={() => { setRunEvents([]); setRunStats(null); }}
        />
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${tab === "leads" ? "active" : ""}`}
            onClick={() => setTab("leads")}
          >
            Leads ({leads.length})
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${tab === "runs" ? "active" : ""}`}
            onClick={() => setTab("runs")}
          >
            Runs ({runs.length})
          </button>
        </li>
      </ul>

      {/* Leads tab */}
      {tab === "leads" && (
        <>
          <div className="d-flex flex-wrap gap-1 mb-3">
            <button
              className={`btn btn-sm ${!statusFilter ? "btn-dark" : "btn-outline-dark"}`}
              onClick={() => setStatusFilter("")}
            >
              All ({leads.length})
            </button>
            {Object.entries(statusCounts).map(([s, count]) => (
              <button
                key={s}
                className={`btn btn-sm ${statusFilter === s ? "btn-dark" : "btn-outline-dark"}`}
                onClick={() => setStatusFilter(s)}
              >
                {s} ({count})
              </button>
            ))}
          </div>

          {filteredLeads.length === 0 ? (
            <p className="text-muted">
              No leads{statusFilter ? ` with status ${statusFilter}` : ""}.
            </p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {filteredLeads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Runs tab */}
      {tab === "runs" && (
        <>
          {runs.length === 0 ? (
            <p className="text-muted">No runs yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Discovered</th>
                    <th>Filtered</th>
                    <th>Queued</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.runAt).toLocaleString()}</td>
                      <td>
                        <RunStatusBadge status={r.status} />
                      </td>
                      <td>{r.leadsDiscovered}</td>
                      <td>{r.leadsFiltered}</td>
                      <td>{r.leadsQueued}</td>
                      <td>
                        {r.errorMessage && (
                          <small className="text-danger">{r.errorMessage}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Live Run Panel ──

function LiveRunPanel({ events, stats, running, logEndRef, onDismiss }) {
  // Determine current phase
  const lastPhase = [...events].reverse().find((e) => e.type === "phase");
  const lastEvent = events[events.length - 1];
  const isComplete = lastEvent?.type === "complete";
  const isError = lastEvent?.type === "error";

  return (
    <div className={`card mb-3 ${isError ? "border-danger" : isComplete ? "border-success" : "border-primary"}`}>
      <div className="card-header d-flex justify-content-between align-items-center py-2">
        <div className="d-flex align-items-center gap-2">
          {running && <Spinner />}
          <strong>
            {isComplete ? "Run complete" : isError ? "Run failed" : lastPhase?.message || "Starting..."}
          </strong>
        </div>
        {!running && (
          <button className="btn btn-sm btn-outline-secondary" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="card-body py-2 border-bottom">
          <div className="d-flex flex-wrap gap-3" style={{ fontSize: "0.85rem" }}>
            {stats.total && (
              <span>
                Enriched: <strong>{stats.enriched || stats.created || 0}/{stats.total}</strong>
              </span>
            )}
            {stats.qualified != null && (
              <span className="text-success">
                Qualified: <strong>{stats.qualified}</strong>
              </span>
            )}
            {stats.archived != null && (
              <span className="text-muted">
                Archived: <strong>{stats.archived}</strong>
              </span>
            )}
            {stats.queued != null && (
              <span className="text-primary">
                Queued: <strong>{stats.queued}</strong>
              </span>
            )}
            {stats.discovered != null && (
              <span>
                Discovered: <strong>{stats.discovered}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Event log */}
      <div
        className="card-body p-2"
        style={{ maxHeight: 250, overflowY: "auto", fontSize: "0.8rem", fontFamily: "monospace" }}
      >
        {events.map((e, i) => (
          <EventLine key={i} event={e} />
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function EventLine({ event }) {
  const e = event;

  switch (e.type) {
    case "phase":
      return <div className="text-primary fw-bold mt-1">{e.message}</div>;

    case "discovery_complete":
      return (
        <div className="text-success">
          Found {e.discovered} businesses ({e.newPlaces} new, {e.filtered} filtered)
        </div>
      );

    case "leads_created":
      return <div className="text-success">Created {e.created} leads</div>;

    case "enriching_lead":
      return <div className="text-muted">Enriching: {e.leadName} ({e.index}/{e.total})</div>;

    case "lead_qualified": {
      const icon = e.status === "QUALIFIED" ? "+" : e.status === "ARCHIVED" ? "-" : "?";
      const cls =
        e.status === "QUALIFIED" ? "text-success" : e.status === "ARCHIVED" ? "text-muted" : "text-warning";
      return (
        <div className={cls}>
          {icon} {e.leadName} — {e.status}
          {e.icpFitScore != null && ` (${e.icpFitScore}/10)`}
        </div>
      );
    }

    case "generating_message":
      return <div className="text-muted">Writing: {e.leadName} ({e.index}/{e.total})</div>;

    case "message_generated":
      return <div className="text-success">Message ready: {e.leadName}</div>;

    case "message_error":
      return <div className="text-danger">Message failed: {e.leadName}</div>;

    case "complete":
      return (
        <div className="text-success fw-bold mt-1">
          Done — {e.queued} leads queued for review
        </div>
      );

    case "error":
      return <div className="text-danger fw-bold mt-1">Error: {e.error}</div>;

    default:
      return <div className="text-muted">{JSON.stringify(e)}</div>;
  }
}

function Spinner() {
  return (
    <div className="spinner-border spinner-border-sm text-primary" role="status">
      <span className="visually-hidden">Running...</span>
    </div>
  );
}

// ── Shared components ──

function LeadRow({ lead }) {
  return (
    <div className="card">
      <div className="card-body py-2 d-flex justify-content-between align-items-center">
        <div>
          <strong>{lead.name}</strong>
          <small className="text-muted ms-2">
            {lead.type && `${lead.type} · `}
            {lead.location}
          </small>
          {lead.icpFitScore != null && (
            <span className="ms-2">
              <FitBadge score={lead.icpFitScore} />
            </span>
          )}
        </div>
        <div className="d-flex align-items-center gap-2">
          <LeadStatusBadge status={lead.status} />
          {lead.website && (
            <a
              href={lead.website}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline-secondary"
            >
              Web
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ campaign }) {
  if (!campaign.setupComplete)
    return <span className="badge bg-warning text-dark">Setup incomplete</span>;
  if (campaign.active) return <span className="badge bg-success">Active</span>;
  return <span className="badge bg-secondary">Paused</span>;
}

function LeadStatusBadge({ status }) {
  const map = {
    DISCOVERED: "bg-info",
    ENRICHED: "bg-info",
    QUALIFIED: "bg-primary",
    QUEUED: "bg-success",
    CONTACTED: "bg-secondary",
    ARCHIVED: "bg-dark",
  };
  return <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>;
}

function RunStatusBadge({ status }) {
  const map = { RUNNING: "bg-warning text-dark", COMPLETE: "bg-success", ERROR: "bg-danger" };
  return <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>;
}

function FitBadge({ score }) {
  let cls = "bg-secondary";
  if (score >= 8) cls = "bg-success";
  else if (score >= 6) cls = "bg-primary";
  else if (score >= 4) cls = "bg-warning text-dark";
  else cls = "bg-danger";
  return <span className={`badge ${cls}`}>{score}/10</span>;
}

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import API from "../../api";

const CHANNELS = ["EMAIL", "PHONE", "DM", "DROP_IN"];
const CHANNEL_LABELS = { EMAIL: "Email", PHONE: "Phone", DM: "DM", DROP_IN: "Drop-in" };

const COMMON_RESULTS = ["NO_ANSWER", "VOICEMAIL", "POSITIVE", "NEGATIVE", "FOLLOW_UP_REQUESTED", "NOT_NOW"];
const RARE_RESULTS   = ["GATEKEEPER", "CONVERSATION", "DO_NOT_CONTACT"];
const RESULT_LABELS  = {
  NO_ANSWER: "No answer", VOICEMAIL: "Voicemail", POSITIVE: "Positive",
  NEGATIVE: "Negative", FOLLOW_UP_REQUESTED: "Follow-up requested",
  NOT_NOW: "Not now", GATEKEEPER: "Gatekeeper",
  CONVERSATION: "Conversation", DO_NOT_CONTACT: "Do not contact",
};

export default function LeadPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [lead, setLead]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [message, setMessage]     = useState("");
  const [messageDirty, setMessageDirty] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [copied, setCopied]       = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState(null);

  // Reach log state
  const [reaches, setReaches]           = useState([]);
  const [reachChannel, setReachChannel] = useState("PHONE");
  const [reachResult, setReachResult]   = useState(null);
  const [transcript, setTranscript]     = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [loggingReach, setLoggingReach] = useState(false);
  const [expandedReach, setExpandedReach] = useState(null);

  useEffect(() => {
    API.get(`/leads/${id}`)
      .then(({ data }) => {
        setLead(data);
        setMessage(data.generatedMessage || "");
      })
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));

    API.get(`/leads/${id}/reaches`)
      .then(({ data }) => setReaches(data))
      .catch(() => {});
  }, [id]);

  async function updateStatus(status) {
    await API.patch(`/leads/${id}/status`, { status });
    setLead((prev) => ({ ...prev, status }));
  }

  async function saveMessage() {
    setSaving(true);
    try {
      await API.patch(`/leads/${id}/message`, { generatedMessage: message });
      setMessageDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function enrichViaMaps() {
    if (!lead.mapsUri) return;
    const startedAt = new Date(lead.lastMapsSyncAt || 0).getTime();
    const apiBase = (import.meta.env.VITE_API_URL || "http://localhost:3001/api").replace(/\/api\/?$/, "");
    window.postMessage({ type: "rp_enrich_request", leadId: lead.id, mapsUrl: lead.mapsUri, apiBase }, window.location.origin);
    setEnriching(true);
    setEnrichStatus("Capturing… (make sure the extension is installed)");
    const deadline = Date.now() + 60_000;
    const poll = async () => {
      if (Date.now() > deadline) {
        setEnriching(false);
        setEnrichStatus("Timed out — extension not installed or selectors failed.");
        return;
      }
      try {
        const { data } = await API.get(`/leads/${id}`);
        if (new Date(data.lastMapsSyncAt || 0).getTime() > startedAt) {
          setLead(data);
          setEnriching(false);
          setEnrichStatus("Enrichment complete.");
          setTimeout(() => setEnrichStatus(null), 3000);
          return;
        }
      } catch {}
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 2000);
  }

  async function logReach() {
    if (!reachResult) return;
    setLoggingReach(true);
    try {
      const { data } = await API.post(`/leads/${id}/reaches`, {
        channel: reachChannel,
        result: reachResult,
        transcript: transcript || undefined,
      });
      setReaches((prev) => [data, ...prev]);
      setLead((prev) => ({ ...prev, followUpCount: (prev.followUpCount || 0) + 1, lastReachedAt: data.createdAt, activeChannel: reachChannel }));
      setReachResult(null);
      setTranscript("");
      setShowTranscript(false);
    } finally {
      setLoggingReach(false);
    }
  }

  if (loading) return <div className="container py-4"><p className="text-muted">Loading…</p></div>;
  if (!lead) return null;

  const contacts = [
    lead.email    && { label: "Email",     href: `mailto:${lead.email}`,  value: lead.email },
    lead.phone    && { label: "Phone",     href: `tel:${lead.phone}`,     value: lead.phone },
    lead.instagram && { label: "Instagram", href: lead.instagram,          value: lead.instagram },
    lead.facebook  && { label: "Facebook",  href: lead.facebook,           value: lead.facebook },
    lead.tiktok    && { label: "TikTok",    href: lead.tiktok,             value: lead.tiktok },
  ].filter(Boolean);

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <button className="btn btn-link btn-sm p-0 mb-3 text-muted text-decoration-none" onClick={() => navigate(-1)}>
        ← Back
      </button>

      {/* ── Header ── */}
      <div className="d-flex justify-content-between align-items-start mb-1">
        <div>
          <h4 className="mb-1">{lead.name}</h4>
          <div className="text-muted" style={{ fontSize: "0.88rem" }}>
            {lead.type && <span>{lead.type} · </span>}
            <span>{lead.location}</span>
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          {lead.icpFitScore != null && <FitBadge score={lead.icpFitScore} />}
          <LeadStatusBadge status={lead.status} />
        </div>
      </div>

      {lead.campaign && (
        <div className="mb-3" style={{ fontSize: "0.83rem" }}>
          <Link to={`/campaigns/${lead.campaign.id}`} className="text-decoration-none text-muted">
            {lead.campaign.name}
          </Link>
          {lead.campaign.offer && <span className="text-muted ms-1">· {lead.campaign.offer}</span>}
        </div>
      )}

      {/* ── Fit reason ── */}
      {lead.icpFitReason && (
        <div className="mb-3 text-muted" style={{ fontSize: "0.85rem", borderLeft: "3px solid #e5e7eb", paddingLeft: 12 }}>
          {lead.icpFitReason}
        </div>
      )}

      {lead.noContactFound && (
        <div className="alert alert-warning py-2 px-3 mb-3" style={{ fontSize: "0.85rem" }}>
          No contact found — consider visiting in person.
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="d-flex gap-2 mb-4 flex-wrap align-items-center">
        {lead.status !== "CONTACTED" && (
          <button className="btn btn-sm btn-outline-success" onClick={() => updateStatus("CONTACTED")}>Mark contacted</button>
        )}
        {lead.status === "CONTACTED" && (
          <button className="btn btn-sm btn-outline-secondary" onClick={() => updateStatus("QUEUED")}>Move back to queue</button>
        )}
        {lead.status !== "ARCHIVED" && (
          <button className="btn btn-sm btn-outline-secondary" onClick={() => updateStatus("ARCHIVED")}>Archive</button>
        )}
        {lead.status === "ARCHIVED" && (
          <button className="btn btn-sm btn-outline-primary" onClick={() => updateStatus("QUEUED")}>Restore to queue</button>
        )}
        {lead.website && (
          <div className="d-flex align-items-center gap-1">
            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-secondary">
              Website ↗
            </a>
            {lead.websiteQuality != null && (
              <WebsiteQualityBadge score={lead.websiteQuality} reason={lead.websiteQualityReason} />
            )}
          </div>
        )}
        {lead.mapsUri && (
          <a href={lead.mapsUri} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-secondary">Maps ↗</a>
        )}
        {lead.mapsUri && (
          <button className="btn btn-sm btn-outline-primary" onClick={enrichViaMaps} disabled={enriching}>
            {enriching ? "Enriching…" : "Enrich via Maps"}
          </button>
        )}
      </div>
      {enrichStatus && (
        <div className="alert alert-info py-2 px-3 mb-3" style={{ fontSize: "0.85rem" }}>{enrichStatus}</div>
      )}

      {/* ── Main two-column layout ── */}
      <div className="row g-3">

        {/* LEFT — contact + maps + business */}
        <div className="col-md-5">
          <div className="card mb-3">
            <div className="card-body">
              <h6 className="card-title mb-3">Contact</h6>
              {contacts.length === 0 ? (
                <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>No contact info found.</p>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {contacts.map((c) => (
                    <div key={c.label} style={{ fontSize: "0.85rem" }}>
                      <span className="text-muted me-2" style={{ minWidth: 70, display: "inline-block" }}>{c.label}</span>
                      <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-break">{c.value}</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {lead.lastMapsSyncAt && (
            <div className="card mb-3">
              <div className="card-body">
                <h6 className="card-title mb-3">Google Maps</h6>
                <div style={{ fontSize: "0.85rem" }}>
                  {lead.reviewCount != null && (
                    <div className="mb-1">
                      <strong>{lead.reviewCount}</strong> reviews
                      {lead.reviewAvg != null && <> · <strong>{lead.reviewAvg}</strong> avg</>}
                    </div>
                  )}
                  {lead.photoCount != null && <div className="mb-1">{lead.photoCount} photos</div>}
                  {lead.ownerClaimed != null && (
                    <div className="mb-1">
                      Owner: {lead.ownerClaimed ? "claimed" : "unclaimed"}
                      {lead.ownerResponseRate != null && <> · {Math.round(lead.ownerResponseRate * 100)}% response rate</>}
                    </div>
                  )}
                  {lead.hoursText && <div className="text-muted mt-2">{lead.hoursText}</div>}
                  {lead.attributes?.length > 0 && (
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      {lead.attributes.map((a) => (
                        <span key={a} className="badge bg-light text-dark border" style={{ fontSize: "0.72rem" }}>{a}</span>
                      ))}
                    </div>
                  )}
                  {Array.isArray(lead.reviewSamples) && lead.reviewSamples.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-muted" style={{ cursor: "pointer" }}>
                        Reviews ({lead.reviewSamples.length})
                      </summary>
                      <div className="mt-2 d-flex flex-column gap-2">
                        {lead.reviewSamples.map((r, i) => (
                          <div key={i} className="border-start ps-2" style={{ borderColor: "#e5e7eb" }}>
                            <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                              {r.author || "Anonymous"}{r.rating ? ` · ${r.rating}/5` : ""}
                            </div>
                            <div>{r.text}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-body">
              <h6 className="card-title mb-3">Business</h6>
              {lead.description && (
                <p style={{ fontSize: "0.85rem" }} className="mb-2">{lead.description}</p>
              )}
              {lead.keywords?.length > 0 && (
                <div className="d-flex flex-wrap gap-1">
                  {lead.keywords.map((k) => (
                    <span key={k} className="badge bg-light text-dark border" style={{ fontSize: "0.75rem" }}>{k}</span>
                  ))}
                </div>
              )}
              {!lead.description && !lead.keywords?.length && (
                <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>No details enriched yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — reach log + message */}
        <div className="col-md-7">

          {/* Log a reach */}
          <div className="card mb-3">
            <div className="card-body">
              <h6 className="card-title mb-3">
                Log a reach
                {lead.followUpCount > 0 && (
                  <span className="text-muted fw-normal ms-2" style={{ fontSize: "0.8rem" }}>
                    {lead.followUpCount} logged
                  </span>
                )}
              </h6>

              {/* Channel */}
              <div className="d-flex gap-1 mb-2 flex-wrap">
                {CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    className={`btn btn-sm ${reachChannel === ch ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setReachChannel(ch)}
                  >
                    {CHANNEL_LABELS[ch]}
                  </button>
                ))}
              </div>

              {/* Result — common */}
              <div className="d-flex gap-1 mb-2 flex-wrap">
                {COMMON_RESULTS.map((r) => (
                  <button
                    key={r}
                    className={`btn btn-sm ${reachResult === r ? "btn-dark" : "btn-outline-secondary"}`}
                    style={{ fontSize: "0.78rem" }}
                    onClick={() => setReachResult(r)}
                  >
                    {RESULT_LABELS[r]}
                  </button>
                ))}
              </div>

              {/* Result — rare */}
              <select
                className="form-select form-select-sm mb-2"
                style={{ width: "auto" }}
                value={RARE_RESULTS.includes(reachResult) ? reachResult : ""}
                onChange={(e) => setReachResult(e.target.value || null)}
              >
                <option value="">More results…</option>
                {RARE_RESULTS.map((r) => (
                  <option key={r} value={r}>{RESULT_LABELS[r]}</option>
                ))}
              </select>

              {/* Transcript */}
              {!showTranscript ? (
                <button className="btn btn-link btn-sm p-0 text-muted" onClick={() => setShowTranscript(true)}>
                  + Add note
                </button>
              ) : (
                <textarea
                  className="form-control form-control-sm mb-2"
                  rows={3}
                  placeholder="Optional transcript or notes…"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  autoFocus
                />
              )}

              <div className="mt-2">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={logReach}
                  disabled={!reachResult || loggingReach}
                >
                  {loggingReach ? "Logging…" : "Log reach"}
                </button>
              </div>
            </div>
          </div>

          {/* Reach history */}
          {reaches.length > 0 && (
            <div className="card mb-3">
              <div className="card-body">
                <h6 className="card-title mb-3">Reach history</h6>
                <div className="d-flex flex-column gap-2">
                  {reaches.map((r) => (
                    <div key={r.id} style={{ fontSize: "0.83rem" }}>
                      <div className="d-flex align-items-center gap-2">
                        <span className="text-muted" style={{ minWidth: 52 }}>{CHANNEL_LABELS[r.channel]}</span>
                        <ResultBadge result={r.result} />
                        <span className="text-muted ms-auto" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                          {relativeTime(r.createdAt)}
                        </span>
                      </div>
                      {r.transcript && (
                        <div
                          className="text-muted mt-1 ps-1"
                          style={{ cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expandedReach === r.id ? "normal" : "nowrap" }}
                          onClick={() => setExpandedReach(expandedReach === r.id ? null : r.id)}
                        >
                          {r.transcript}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Outreach message */}
          <div className="card">
            <div className="card-body">
              <h6 className="card-title mb-3">Outreach message</h6>
              {message ? (
                <>
                  <textarea
                    className="form-control mb-2"
                    rows={8}
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); setMessageDirty(true); }}
                    style={{ fontSize: "0.88rem", resize: "vertical" }}
                  />
                  <div className="d-flex gap-2">
                    <button className={`btn btn-sm ${copied ? "btn-success" : "btn-primary"}`} onClick={copyMessage}>
                      {copied ? "Copied!" : "Copy message"}
                    </button>
                    {messageDirty && (
                      <button className="btn btn-sm btn-outline-secondary" onClick={saveMessage} disabled={saving}>
                        {saving ? "Saving…" : "Save edits"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>No message generated yet.</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ResultBadge({ result }) {
  const colors = {
    POSITIVE: "bg-success text-white",
    FOLLOW_UP_REQUESTED: "bg-warning text-dark",
    NOT_NOW: "bg-warning text-dark",
    NEGATIVE: "bg-danger text-white",
    DO_NOT_CONTACT: "bg-danger text-white",
  };
  const cls = colors[result] || "bg-light text-dark border";
  return (
    <span className={`badge ${cls}`} style={{ fontSize: "0.72rem" }}>
      {RESULT_LABELS[result] || result}
    </span>
  );
}

function WebsiteQualityBadge({ score, reason }) {
  let cls = "bg-success text-white";
  if (score <= 3) cls = "bg-danger text-white";
  else if (score <= 6) cls = "bg-warning text-dark";
  return (
    <span className={`badge ${cls}`} title={reason || ""} style={{ cursor: "default" }}>
      Web {score}/10
    </span>
  );
}

function FitBadge({ score }) {
  let cls = "bg-secondary";
  if (score >= 8) cls = "bg-success";
  else if (score >= 6) cls = "bg-primary";
  else if (score >= 4) cls = "bg-warning text-dark";
  else cls = "bg-danger";
  return <span className={`badge ${cls}`}>Fit {score}/10</span>;
}

function LeadStatusBadge({ status }) {
  const map = {
    DISCOVERED: "bg-light text-dark border",
    ENRICHED:   "bg-light text-dark border",
    QUALIFIED:  "bg-info text-dark",
    QUEUED:     "bg-primary",
    CONTACTED:  "bg-success",
    ARCHIVED:   "bg-secondary",
  };
  return <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>;
}

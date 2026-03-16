import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import API from "../../api";

export default function LeadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageDirty, setMessageDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    API.get(`/leads/${id}`)
      .then(({ data }) => {
        setLead(data);
        setMessage(data.generatedMessage || "");
      })
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));
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

  if (loading) {
    return (
      <div className="container py-4">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (!lead) return null;

  const contacts = [
    lead.email && { label: "Email", href: `mailto:${lead.email}`, value: lead.email },
    lead.phone && { label: "Phone", href: `tel:${lead.phone}`, value: lead.phone },
    lead.instagram && { label: "Instagram", href: lead.instagram, value: lead.instagram },
    lead.facebook && { label: "Facebook", href: lead.facebook, value: lead.facebook },
    lead.tiktok && { label: "TikTok", href: lead.tiktok, value: lead.tiktok },
  ].filter(Boolean);

  return (
    <div className="container py-4" style={{ maxWidth: 860 }}>
      <button
        className="btn btn-link btn-sm p-0 mb-3 text-muted text-decoration-none"
        onClick={() => navigate(-1)}
      >
        ← Back
      </button>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-1">
        <div>
          <h4 className="mb-1">{lead.name}</h4>
          <div className="text-muted" style={{ fontSize: "0.9rem" }}>
            {lead.type && <span>{lead.type} · </span>}
            <span>{lead.location}</span>
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          {lead.icpFitScore != null && <FitBadge score={lead.icpFitScore} />}
          <LeadStatusBadge status={lead.status} />
        </div>
      </div>

      {/* Campaign link */}
      {lead.campaign && (
        <div className="mb-3" style={{ fontSize: "0.85rem" }}>
          Campaign:{" "}
          <Link to={`/campaigns/${lead.campaign.id}`} className="text-decoration-none">
            {lead.campaign.name}
          </Link>
          {lead.campaign.offer && (
            <span className="text-muted ms-1">· {lead.campaign.offer}</span>
          )}
        </div>
      )}

      {/* Flags */}
      {lead.noContactFound && (
        <div className="alert alert-warning py-2 px-3 mb-3" style={{ fontSize: "0.85rem" }}>
          No contact found — consider visiting in person.
        </div>
      )}
      {lead.inactiveSuspected && (
        <div className="alert alert-secondary py-2 px-3 mb-3" style={{ fontSize: "0.85rem" }}>
          Possibly inactive — sparse listing or no website.
        </div>
      )}

      {/* Action buttons */}
      <div className="d-flex gap-2 mb-4 flex-wrap">
        {lead.status !== "CONTACTED" && (
          <button
            className="btn btn-sm btn-outline-success"
            onClick={() => updateStatus("CONTACTED")}
          >
            Mark contacted
          </button>
        )}
        {lead.status === "CONTACTED" && (
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => updateStatus("QUEUED")}
          >
            Move back to queue
          </button>
        )}
        {lead.status !== "ARCHIVED" && (
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => updateStatus("ARCHIVED")}
          >
            Archive
          </button>
        )}
        {lead.status === "ARCHIVED" && (
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => updateStatus("QUEUED")}
          >
            Restore to queue
          </button>
        )}
        {lead.website && (
          <a
            href={lead.website}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline-secondary"
          >
            Website ↗
          </a>
        )}
        {lead.mapsUri && (
          <a
            href={lead.mapsUri}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline-secondary"
          >
            Google Maps ↗
          </a>
        )}
      </div>

      <div className="row g-3">
        {/* Left col: contact info + business details */}
        <div className="col-md-5">
          <div className="card mb-3">
            <div className="card-body">
              <h6 className="card-title mb-3">Contact</h6>
              {contacts.length === 0 ? (
                <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>
                  No contact info found.
                </p>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {contacts.map((c) => (
                    <div key={c.label} style={{ fontSize: "0.85rem" }}>
                      <span className="text-muted me-2" style={{ minWidth: 70, display: "inline-block" }}>
                        {c.label}
                      </span>
                      <a
                        href={c.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-break"
                      >
                        {c.value}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h6 className="card-title mb-3">Business details</h6>
              {lead.description && (
                <p style={{ fontSize: "0.85rem" }} className="mb-2">
                  {lead.description}
                </p>
              )}
              {lead.keywords?.length > 0 && (
                <div className="d-flex flex-wrap gap-1">
                  {lead.keywords.map((k) => (
                    <span
                      key={k}
                      className="badge bg-light text-dark border"
                      style={{ fontSize: "0.75rem" }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
              {!lead.description && !lead.keywords?.length && (
                <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>
                  No details enriched yet.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right col: fit reason + message */}
        <div className="col-md-7">
          {lead.icpFitReason && (
            <div className="card mb-3">
              <div className="card-body">
                <h6 className="card-title mb-1">Why this lead?</h6>
                <p className="mb-0 text-muted" style={{ fontSize: "0.85rem" }}>
                  {lead.icpFitReason}
                </p>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-body">
              <h6 className="card-title mb-3">Outreach message</h6>
              {message ? (
                <>
                  <textarea
                    className="form-control mb-2"
                    rows={8}
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      setMessageDirty(true);
                    }}
                    style={{ fontSize: "0.9rem", resize: "vertical" }}
                  />
                  <div className="d-flex gap-2">
                    <button
                      className={`btn btn-sm ${copied ? "btn-success" : "btn-primary"}`}
                      onClick={copyMessage}
                    >
                      {copied ? "Copied!" : "Copy message"}
                    </button>
                    {messageDirty && (
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={saveMessage}
                        disabled={saving}
                      >
                        {saving ? "Saving..." : "Save edits"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>
                  No message generated yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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
    ENRICHED: "bg-light text-dark border",
    QUALIFIED: "bg-info text-dark",
    QUEUED: "bg-primary",
    CONTACTED: "bg-success",
    ARCHIVED: "bg-secondary",
  };
  return <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>;
}

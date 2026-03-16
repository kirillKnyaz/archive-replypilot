import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../../api";

export default function ReviewDashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    fetchQueued();
  }, []);

  async function fetchQueued() {
    try {
      const { data } = await API.get("/campaigns/review/queued");
      setLeads(data);
    } catch (e) {
      console.error("Failed to fetch queued leads", e);
    } finally {
      setLoading(false);
    }
  }

  const grouped = leads.reduce((acc, lead) => {
    const key = lead.campaign?.id || "uncategorized";
    if (!acc[key]) acc[key] = { name: lead.campaign?.name || "Unknown", leads: [] };
    acc[key].leads.push(lead);
    return acc;
  }, {});

  async function updateStatus(leadId, status) {
    try {
      await API.patch(`/leads/${leadId}/status`, { status });
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (e) {
      console.error("Failed to update lead status", e);
    }
  }

  const copyMessage = useCallback(async (lead) => {
    if (!lead.generatedMessage) return;
    try {
      await navigator.clipboard.writeText(lead.generatedMessage);
      setCopied(lead.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      console.error("Clipboard write failed");
    }
  }, []);

  if (loading) {
    return (
      <div className="container py-4">
        <p className="text-muted">Loading today's leads...</p>
      </div>
    );
  }

  const totalQueued = leads.length;

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="m-0">Review Leads</h4>
          <small className="text-muted">{totalQueued} leads ready for outreach</small>
        </div>
        <Link to="/campaigns" className="btn btn-outline-secondary btn-sm">
          Campaigns
        </Link>
      </div>

      {totalQueued === 0 ? (
        <div className="text-center text-muted py-5">
          <p>No leads queued for review. Run a campaign to discover new leads.</p>
          <Link to="/campaigns" className="btn btn-primary btn-sm">
            Go to Campaigns
          </Link>
        </div>
      ) : (
        Object.entries(grouped).map(([campaignId, group]) => (
          <div key={campaignId} className="mb-4">
            <div className="d-flex align-items-center gap-2 mb-2">
              <h6 className="m-0">
                <Link to={`/campaigns/${campaignId}`} className="text-decoration-none">
                  {group.name}
                </Link>
              </h6>
              <span className="badge bg-primary">{group.leads.length}</span>
            </div>

            <div className="d-flex flex-column gap-2">
              {group.leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  copied={copied === lead.id}
                  onCopy={() => copyMessage(lead)}
                  onContacted={() => updateStatus(lead.id, "CONTACTED")}
                  onArchive={() => updateStatus(lead.id, "ARCHIVED")}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function LeadCard({ lead, copied, onCopy, onContacted, onArchive }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card">
      <div className="card-body">
        {/* Header row */}
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h6 className="mb-0">
              <Link to={`/leads/${lead.id}`} className="text-decoration-none text-dark">
                {lead.name}
              </Link>
            </h6>
            <small className="text-muted">
              {lead.type && `${lead.type} · `}
              {lead.location}
              {lead.icpFitScore != null && (
                <span className="ms-2">
                  <FitBadge score={lead.icpFitScore} />
                </span>
              )}
            </small>
          </div>
          <div className="d-flex gap-1">
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
            {lead.mapsUri && (
              <a
                href={lead.mapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline-secondary"
              >
                Map
              </a>
            )}
            <Link to={`/leads/${lead.id}`} className="btn btn-sm btn-outline-secondary">
              View
            </Link>
          </div>
        </div>

        {/* Flags */}
        {lead.noContactFound && (
          <div className="alert alert-warning py-1 px-2 mb-2" style={{ fontSize: "0.85rem" }}>
            No contact found — visit in person?
          </div>
        )}
        {lead.inactiveSuspected && (
          <div className="alert alert-secondary py-1 px-2 mb-2" style={{ fontSize: "0.85rem" }}>
            Possibly inactive — sparse listing or no website
          </div>
        )}

        {/* Fit reason */}
        {lead.icpFitReason && (
          <p className="text-muted mb-2" style={{ fontSize: "0.85rem" }}>
            {lead.icpFitReason}
          </p>
        )}

        {/* Contact info row */}
        <ContactRow lead={lead} />

        {/* Generated message */}
        {lead.generatedMessage && (
          <div className="mt-2">
            <div
              className="bg-light rounded p-2 mb-2"
              style={{
                fontSize: "0.9rem",
                whiteSpace: "pre-wrap",
                cursor: "pointer",
                maxHeight: expanded ? "none" : 120,
                overflow: "hidden",
              }}
              onClick={() => setExpanded(!expanded)}
            >
              {lead.generatedMessage}
            </div>
            {!expanded && lead.generatedMessage.length > 200 && (
              <button
                className="btn btn-link btn-sm p-0"
                onClick={() => setExpanded(true)}
              >
                Show full message
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="d-flex gap-2 mt-2">
          <button
            className={`btn btn-sm ${copied ? "btn-success" : "btn-primary"}`}
            onClick={onCopy}
            disabled={!lead.generatedMessage}
          >
            {copied ? "Copied!" : "Copy message"}
          </button>
          <button className="btn btn-sm btn-outline-success" onClick={onContacted}>
            Mark contacted
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={onArchive}>
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactRow({ lead }) {
  const contacts = [
    lead.email && { label: "Email", value: lead.email, href: `mailto:${lead.email}` },
    lead.phone && { label: "Phone", value: lead.phone, href: `tel:${lead.phone}` },
    lead.instagram && { label: "IG", value: "Instagram", href: lead.instagram },
    lead.facebook && { label: "FB", value: "Facebook", href: lead.facebook },
    lead.tiktok && { label: "TT", value: "TikTok", href: lead.tiktok },
  ].filter(Boolean);

  if (contacts.length === 0) return null;

  return (
    <div className="d-flex flex-wrap gap-2 mb-1" style={{ fontSize: "0.8rem" }}>
      {contacts.map((c) => (
        <a
          key={c.label}
          href={c.href}
          target="_blank"
          rel="noopener noreferrer"
          className="badge bg-light text-dark border text-decoration-none"
        >
          {c.label}: {c.value}
        </a>
      ))}
    </div>
  );
}

function FitBadge({ score }) {
  let cls = "bg-secondary";
  if (score >= 8) cls = "bg-success";
  else if (score >= 6) cls = "bg-primary";
  else if (score >= 4) cls = "bg-warning text-dark";
  else cls = "bg-danger";

  return <span className={`badge ${cls}`}>{score}/10</span>;
}

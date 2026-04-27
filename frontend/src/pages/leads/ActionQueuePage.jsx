import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../../api';

const CHANNEL_LABELS = { EMAIL: 'Email', PHONE: 'Phone', DM: 'DM', DROP_IN: 'Drop-in' };
const RESULT_LABELS  = {
  NO_ANSWER: 'No answer', VOICEMAIL: 'Voicemail', POSITIVE: 'Positive',
  NEGATIVE: 'Negative', FOLLOW_UP_REQUESTED: 'Follow-up requested', NOT_NOW: 'Not now',
  GATEKEEPER: 'Gatekeeper', CONVERSATION: 'Conversation', DO_NOT_CONTACT: 'Do not contact',
};

export default function ActionQueuePage() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/leads/action-queue')
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="container-fluid py-4 px-4"><p className="text-muted">Loading…</p></div>;
  if (!data)   return null;

  const { overdue, dueToday, newLeads, total } = data;

  return (
    <div className="container-fluid py-4 px-4">
      <div className="d-flex align-items-baseline gap-3 mb-4">
        <h5 className="mb-0">Action queue</h5>
        {total > 0 && <span className="text-muted" style={{ fontSize: '0.85rem' }}>{total} leads need attention</span>}
      </div>

      {total === 0 && (
        <div className="text-center py-5 text-muted">
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>✓</div>
          <div>Queue is clear. Run a campaign to discover more leads.</div>
        </div>
      )}

      {overdue.length  > 0 && <Section title="Overdue"   color="#dc2626" leads={overdue}  />}
      {dueToday.length > 0 && <Section title="Due today" color="#d97706" leads={dueToday} />}
      {newLeads.length > 0 && <Section title="New leads" color="#2563eb" leads={newLeads} />}
    </div>
  );
}

function Section({ title, color, leads }) {
  return (
    <div className="mb-4">
      <div className="fw-semibold mb-2" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color }}>
        {title} · {leads.length}
      </div>
      <div className="d-flex flex-column gap-2">
        {leads.map((lead) => <LeadRow key={lead.id} lead={lead} />)}
      </div>
    </div>
  );
}

function LeadRow({ lead }) {
  const latestReach = lead.reaches?.[0];
  return (
    <Link to={`/leads/${lead.id}`} className="card text-decoration-none text-dark">
      <div className="card-body py-2 px-3">
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div className="overflow-hidden">
            <div className="fw-semibold text-truncate" style={{ fontSize: '0.9rem' }}>{lead.name}</div>
            <div className="text-muted text-truncate" style={{ fontSize: '0.78rem' }}>
              {lead.campaign?.name}{lead.location ? ` · ${lead.location}` : ''}
            </div>
          </div>
          <div className="text-end flex-shrink-0">
            <div className="fw-medium text-primary" style={{ fontSize: '0.82rem' }}>{lead.suggestedAction}</div>
            {lead.nextFollowUpAt && (
              <div className="text-muted" style={{ fontSize: '0.72rem' }}>{relativeTime(lead.nextFollowUpAt)}</div>
            )}
          </div>
        </div>
        {latestReach && (
          <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
            Last: {CHANNEL_LABELS[latestReach.channel]} · {RESULT_LABELS[latestReach.result] || latestReach.result} · {relativeTime(latestReach.createdAt)}
          </div>
        )}
      </div>
    </Link>
  );
}

function relativeTime(iso) {
  const diffMs = new Date(iso).getTime() - Date.now();
  const absMins = Math.abs(Math.floor(diffMs / 60000));
  const future = diffMs > 0;

  if (absMins < 1) return 'just now';
  if (absMins < 60) return future ? `in ${absMins}m` : `${absMins}m ago`;
  const h = Math.floor(absMins / 60);
  if (h < 24) return future ? `in ${h}h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return future ? `in ${d}d` : `${d}d ago`;
}

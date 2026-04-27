import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import API from '../../api';

const PAGE_SIZE = 20;

const ALL_STATUSES = ['DISCOVERED', 'ENRICHED', 'QUALIFIED', 'QUEUED', 'CONTACTED', 'REPLIED', 'WON', 'ARCHIVED'];

const STATUS_STYLES = {
  DISCOVERED: { bg: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' },
  ENRICHED:   { bg: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' },
  QUALIFIED:  { bg: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' },
  QUEUED:     { bg: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' },
  CONTACTED:  { bg: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe' },
  REPLIED:    { bg: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' },
  WON:        { bg: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
  ARCHIVED:   { bg: '#f9fafb', color: '#9ca3af', border: '1px solid #e5e7eb' },
};

function statusLabel(s) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ');
}

export default function LeadsTable({ campaignId, refreshToken }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [leads, setLeads]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [fetching, setFetching] = useState(true);

  // Active statuses: Set of status strings. Empty = show all.
  const [activeStatuses, setActiveStatuses] = useState(() => {
    const s = searchParams.get('status');
    return s ? new Set(s.split(',')) : new Set();
  });

  const [nameFilter, setNameFilter]     = useState(() => searchParams.get('name') || '');
  const [debouncedName, setDebouncedName] = useState(() => searchParams.get('name') || '');
  const [page, setPage] = useState(() => parseInt(searchParams.get('page') || '0', 10));

  const [scrapingIds, setScrapingIds]   = useState(new Set());
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [bulkWorking, setBulkWorking]   = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);

  const selectAllRef = useRef(null);

  // Debounce name
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(nameFilter), 300);
    return () => clearTimeout(t);
  }, [nameFilter]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [debouncedName, activeStatuses]);

  // Sync state → URL
  useEffect(() => {
    const params = {};
    if (debouncedName)        params.name   = debouncedName;
    if (activeStatuses.size)  params.status = [...activeStatuses].join(',');
    if (page > 0)             params.page   = String(page);
    setSearchParams(params, { replace: true });
  }, [debouncedName, activeStatuses, page]);

  // Fetch leads
  useEffect(() => {
    let cancelled = false;
    setFetching(true);

    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (debouncedName)       params.set('name', debouncedName);
    if (activeStatuses.size) params.set('status', [...activeStatuses].join(','));

    API.get(`/campaigns/${campaignId}/leads?${params}`)
      .then(({ data }) => {
        if (cancelled) return;
        setLeads(data.leads);
        setTotal(data.total);
      })
      .catch((e) => console.error('Failed to fetch leads', e))
      .finally(() => { if (!cancelled) setFetching(false); });

    return () => { cancelled = true; };
  }, [campaignId, page, debouncedName, activeStatuses, refreshToken]);

  // Indeterminate select-all
  useEffect(() => {
    if (!selectAllRef.current) return;
    const allSel = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));
    const someSel = !allSel && leads.some((l) => selectedIds.has(l.id));
    selectAllRef.current.indeterminate = someSel;
  });

  // Extension phone updates
  useEffect(() => {
    function onMessage(e) {
      if (e.data?.type !== 'REPLYPILOT_PHONE') return;
      const { leadId, phone } = e.data;
      const lead = leads.find((l) => l.id === leadId);
      if (!lead || !phone) return;
      API.patch(`/leads/${leadId}`, { ...lead, phone });
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, phone } : l)));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [leads]);

  function toggleStatus(status) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const filtersActive = nameFilter || activeStatuses.size > 0;

  function clearFilters() {
    setNameFilter('');
    setDebouncedName('');
    setActiveStatuses(new Set());
    setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  function toggleSelect(leadId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  }

  function clearSelection() { setSelectedIds(new Set()); }

  async function deleteLead(leadId) {
    if (!window.confirm('Delete this lead?')) return;
    try {
      await API.delete(`/leads/${leadId}`);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setTotal((t) => t - 1);
    } catch (e) {
      console.error('Failed to delete lead', e);
    }
  }

  async function reScrape(leadId) {
    setScrapingIds((prev) => new Set([...prev, leadId]));
    try {
      const { data } = await API.post(`/leads/${leadId}/rescrape`);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? data : l)));
    } catch (e) {
      console.error('Failed to rescrape lead', e);
    } finally {
      setScrapingIds((prev) => { const next = new Set(prev); next.delete(leadId); return next; });
    }
  }

  async function bulkSetStatus(status) {
    const ids = [...selectedIds];
    setBulkWorking(true);
    try {
      await API.patch('/leads/bulk-status', { ids, status });
      setLeads((prev) => prev.map((l) => (selectedIds.has(l.id) ? { ...l, status } : l)));
      clearSelection();
    } catch (e) {
      console.error('Bulk status update failed', e);
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkRescrape() {
    const ids = [...selectedIds];
    setScrapingIds((prev) => new Set([...prev, ...ids]));
    clearSelection();
    await Promise.allSettled(
      ids.map(async (leadId) => {
        try {
          const { data } = await API.post(`/leads/${leadId}/rescrape`);
          setLeads((prev) => prev.map((l) => (l.id === leadId ? data : l)));
        } finally {
          setScrapingIds((prev) => { const next = new Set(prev); next.delete(leadId); return next; });
        }
      })
    );
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selectedIds.size} leads?`)) return;
    const ids = [...selectedIds];
    setBulkWorking(true);
    try {
      await API.delete('/leads/bulk', { data: { ids } });
      setLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)));
      setTotal((t) => t - ids.length);
      clearSelection();
    } catch (e) {
      console.error('Bulk delete failed', e);
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkEnrichViaMaps() {
    const ids = [...selectedIds];
    const targets = leads.filter((l) => ids.includes(l.id) && l.mapsUri);
    if (targets.length === 0) { window.alert('No selected leads have a Google Maps URL.'); return; }
    if (!window.confirm(`Open ${targets.length} Maps tabs sequentially to enrich? Keep the browser open.`)) return;

    setBulkWorking(true);
    const backendBase = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');

    try {
      for (let i = 0; i < targets.length; i++) {
        const lead = targets[i];
        setBulkProgress(`Enriching ${i + 1}/${targets.length}: ${lead.name}`);
        const startedAt = new Date(lead.lastMapsSyncAt || 0).getTime();
        window.postMessage({ type: 'rp_enrich_request', leadId: lead.id, mapsUrl: lead.mapsUri, apiBase: backendBase }, window.location.origin);
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const { data } = await API.get(`/leads/${lead.id}`);
            if (new Date(data.lastMapsSyncAt || 0).getTime() > startedAt) break;
          } catch {}
        }
        if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
      }
      setBulkProgress(null);
      clearSelection();
    } finally {
      setBulkWorking(false);
    }
  }

  if (fetching && leads.length === 0) return <p className="text-muted">Loading leads…</p>;
  if (!fetching && total === 0 && !filtersActive) return <p className="text-muted">No leads yet.</p>;

  return (
    <>
      {/* ── Status pills + name filter ── */}
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: 200 }}
          placeholder="Search name…"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
        <div className="d-flex gap-1 flex-wrap">
          {ALL_STATUSES.map((s) => {
            const active = activeStatuses.has(s);
            const style = active
              ? { ...STATUS_STYLES[s], fontWeight: 600, fontSize: '0.75rem', padding: '3px 9px', borderRadius: 4, cursor: 'pointer', userSelect: 'none' }
              : { background: 'transparent', color: '#9ca3af', border: '1px solid #e5e7eb', fontWeight: 500, fontSize: '0.75rem', padding: '3px 9px', borderRadius: 4, cursor: 'pointer', userSelect: 'none' };
            return (
              <span key={s} style={style} onClick={() => toggleStatus(s)}>
                {statusLabel(s)}
              </span>
            );
          })}
        </div>
        {filtersActive && (
          <button className="btn btn-sm btn-link text-danger p-0 ms-1" onClick={clearFilters}>✕ Clear</button>
        )}
      </div>

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="d-flex align-items-center gap-2 mb-2 px-2 py-2 rounded" style={{ background: '#eff6ff', fontSize: '0.82rem' }}>
          <span className="fw-semibold">{selectedIds.size} selected</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={bulkRescrape}>↻ Re-scrape</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => bulkSetStatus('QUEUED')} disabled={bulkWorking}>Queue</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => bulkSetStatus('CONTACTED')} disabled={bulkWorking}>Mark contacted</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => bulkSetStatus('ARCHIVED')} disabled={bulkWorking}>Archive</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={bulkEnrichViaMaps} disabled={bulkWorking}>Enrich via Maps</button>
          <button className="btn btn-sm btn-outline-danger" onClick={bulkDelete} disabled={bulkWorking}>Delete</button>
          <button className="btn btn-sm btn-link text-secondary p-0 ms-auto" onClick={clearSelection}>✕</button>
          {bulkProgress && <span className="text-muted ms-2">{bulkProgress}</span>}
        </div>
      )}

      {/* ── Table ── */}
      <div className="table-responsive w-100">
        <table className="table table-sm table-hover align-middle mb-0">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" ref={selectAllRef} checked={allSelected} onChange={toggleSelectAll} />
              </th>
              <th style={{ minWidth: 180 }}>Name</th>
              <th style={{ minWidth: 100 }}>Status</th>
              <th style={{ minWidth: 80 }}>Score</th>
              <th style={{ minWidth: 120 }}>Phone</th>
              <th style={{ minWidth: 60 }}>Maps</th>
              <th style={{ minWidth: 90 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted text-center py-4">No leads match the current filters.</td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                  </td>
                  <td>
                    <Link to={`/leads/${lead.id}`} className="text-decoration-none fw-semibold text-dark">
                      {lead.name}
                    </Link>
                  </td>
                  <td><LeadStatusBadge status={lead.status} /></td>
                  <td>
                    {lead.icpFitScore != null && <FitBadge score={lead.icpFitScore} />}
                    {lead.reviewCount != null && (
                      <span className="text-muted ms-1" style={{ fontSize: '0.72rem' }}>· {lead.reviewCount}★</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {lead.phone && <a href={`tel:${lead.phone}`} className="text-decoration-none">{lead.phone}</a>}
                  </td>
                  <td>
                    {lead.mapsUri && (
                      <button className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={() => window.open(lead.mapsUri, lead.id)}>
                        Maps
                      </button>
                    )}
                  </td>
                  <td>
                    <div className="d-flex gap-1">
                      <Link to={`/leads/${lead.id}`} className="btn btn-sm btn-outline-secondary py-0 px-2" title="Open lead">✎</Link>
                      <button
                        className="btn btn-sm btn-outline-secondary py-0 px-2"
                        onClick={() => reScrape(lead.id)}
                        disabled={scrapingIds.has(lead.id)}
                        title="Re-scrape"
                      >
                        {scrapingIds.has(lead.id)
                          ? <span className="spinner-border spinner-border-sm" style={{ width: '0.7rem', height: '0.7rem' }} />
                          : '↻'}
                      </button>
                      <button className="btn btn-sm btn-outline-danger py-0 px-2" onClick={() => deleteLead(lead.id)} title="Delete">×</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="d-flex align-items-center justify-content-between mt-2" style={{ fontSize: '0.82rem' }}>
        <span className="text-muted">
          {total} lead{total !== 1 ? 's' : ''}
          {filtersActive && ' (filtered)'}
          {totalPages > 1 && ` · page ${page + 1}/${totalPages}`}
          {fetching && ' · refreshing…'}
        </span>
        {totalPages > 1 && (
          <div className="d-flex gap-1">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(0)} disabled={page === 0}>«</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>‹</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>›</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</button>
          </div>
        )}
      </div>
    </>
  );
}

function LeadStatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { bg: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
  return (
    <span style={{ background: s.bg, color: s.color, border: s.border, borderRadius: 4, padding: '2px 7px', fontSize: '0.72rem', fontWeight: 600 }}>
      {statusLabel(status)}
    </span>
  );
}

function FitBadge({ score }) {
  let bg = '#6b7280', color = '#fff';
  if (score >= 8)      { bg = '#16a34a'; }
  else if (score >= 6) { bg = '#2563eb'; }
  else if (score >= 4) { bg = '#f59e0b'; color = '#1c1917'; }
  else                 { bg = '#dc2626'; }
  return (
    <span style={{ background: bg, color, borderRadius: 4, padding: '2px 6px', fontSize: '0.72rem', fontWeight: 600 }}>
      {score}/10
    </span>
  );
}

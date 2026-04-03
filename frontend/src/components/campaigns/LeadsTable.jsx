import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../../api';

const PAGE_SIZE = 20;

export default function LeadsTable({ campaignId, refreshToken }) {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [fetching, setFetching] = useState(true);

  const [nameFilter, setNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [facebookFilter, setFacebookFilter] = useState('');
  const [mapsFilter, setMapsFilter] = useState('');
  const [debouncedName, setDebouncedName] = useState('');

  const [sortCol, setSortCol] = useState('score');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);

  const [scrapingIds, setScrapingIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  const selectAllRef = useRef(null);

  // Debounce name filter
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(nameFilter), 300);
    return () => clearTimeout(t);
  }, [nameFilter]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [debouncedName, statusFilter, scoreFilter, emailFilter, phoneFilter, facebookFilter, mapsFilter]);

  // Fetch from backend whenever query params change
  useEffect(() => {
    let cancelled = false;
    setFetching(true);

    const params = new URLSearchParams({
      page, limit: PAGE_SIZE,
      sortBy: sortCol, sortDir,
      ...(debouncedName   && { name: debouncedName }),
      ...(statusFilter    && { status: statusFilter }),
      ...(scoreFilter     && { scoreFilter }),
      ...(emailFilter     && { emailFilter }),
      ...(phoneFilter     && { phoneFilter }),
      ...(facebookFilter  && { facebookFilter }),
      ...(mapsFilter      && { mapsFilter }),
    });

    API.get(`/campaigns/${campaignId}/leads?${params}`)
      .then(({ data }) => {
        if (cancelled) return;
        setLeads(data.leads);
        setTotal(data.total);
      })
      .catch((e) => console.error('Failed to fetch leads', e))
      .finally(() => { if (!cancelled) setFetching(false); });

    return () => { cancelled = true; };
  }, [campaignId, page, sortCol, sortDir, debouncedName, statusFilter, scoreFilter, emailFilter, phoneFilter, facebookFilter, mapsFilter, refreshToken]);

  // Keep select-all checkbox indeterminate state in sync
  useEffect(() => {
    if (!selectAllRef.current) return;
    const allSel = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));
    const someSel = !allSel && leads.some((l) => selectedIds.has(l.id));
    selectAllRef.current.indeterminate = someSel;
  });

  // Listen for phone data from the browser extension
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

  function refetch() {
    setPage((p) => p); // trigger effect by touching a dep — use refreshToken instead
  }

  const filtersActive = nameFilter || statusFilter || scoreFilter || emailFilter || phoneFilter || facebookFilter || mapsFilter;

  function clearFilters() {
    setNameFilter('');
    setStatusFilter('');
    setScoreFilter('');
    setEmailFilter('');
    setPhoneFilter('');
    setFacebookFilter('');
    setMapsFilter('');
    setPage(0);
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  async function quickStatus(leadId, status) {
    try {
      await API.patch(`/leads/${leadId}/status`, { status });
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)));
    } catch (e) {
      console.error('Failed to update status', e);
    }
  }

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

  if (fetching && leads.length === 0) return <p className="text-muted">Loading leads...</p>;
  if (!fetching && total === 0 && !filtersActive) return <p className="text-muted">No leads yet.</p>;

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="d-flex align-items-center gap-2 mb-2 px-1 py-2 rounded" style={{ background: '#e8f0fe', fontSize: '0.85rem' }}>
          <span className="fw-semibold">{selectedIds.size} selected</span>
          <button className="btn btn-sm btn-outline-primary" onClick={bulkRescrape}>↻ Re-scrape</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => bulkSetStatus('QUEUED')} disabled={bulkWorking}>Queue</button>
          <button className="btn btn-sm btn-outline-success" onClick={() => bulkSetStatus('CONTACTED')} disabled={bulkWorking}>Mark contacted</button>
          <button className="btn btn-sm btn-outline-warning" onClick={() => bulkSetStatus('ARCHIVED')} disabled={bulkWorking}>Archive</button>
          <button className="btn btn-sm btn-outline-danger" onClick={bulkDelete} disabled={bulkWorking}>Delete</button>
          <button className="btn btn-sm btn-link text-secondary p-0 ms-1" onClick={clearSelection}>✕</button>
        </div>
      )}

      <div className="table-responsive w-100">
        <table className="table table-sm table-hover align-middle" style={{ fontSize: '0.82rem' }}>
          <thead className="table-light">
            <tr>
              <th style={{ width: 36, position: 'sticky', top: 0, background: '#f8f9fa' }}>
                <input type="checkbox" ref={selectAllRef} checked={allSelected} onChange={toggleSelectAll} title="Select all visible" />
              </th>
              <SortTh col="name"     label="Name"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 180, position: 'sticky', left: 0, zIndex: 2, background: '#f8f9fa' }} />
              <SortTh col="status"   label="Status"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 100 }} />
              <SortTh col="score"    label="Score"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 70 }} />
              <SortTh col="email"    label="Email"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 180 }} />
              <SortTh col="phone"    label="Phone"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 130 }} />
              <SortTh col="facebook" label="Facebook" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 160 }} />
              <SortTh col="maps"     label="Maps"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 60 }} />
              <th style={{ minWidth: 110, position: 'sticky', top: 0, background: '#f8f9fa', color: '#6c757d', fontWeight: 400, fontSize: '0.75em', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
            </tr>
            <tr style={{ borderTop: '2px solid #dee2e6', background: '#fdfdfd' }}>
              <td style={{ position: 'sticky', top: 30, background: '#fdfdfd' }} />
              <td style={{ position: 'sticky', top: 30, left: 0, background: '#fdfdfd' }}>
                <input className="form-control form-control-sm" placeholder="Search name..." value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
              </td>
              <td style={{ position: 'sticky', top: 30, background: '#fdfdfd' }}>
                <select className="form-select form-select-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="QUEUED">Queued</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="REPLIED">Replied</option>
                  <option value="WON">Won</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </td>
              <td style={{ position: 'sticky', top: 30, background: '#fdfdfd' }}>
                <select className="form-select form-select-sm" value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)}>
                  <option value="">Any score</option>
                  <option value="has">Has score</option>
                  <option value="empty">No score</option>
                  <option value="8">≥ 8</option>
                  <option value="6">≥ 6</option>
                  <option value="4">≥ 4</option>
                </select>
              </td>
              <td style={{ position: 'sticky', top: 30, background: '#fdfdfd' }}><NullableFilter label="email"    value={emailFilter}    onChange={setEmailFilter} /></td>
              <td style={{ position: 'sticky', top: 30, background: '#fdfdfd' }}><NullableFilter label="phone"    value={phoneFilter}    onChange={setPhoneFilter} /></td>
              <td style={{ position: 'sticky', top: 30, background: '#fdfdfd' }}><NullableFilter label="Facebook" value={facebookFilter} onChange={setFacebookFilter} /></td>
              <td style={{ position: 'sticky', top: 30, background: '#fdfdfd' }}><NullableFilter label="link"     value={mapsFilter}     onChange={setMapsFilter} /></td>
              <td style={{ position: 'sticky', top: 30, background: '#fdfdfd' }} className="align-middle">
                {filtersActive && (
                  <button className="btn btn-sm btn-link text-danger p-0 text-nowrap" onClick={clearFilters}>✕ Clear</button>
                )}
              </td>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-muted text-center py-3">No leads match the current filters.</td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td style={{ width: 36 }}>
                    <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                  </td>
                  <td style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>
                    <Link to={`/leads/${lead.id}`} className="text-decoration-none fw-semibold text-dark">{lead.name}</Link>
                  </td>
                  <td><LeadStatusBadge status={lead.status} /></td>
                  <td>{lead.icpFitScore != null ? <FitBadge score={lead.icpFitScore} /> : null}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {lead.email && <a href={`mailto:${lead.email}`} className="text-truncate d-block" style={{ maxWidth: 175 }} title={lead.email}>{lead.email}</a>}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {lead.phone && <a href={`tel:${lead.phone}`}>{lead.phone}</a>}
                  </td>
                  <td>
                    {lead.facebook && (
                      <a href={lead.facebook} target="_blank" rel="noopener noreferrer" className="text-truncate d-block" style={{ maxWidth: 155 }} title={lead.facebook}>
                        {lead.facebook.replace(/https?:\/\/(www\.)?/, '')}
                      </a>
                    )}
                  </td>
                  <td>
                    {lead.mapsUri && <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => window.open(lead.mapsUri, lead.id)}>Maps</button>}
                  </td>
                  <td>
                    <div className="d-flex gap-1">
                      {lead.status === 'QUEUED' && (
                        <button className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={() => quickStatus(lead.id, 'CONTACTED')}>Contacted</button>
                      )}
                      {lead.status === 'CONTACTED' && (
                        <button className="btn btn-sm btn-outline-warning py-0 px-2" onClick={() => quickStatus(lead.id, 'REPLIED')}>Replied</button>
                      )}
                      {(lead.status === 'CONTACTED' || lead.status === 'REPLIED') && (
                        <button className="btn btn-sm btn-outline-success py-0 px-2" onClick={() => quickStatus(lead.id, 'WON')}>Won</button>
                      )}
                      <Link to={`/leads/${lead.id}`} className="btn btn-sm btn-outline-secondary py-0 px-2" title="Edit lead">✎</Link>
                      <button
                        className="btn btn-sm btn-outline-primary py-0 px-2"
                        onClick={() => reScrape(lead.id)}
                        disabled={scrapingIds.has(lead.id)}
                        title="Re-fetch phone from Google Places + re-scrape website"
                      >
                        {scrapingIds.has(lead.id)
                          ? <span className="spinner-border spinner-border-sm" style={{ width: '0.7rem', height: '0.7rem' }} />
                          : '↻'}
                      </button>
                      <button className="btn btn-sm btn-outline-danger py-0 px-2" onClick={() => deleteLead(lead.id)} title="Delete lead">×</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="d-flex align-items-center justify-content-between mt-2" style={{ fontSize: '0.85rem' }}>
        <span className="text-muted">
          {total} lead{total !== 1 ? 's' : ''}
          {filtersActive && ` (filtered)`}
          {totalPages > 1 && ` · page ${page + 1}/${totalPages}`}
          {fetching && ' · refreshing...'}
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
  const map = {
    DISCOVERED: 'bg-info', ENRICHED: 'bg-info', QUALIFIED: 'bg-primary',
    QUEUED: 'bg-success', CONTACTED: 'bg-secondary',
    REPLIED: 'bg-warning text-dark', WON: 'bg-success', ARCHIVED: 'bg-dark',
  };
  return <span className={`badge ${map[status] || 'bg-secondary'}`}>{status}</span>;
}

function FitBadge({ score }) {
  let cls = 'bg-secondary';
  if (score >= 8) cls = 'bg-success';
  else if (score >= 6) cls = 'bg-primary';
  else if (score >= 4) cls = 'bg-warning text-dark';
  else cls = 'bg-danger';
  return <span className={`badge ${cls}`}>{score}/10</span>;
}

function NullableFilter({ label, value, onChange }) {
  return (
    <select className="form-select form-select-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Any</option>
      <option value="has">Has {label}</option>
      <option value="empty">No {label}</option>
    </select>
  );
}

function SortTh({ col, label, sortCol, sortDir, onSort, style }) {
  const active = sortCol === col;
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#f8f9fa', ...style }}
      onClick={() => onSort(col)}
    >
      {label}
      <span className="ms-1" style={{ fontSize: '0.7em', opacity: active ? 1 : 0.35 }}>
        {active ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
      </span>
    </th>
  );
}

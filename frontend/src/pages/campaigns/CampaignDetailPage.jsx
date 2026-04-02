import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import API from "../../api";

export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [runs, setRuns] = useState([]);
  const [tab, setTab] = useState("leads");
  const [editingConfig, setEditingConfig] = useState(false);
  const [configFields, setConfigFields] = useState({});
  const [configSaving, setConfigSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Lead table filters (per column)
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // score: "" | "has" | "empty" | "4" | "6" | "8"
  const [scoreFilter, setScoreFilter] = useState("");
  // contact columns: "" | "has" | "empty"
  const [emailFilter, setEmailFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [facebookFilter, setFacebookFilter] = useState("");
  const [mapsFilter, setMapsFilter] = useState("");

  // Sort
  const [sortCol, setSortCol] = useState("icpFitScore");
  const [sortDir, setSortDir] = useState("desc");

  // Pagination
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Row actions
  const [scrapingIds, setScrapingIds] = useState(new Set());

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  // Live run state
  const [running, setRunning] = useState(false);
  const [runEvents, setRunEvents] = useState([]);
  const [runStats, setRunStats] = useState(null);
  const eventSourceRef = useRef(null);
  const logEndRef = useRef(null);
  const selectAllRef = useRef(null);

  useEffect(() => {
    fetchAll();
    checkForActiveRun();
    clearFilters();
    setSelectedIds(new Set());
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [id]);

  // Auto-scroll event log
  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [runEvents]);

  useEffect(() => { setPage(0); }, [nameFilter, statusFilter, scoreFilter, emailFilter, phoneFilter, facebookFilter, mapsFilter]);

  useEffect(() => {
    function onMessage(e) {
      if (e.data?.type !== 'REPLYPILOT_PHONE') return;
      const { leadId, phone } = e.data;
      const lead = leads.find(l => l.id === leadId);
      if (!lead || !phone) return;
      API.patch(`/leads/${leadId}`, { ...lead, phone });
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, phone } : l));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [leads]);

  // Keep select-all checkbox indeterminate state in sync (must be before early returns)
  useEffect(() => {
    if (!selectAllRef.current) return;
    const allVisIds = leads.filter((l) => {
      if (nameFilter && !l.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
      if (statusFilter && l.status !== statusFilter) return false;
      return true;
    }).map((l) => l.id);
    const allSel = allVisIds.length > 0 && allVisIds.every((i) => selectedIds.has(i));
    const someSel = !allSel && allVisIds.some((i) => selectedIds.has(i));
    selectAllRef.current.indeterminate = someSel;
  });

  async function fetchAll() {
    try {
      const [campRes, leadsRes, runsRes, allCampsRes] = await Promise.all([
        API.get(`/campaigns/${id}`),
        API.get(`/campaigns/${id}/leads`),
        API.get(`/campaigns/${id}/runs`),
        API.get("/campaigns"),
      ]);
      setCampaign(campRes.data);
      setLeads(leadsRes.data);
      setRuns(runsRes.data);
      setCampaigns(allCampsRes.data);
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
    if (eventSourceRef.current) eventSourceRef.current.close();

    setRunning(true);

    const token = localStorage.getItem("token");
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
    const url = `${baseUrl}/campaigns/${id}/run/live?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

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
        connectToSSE();
        return;
      }
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

  function startEditing() {
    setConfigFields({
      vertical: campaign.vertical || "",
      location: campaign.location || "",
      offer: campaign.offer || "",
      angle: campaign.angle || "",
      qualifier: campaign.qualifier || "",
      tone: campaign.tone || "",
      dailyTarget: campaign.dailyTarget ?? 10,
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
      console.error("Failed to save config", e);
    } finally {
      setConfigSaving(false);
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

  const filteredLeads = leads.filter((l) => {
    if (nameFilter && !l.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    if (scoreFilter === "has" && l.icpFitScore == null) return false;
    if (scoreFilter === "empty" && l.icpFitScore != null) return false;
    if ((scoreFilter === "4" || scoreFilter === "6" || scoreFilter === "8") &&
        (l.icpFitScore == null || l.icpFitScore < Number(scoreFilter))) return false;
    if (emailFilter === "has" && !l.email) return false;
    if (emailFilter === "empty" && l.email) return false;
    if (phoneFilter === "has" && !l.phone) return false;
    if (phoneFilter === "empty" && l.phone) return false;
    if (facebookFilter === "has" && !l.facebook) return false;
    if (facebookFilter === "empty" && l.facebook) return false;
    if (mapsFilter === "has" && !l.mapsUri) return false;
    if (mapsFilter === "empty" && l.mapsUri) return false;
    return true;
  });

  const SORT_KEY = {
    name:     (l) => l.name.toLowerCase(),
    status:   (l) => l.status,
    score:    (l) => l.icpFitScore ?? -1,
    email:    (l) => l.email ?? "",
    phone:    (l) => l.phone ?? "",
    facebook: (l) => l.facebook ?? "",
    maps:     (l) => l.mapsUri ?? "",
  };

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    const key = SORT_KEY[sortCol] ?? (() => 0);
    const aVal = key(a);
    const bVal = key(b);
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(0);
  }

  const totalPages = Math.ceil(sortedLeads.length / PAGE_SIZE);
  const pagedLeads = sortedLeads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const filtersActive = nameFilter || statusFilter || scoreFilter || emailFilter || phoneFilter || facebookFilter || mapsFilter;

  function clearFilters() {
    setNameFilter("");
    setStatusFilter("");
    setScoreFilter("");
    setEmailFilter("");
    setPhoneFilter("");
    setFacebookFilter("");
    setMapsFilter("");
    setPage(0);
  }

  async function quickStatus(leadId, status) {
    try {
      await API.patch(`/leads/${leadId}/status`, { status });
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status } : l));
    } catch (e) {
      console.error("Failed to update status", e);
    }
  }

  async function deleteLead(leadId) {
    if (!window.confirm("Delete this lead?")) return;
    try {
      await API.delete(`/leads/${leadId}`);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (e) {
      console.error("Failed to delete lead", e);
    }
  }

  async function reScrape(leadId) {
    setScrapingIds((prev) => new Set([...prev, leadId]));
    try {
      const { data } = await API.post(`/leads/${leadId}/rescrape`);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? data : l)));
    } catch (e) {
      console.error("Failed to rescrape lead", e);
    } finally {
      setScrapingIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
  }

  // Derived selection state
  const allVisibleIds = sortedLeads.map((l) => l.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));

  function toggleSelect(leadId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkSetStatus(status) {
    const ids = [...selectedIds];
    setBulkWorking(true);
    try {
      await API.patch('/leads/bulk-status', { ids, status });
      setLeads((prev) => prev.map((l) => selectedIds.has(l.id) ? { ...l, status } : l));
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
      clearSelection();
    } catch (e) {
      console.error('Bulk delete failed', e);
    } finally {
      setBulkWorking(false);
    }
  }

  return (
    <div className="container-fluid py-4 px-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Link to="/campaigns" className="btn btn-sm btn-outline-secondary">
              &larr;
            </Link>
            {/* Campaign picker */}
            <select
              className="form-select form-select-sm"
              style={{ width: "auto", maxWidth: 280 }}
              value={id}
              onChange={(e) => navigate(`/campaigns/${e.target.value}`)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <StatusBadge campaign={campaign} />
          </div>
          <small className="text-muted ps-1">
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

      {/* Pipeline stats */}
      {campaign.stats && (
        <div className="d-flex gap-3 mb-3 flex-wrap" style={{ fontSize: "0.85rem" }}>
          {[
            { key: "QUEUED", label: "Queued", cls: "text-bg-success" },
            { key: "CONTACTED", label: "Contacted", cls: "text-bg-secondary" },
            { key: "REPLIED", label: "Replied", cls: "text-bg-warning" },
            { key: "WON", label: "Won", cls: "text-bg-success" },
            { key: "ARCHIVED", label: "Archived", cls: "text-bg-dark" },
          ].map(({ key, label, cls }) => (
            <span key={key} className={`badge ${cls}`}>
              {label}: {campaign.stats[key] || 0}
            </span>
          ))}
        </div>
      )}

      {/* Config summary / edit */}
      {editingConfig ? (
        <div className="card card-body mb-3">
          <div className="row g-2" style={{ fontSize: "0.9rem" }}>
            <div className="col-md-6">
              <label className="form-label fw-semibold mb-1">Vertical</label>
              <input
                className="form-control form-control-sm"
                value={configFields.vertical}
                onChange={(e) => setConfigFields((p) => ({ ...p, vertical: e.target.value }))}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold mb-1">Location</label>
              <input
                className="form-control form-control-sm"
                value={configFields.location}
                onChange={(e) => setConfigFields((p) => ({ ...p, location: e.target.value }))}
              />
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold mb-1">Offer</label>
              <input
                className="form-control form-control-sm"
                value={configFields.offer}
                onChange={(e) => setConfigFields((p) => ({ ...p, offer: e.target.value }))}
              />
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold mb-1">Angle</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                value={configFields.angle}
                onChange={(e) => setConfigFields((p) => ({ ...p, angle: e.target.value }))}
              />
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold mb-1">
                Qualifier <small className="text-muted fw-normal">(bad fit signals)</small>
              </label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                value={configFields.qualifier}
                onChange={(e) => setConfigFields((p) => ({ ...p, qualifier: e.target.value }))}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold mb-1">Tone</label>
              <select
                className="form-select form-select-sm"
                value={configFields.tone}
                onChange={(e) => setConfigFields((p) => ({ ...p, tone: e.target.value }))}
              >
                <option value="">— select —</option>
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
                <option value="direct">Direct</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold mb-1">Daily target</label>
              <input
                type="number"
                className="form-control form-control-sm"
                min={1}
                max={100}
                value={configFields.dailyTarget}
                onChange={(e) => setConfigFields((p) => ({ ...p, dailyTarget: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-sm btn-primary" onClick={saveConfig} disabled={configSaving}>
              {configSaving ? "Saving..." : "Save"}
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingConfig(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="card card-body mb-3" style={{ fontSize: "0.85rem" }}>
          <div className="d-flex justify-content-between align-items-start">
            <div className="row flex-grow-1">
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
            <button
              className="btn btn-sm btn-outline-secondary ms-3 flex-shrink-0"
              onClick={startEditing}
            >
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
          onDismiss={() => {
            setRunEvents([]);
            setRunStats(null);
          }}
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
          {leads.length === 0 ? (
            <p className="text-muted">No leads yet.</p>
          ) : (
            <>
            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="d-flex align-items-center gap-2 mb-2 px-1 py-2 rounded" style={{ background: "#e8f0fe", fontSize: "0.85rem" }}>
                <span className="fw-semibold">{selectedIds.size} selected</span>
                <button className="btn btn-sm btn-outline-primary" onClick={bulkRescrape}>↻ Re-scrape</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => bulkSetStatus('QUEUED')} disabled={bulkWorking}>Queue</button>
                <button className="btn btn-sm btn-outline-success" onClick={() => bulkSetStatus('CONTACTED')} disabled={bulkWorking}>Mark contacted</button>
                <button className="btn btn-sm btn-outline-warning" onClick={() => bulkSetStatus('ARCHIVED')} disabled={bulkWorking}>Archive</button>
                <button className="btn btn-sm btn-outline-danger" onClick={bulkDelete} disabled={bulkWorking}>Delete</button>
                <button className="btn btn-sm btn-link text-secondary p-0 ms-1" onClick={clearSelection}>✕</button>
              </div>
            )}
            <div className="table-responsive" style={{ maxHeight: "calc(100vh - 340px)", overflowY: "auto" }}>
              <table className="table table-sm table-hover align-middle" style={{ fontSize: "0.82rem" }}>
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 36, position: "sticky", top: 0, background: "#f8f9fa" }}>
                      <input
                        type="checkbox"
                        ref={selectAllRef}
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        title="Select all visible"
                      />
                    </th>
                    <SortTh col="name"     label="Name"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 180, position: "sticky", left: 0, zIndex: 2, background: "#f8f9fa" }} />
                    <SortTh col="status"   label="Status"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 100 }} />
                    <SortTh col="score"    label="Score"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 70 }} />
                    <SortTh col="email"    label="Email"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 180 }} />
                    <SortTh col="phone"    label="Phone"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 130 }} />
                    <SortTh col="facebook" label="Facebook" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 160 }} />
                    <SortTh col="maps"     label="Maps"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 60 }} />
                    <th style={{ minWidth: 110, position: "sticky", top: 0, background: "#f8f9fa", color: "#6c757d", fontWeight: 400, fontSize: "0.75em", textTransform: "uppercase", letterSpacing: "0.05em" }}>Actions</th>
                  </tr>
                  <tr style={{ borderTop: "2px solid #dee2e6", background: "#fdfdfd" }}>
                    <td style={{ position: "sticky", top: 30, background: "#fdfdfd" }} />
                    <td style={{ position: "sticky", top: 30, left: 0, background: "#fdfdfd" }}>
                      <input
                        className="form-control form-control-sm"
                        placeholder="Search name..."
                        value={nameFilter}
                        onChange={(e) => setNameFilter(e.target.value)}
                      />
                    </td>
                    <td style={{ position: "sticky", top: 30, background: "#fdfdfd" }}>
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
                    <td style={{ position: "sticky", top: 30, background: "#fdfdfd" }}>
                      <select className="form-select form-select-sm" value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)}>
                        <option value="">Any score</option>
                        <option value="has">Has score</option>
                        <option value="empty">No score</option>
                        <option value="8">≥ 8</option>
                        <option value="6">≥ 6</option>
                        <option value="4">≥ 4</option>
                      </select>
                    </td>
                    <td style={{ position: "sticky", top: 30, background: "#fdfdfd" }}><NullableFilter label="email"    value={emailFilter}    onChange={setEmailFilter} /></td>
                    <td style={{ position: "sticky", top: 30, background: "#fdfdfd" }}><NullableFilter label="phone"    value={phoneFilter}    onChange={setPhoneFilter} /></td>
                    <td style={{ position: "sticky", top: 30, background: "#fdfdfd" }}><NullableFilter label="Facebook" value={facebookFilter} onChange={setFacebookFilter} /></td>
                    <td style={{ position: "sticky", top: 30, background: "#fdfdfd" }}><NullableFilter label="link"     value={mapsFilter}     onChange={setMapsFilter} /></td>
                    <td style={{ position: "sticky", top: 30, background: "#fdfdfd" }} className="align-middle">
                      {filtersActive && (
                        <button className="btn btn-sm btn-link text-danger p-0 text-nowrap" onClick={clearFilters}>
                          ✕ Clear
                        </button>
                      )}
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {pagedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-muted text-center py-3">
                        No leads match the current filters.
                      </td>
                    </tr>
                  ) : (
                    pagedLeads.map((lead) => (
                        <tr key={lead.id}>
                          <td style={{ width: 36 }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(lead.id)}
                              onChange={() => toggleSelect(lead.id)}
                            />
                          </td>
                          <td style={{ position: "sticky", left: 0, background: "white", zIndex: 1 }}>
                            <Link to={`/leads/${lead.id}`} className="text-decoration-none fw-semibold text-dark">
                              {lead.name}
                            </Link>
                          </td>
                          <td>
                            <LeadStatusBadge status={lead.status} />
                          </td>
                          <td>
                            {lead.icpFitScore != null ? <FitBadge score={lead.icpFitScore} /> : null}
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                            {lead.email
                              ? <a href={`mailto:${lead.email}`} className="text-truncate d-block" style={{ maxWidth: 175 }} title={lead.email}>{lead.email}</a>
                              : null}
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                            {lead.phone
                              ? <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                              : null}
                          </td>
                          <td>
                            {lead.facebook
                              ? <a href={lead.facebook} target="_blank" rel="noopener noreferrer" className="text-truncate d-block" style={{ maxWidth: 155 }} title={lead.facebook}>{lead.facebook.replace(/https?:\/\/(www\.)?/, "")}</a>
                              : null}
                          </td>
                          <td>
                            {lead.mapsUri
                              ? <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => window.open(lead.mapsUri, lead.id)}>Maps</button>
                              : null}
                          </td>
                          <td>
                            <div className="d-flex gap-1">
                              {lead.status === "QUEUED" && (
                                <button className="btn btn-sm btn-outline-secondary py-0 px-2" title="Mark contacted" onClick={() => quickStatus(lead.id, "CONTACTED")}>Contacted</button>
                              )}
                              {lead.status === "CONTACTED" && (
                                <button className="btn btn-sm btn-outline-warning py-0 px-2" title="Got reply" onClick={() => quickStatus(lead.id, "REPLIED")}>Replied</button>
                              )}
                              {(lead.status === "CONTACTED" || lead.status === "REPLIED") && (
                                <button className="btn btn-sm btn-outline-success py-0 px-2" title="Won client" onClick={() => quickStatus(lead.id, "WON")}>Won</button>
                              )}
                              <Link to={`/leads/${lead.id}`} className="btn btn-sm btn-outline-secondary py-0 px-2" title="Edit lead">✎</Link>
                              <button
                                className="btn btn-sm btn-outline-primary py-0 px-2"
                                onClick={() => reScrape(lead.id)}
                                disabled={scrapingIds.has(lead.id)}
                                title="Re-fetch phone from Google Places + re-scrape website"
                              >
                                {scrapingIds.has(lead.id)
                                  ? <span className="spinner-border spinner-border-sm" style={{ width: "0.7rem", height: "0.7rem" }} />
                                  : "↻"}
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger py-0 px-2"
                                onClick={() => deleteLead(lead.id)}
                                title="Delete lead"
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}
          {/* Pagination + summary */}
          <div className="d-flex align-items-center justify-content-between mt-2" style={{ fontSize: "0.85rem" }}>
            <span className="text-muted">
              {sortedLeads.length === leads.length
                ? `${leads.length} leads`
                : `${sortedLeads.length} of ${leads.length} leads`}
              {totalPages > 1 && ` · page ${page + 1}/${totalPages}`}
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
  switch (event.type) {
    case "phase":
      return <div className="text-primary fw-bold mt-1">{event.message}</div>;

    case "discovery_complete":
      return (
        <div className="text-success">
          Found {event.discovered} businesses ({event.newPlaces} new, {event.filtered} filtered)
        </div>
      );

    case "leads_created":
      return <div className="text-success">Created {event.created} leads</div>;

    case "enriching_lead":
      return <div className="text-muted">Enriching: {event.leadName} ({event.index}/{event.total})</div>;

    case "lead_qualified": {
      const icon = e.status === "QUALIFIED" ? "+" : e.status === "ARCHIVED" ? "-" : "?";
      const cls =
        e.status === "QUALIFIED" ? "text-success" : e.status === "ARCHIVED" ? "text-muted" : "text-warning";
      return (
        <div className={cls}>
          {icon} {event.leadName} — {event.status}
          {event.icpFitScore != null && ` (${event.icpFitScore}/10)`}
        </div>
      );
    }

    case "generating_message":
      return <div className="text-muted">Writing: {event.leadName} ({event.index}/{event.total})</div>;

    case "message_generated":
      return <div className="text-success">Message ready: {event.leadName}</div>;

    case "message_error":
      return <div className="text-danger">Message failed: {event.leadName}</div>;

    case "complete":
      return (
        <div className="text-success fw-bold mt-1">
          Done — {event.queued} leads queued for review
        </div>
      );

    case "error":
      return <div className="text-danger fw-bold mt-1">Error: {event.error}</div>;

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
    REPLIED: "bg-warning text-dark",
    WON: "bg-success",
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
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", position: "sticky", top: 0, background: "#f8f9fa", ...style }}
      onClick={() => onSort(col)}
    >
      {label}
      <span className="ms-1" style={{ fontSize: "0.7em", opacity: active ? 1 : 0.35 }}>
        {active ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}
      </span>
    </th>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../../api";

function StatusBadge({ campaign }) {
  if (!campaign.setupComplete) return <span className="badge bg-warning text-dark">Setup incomplete</span>;
  if (campaign.active) return <span className="badge bg-success">Active</span>;
  return <span className="badge bg-secondary">Paused</span>;
}

export default function CampaignListPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    try {
      const { data } = await API.get("/campaigns");
      setCampaigns(data);
    } catch (e) {
      console.error("Failed to load campaigns", e);
    } finally {
      setLoading(false);
    }
  }

  async function createCampaign(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const { data } = await API.post("/campaigns", { name: newName.trim() });
      setNewName("");
      setCreating(false);
      navigate(`/campaigns/${data.id}/setup`);
    } catch (e) {
      console.error("Failed to create campaign", e);
    }
  }

  async function toggleActive(campaign) {
    try {
      const { data } = await API.patch(`/campaigns/${campaign.id}`, { active: !campaign.active });
      setCampaigns(prev => prev.map(c => (c.id === data.id ? data : c)));
    } catch (e) {
      console.error("Failed to toggle campaign", e);
    }
  }

  async function deleteCampaign(id) {
    if (!window.confirm("Delete this campaign and all its leads?")) return;
    try {
      await API.delete(`/campaigns/${id}`);
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      console.error("Failed to delete campaign", e);
    }
  }

  if (loading) {
    return (
      <div className="container py-4">
        <p className="text-muted">Loading campaigns…</p>
      </div>
    );
  }

  return (
    <div className="container py-4" style={{ maxWidth: 800 }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="m-0">Campaigns</h4>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          + New Campaign
        </button>
      </div>

      {creating && (
        <form onSubmit={createCampaign} className="card card-body mb-3">
          <div className="d-flex gap-2">
            <input
              className="form-control"
              placeholder="Campaign name (e.g. Restaurant websites — Bristol)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary" type="submit" disabled={!newName.trim()}>
              Create
            </button>
            <button className="btn btn-outline-secondary" type="button" onClick={() => { setCreating(false); setNewName(""); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {campaigns.length === 0 && !creating ? (
        <div className="text-center text-muted py-5">
          <p>No campaigns yet. Create one to start generating leads.</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {campaigns.map((c) => (
            <div key={c.id} className="card">
              <div className="card-body d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="mb-1">
                    <Link to={c.setupComplete ? `/campaigns/${c.id}` : `/campaigns/${c.id}/setup`} className="text-decoration-none">
                      {c.name}
                    </Link>
                  </h6>
                  <small className="text-muted">
                    {c.vertical && `${c.vertical} · `}
                    {c.location && `${c.location} · `}
                    {c._count?.leads ?? 0} leads · {c._count?.runs ?? 0} runs
                  </small>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <StatusBadge campaign={c} />
                  {c.setupComplete && (
                    <button
                      className={`btn btn-sm ${c.active ? "btn-outline-warning" : "btn-outline-success"}`}
                      onClick={() => toggleActive(c)}
                    >
                      {c.active ? "Pause" : "Activate"}
                    </button>
                  )}
                  {!c.setupComplete && (
                    <Link to={`/campaigns/${c.id}/setup`} className="btn btn-sm btn-outline-primary">
                      Continue Setup
                    </Link>
                  )}
                  <button className="btn btn-sm btn-outline-danger" onClick={() => deleteCampaign(c.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

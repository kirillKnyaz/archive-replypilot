import { useEffect, useState } from "react";
import useAuth from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import LeadSidebar from "../../components/leads/LeadSidebar";
import LeadDetails from "../../components/leads/LeadDetails";
import DiscoverLeadsMap from "../../components/leads/DiscoverLeadsMap";
import SettingsTab from "./SettingsTab";

function DashboardPage() {
  const { loading, authenticated } = useAuth();
  const navigate = useNavigate();

  const [toggle, setToggle] = useState(0);
  // discovery state that should persist
  const [discovery, setDiscovery] = useState({
    searchToggle: true,
    selectedCategory: localStorage.getItem('selectedCategory') || 'restaurant',
    textSearchQuery: '',
    maxResultCount: 10,

    selectedPlace: null,
    searchButtonVisible: true,
    nearbySearchLoading: false,
    nearbySearchError: null,

    places: [],
    selectedBusiness: null,

    completionLoading: false,
    completionError: null,
    // history
    history: [],
    historyLoading: false,
    historyError: null,
  });

  useEffect(() => {
    if (loading) return;
    if (!authenticated) navigate('/login');
  }, [loading, authenticated]);

  return (
    <div className="d-flex vh-100 w-100 overflow-hidden position-relative">
      <main className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0, overflow: 'auto' }}>
        <nav className="w-100 nav-tabs">
          <ul className="nav nav-tabs">
            <li className="nav-item" onClick={() => setToggle(0)}>
              <a className={`nav-link ${toggle === 0 && "active"}`}>Leads</a>
            </li>
            <li className="nav-item" onClick={() => setToggle(1)}>
              <a className={`nav-link ${toggle === 1 && "active"}`}>Discovery</a>
            </li>
            <li className="nav-item" onClick={() => setToggle(2)}>
              <a className={`nav-link ${toggle === 2 && "active"}`}>Settings</a>
            </li>
          </ul>
        </nav>
        <div className="p-3">
          {toggle === 0 && <LeadDetails />}
          {toggle === 1 && <DiscoverLeadsMap discovery={discovery} setDiscovery={setDiscovery} />}
          {toggle === 2 && <SettingsTab />}
        </div>
      </main>
      <div className="h-100">
        <LeadSidebar />
      </div>
    </div>
  );
}

export default DashboardPage;
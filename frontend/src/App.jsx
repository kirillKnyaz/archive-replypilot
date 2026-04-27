import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

import { AuthProvider } from './context/AuthContext';
import { LeadProvider } from './context/LeadContext';
import Layout from './Layout';
import ProtectedRoute from './ProtectedRoute';
import API from './api';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import CampaignListPage from './pages/campaigns/CampaignListPage';
import CampaignSetupPage from './pages/campaigns/CampaignSetupPage';
import CampaignDetailPage from './pages/campaigns/CampaignDetailPage';
import CampaignConfigPage from './pages/campaigns/CampaignConfigPage';
import LeadPage from './pages/leads/LeadPage';
import ActionQueuePage from './pages/leads/ActionQueuePage';
import PricingPage from './pages/billing/PricingPage';
import BillingPage from './pages/billing/BillingPage';
import SettingsPage from './pages/settings/SettingsPage';
import PaymentSuccessfulPage from './pages/billing/PaymentSuccessfulPage';
import PaymentCancelPage from './pages/billing/PaymentCancelPage';

// Redirects to the first campaign's detail page, or to /campaigns if none exist
function DefaultCampaign() {
  const navigate = useNavigate();

  useEffect(() => {
    API.get("/campaigns").then(({ data }) => {
      if (data.length > 0) navigate(`/campaigns/${data[0].id}`, { replace: true });
      else navigate("/campaigns", { replace: true });
    });
  }, []);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LeadProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route element={<Layout />}>
                <Route path="/" element={<ProtectedRoute><DefaultCampaign /></ProtectedRoute>} />

                <Route path="/campaigns" element={<ProtectedRoute><CampaignListPage /></ProtectedRoute>} />
                <Route path="/campaigns/:id" element={<ProtectedRoute><CampaignDetailPage /></ProtectedRoute>} />
                <Route path="/campaigns/:id/setup" element={<ProtectedRoute><CampaignSetupPage /></ProtectedRoute>} />
                <Route path="/campaigns/:id/config" element={<ProtectedRoute><CampaignConfigPage /></ProtectedRoute>} />
                <Route path="/leads/:id" element={<ProtectedRoute><LeadPage /></ProtectedRoute>} />
                <Route path="/queue" element={<ProtectedRoute><ActionQueuePage /></ProtectedRoute>} />

                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/pricing" element={<ProtectedRoute><PricingPage /></ProtectedRoute>} />
                <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
                <Route path="/billing/success" element={<ProtectedRoute><PaymentSuccessfulPage /></ProtectedRoute>} />
                <Route path="/billing/cancel" element={<ProtectedRoute><PaymentCancelPage /></ProtectedRoute>} />
              </Route>
            </Routes>
        </LeadProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

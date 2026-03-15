import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import Layout from './Layout';
import ProtectedRoute from './ProtectedRoute';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ReviewDashboard from './pages/dashboard/ReviewDashboard';
import CampaignListPage from './pages/campaigns/CampaignListPage';
import CampaignSetupPage from './pages/campaigns/CampaignSetupPage';
import CampaignDetailPage from './pages/campaigns/CampaignDetailPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<ProtectedRoute><ReviewDashboard /></ProtectedRoute>} />

            <Route path="/campaigns" element={<ProtectedRoute><CampaignListPage /></ProtectedRoute>} />
            <Route path="/campaigns/:id" element={<ProtectedRoute><CampaignDetailPage /></ProtectedRoute>} />
            <Route path="/campaigns/:id/setup" element={<ProtectedRoute><CampaignSetupPage /></ProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

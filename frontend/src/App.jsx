import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import Layout from './Layout';
import ProtectedRoute from './ProtectedRoute';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import OnboardingPage from './pages/onboarding/OnboardingPage';
import { IntakeFormContext, IntakeFormProvider } from './context/IntakeFormContext';
import PricingPage from './pages/billing/PricingPage';
import PaymentSuccessfulPage from './pages/billing/PaymentSuccessfulPage';
import PaymentCancelPage from './pages/billing/PaymentCancelPage';
import BillingPage from './pages/billing/BillingPage';
import { LeadProvider } from './context/LeadContext';
import OnboardingChat from './pages/onboarding/OnboardingChatPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<ProtectedRoute>
              <LeadProvider>
                <IntakeFormProvider>
                  <DashboardPage />
                </IntakeFormProvider>
              </LeadProvider>
            </ProtectedRoute>} />
            <Route path='/pricing' element={<PricingPage />} />

            <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />           
            <Route path="/billing/success" element={<ProtectedRoute><PaymentSuccessfulPage /></ProtectedRoute>} />
            <Route path="/billing/cancel" element={<ProtectedRoute><PaymentCancelPage /></ProtectedRoute>} />
            
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <IntakeFormProvider>
                    <OnboardingChat/>
                  </IntakeFormProvider>
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
// ProtectedRoute.jsx — declarative guard
import { Navigate, useLocation } from 'react-router-dom';
import useAuth from './hooks/useAuth';

export default function ProtectedRoute({ children }) {
  const { authenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) return null; // spinner if you want

  // Not logged in? Go to login, keep any state you might already have
  if (!authenticated && location) {
    const state = { ...(location.state || {}), logoutMessage: 'Logged out.' };
    return <Navigate to="/login" state={state} replace />;
  }

  // Subscription checks
  const ended = user.subscription?.ended_at && Date.now() > new Date(user.subscription?.ended_at * 1000);
  if (ended) {
    return (
      <Navigate
        to="/pricing"
        state={{ message: 'Your subscription has expired. Please renew to continue using the service.' }}
        replace
      />
    );
  }
  if (!user?.subscription?.active) {
    return (
      <Navigate
        to="/pricing"
        state={{ message: 'Your subscription is not active. Please renew to continue using the service.' }}
        replace
      />
    );
  }

  // Onboarding gate
  if (!user?.profile?.icpSummary) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

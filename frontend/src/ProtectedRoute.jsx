import { Navigate, useLocation } from 'react-router-dom';
import useAuth from './hooks/useAuth';

const UNGATED_PATHS = [
  '/pricing', '/billing', '/billing/success', '/billing/cancel',
];

export default function ProtectedRoute({ children }) {
  const { authenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
      <div className="spinner-border text-secondary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );

  if (!authenticated) {
    const state = { ...(location.state || {}), logoutMessage: 'Logged out.' };
    return <Navigate to="/login" state={state} replace />;
  }

  // Don't gate billing pages themselves
  if (UNGATED_PATHS.includes(location.pathname)) {
    return children;
  }

  // Gate: no active subscription → redirect to pricing
  if (!user?.subscription?.active) {
    return <Navigate to="/pricing" replace />;
  }

  return children;
}
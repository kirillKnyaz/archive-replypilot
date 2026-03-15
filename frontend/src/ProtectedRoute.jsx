import { Navigate, useLocation } from 'react-router-dom';
import useAuth from './hooks/useAuth';

export default function ProtectedRoute({ children }) {
  const { authenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!authenticated) {
    const state = { ...(location.state || {}), logoutMessage: 'Logged out.' };
    return <Navigate to="/login" state={state} replace />;
  }

  return children;
}
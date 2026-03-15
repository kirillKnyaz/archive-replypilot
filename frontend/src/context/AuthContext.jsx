import { createContext, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import API from '../api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const logout = (logoutMessage = 'Logged out successfully') => {
    localStorage.removeItem('token');
    console.log('User logged out', logoutMessage);
    navigate('/login', { 
      state: { 
        logoutMessage: logoutMessage,
        key: Date.now() // force state update
      },
      replace: true
    });
    setAuthenticated(false);
    setUser(null);
  };

  const checkAuth = useCallback(async () => {
    console.log('Checking authentication...');
    const token = localStorage.getItem('token');
    if (!token) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }

    try {
      const res = await API.get('/auth/me');
      setUser(res.data);
      console.log('User authenticated:', res.data);
      setAuthenticated(true);
    } catch (err) {
      logout('Session expired. Please log in again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email, password, setError, setLoading) => {
    API.post('/auth/login', { email, password }).then((res) => {
      localStorage.setItem('token', res.data.token);
      setAuthenticated(true);
      setUser(res.data.user);
      console.log('User logged in:', res.data.user);
      if (res.data.user.subscription && res.data.user.subscription.active) {
        navigate('/');
      }
      else {
        navigate('/pricing');
      }
    }).catch((error) => {
      console.error('Login error:', error);
      setError(error.response?.data?.message || 'Login failed. Please try again.');
    }).finally(() => {
      if (setLoading) setLoading(false);
    });
  };

  useEffect(() => {
    checkAuth();
  }, [location]);

  const updateUserSubscription = async (subJson) => {
    if (!user || !user.id) return;
    setUser((prevUser) => ({
      ...prevUser,
      subscription: subJson,
    }));
  };

  return (
    <AuthContext.Provider value={{ user, authenticated, loading, login, logout, updateUserSubscription }}>
      {children}
    </AuthContext.Provider>
  );
}
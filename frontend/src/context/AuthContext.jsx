import { createContext, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
    try {
      const res = await API.post('/auth/login', { email, password });
      localStorage.setItem('token', res.data.token);
      const meRes = await API.get('/auth/me');
      setUser(meRes.data);
      setAuthenticated(true);
      console.log('User logged in:', meRes.data);
      navigate('/');
    } catch (error) {
      console.error('Login error:', error);
      setError(error.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      if (setLoading) setLoading(false);
    }
  };

  const register = async (email, password) => {
    const res = await API.post('/auth/register', { email, password });
    localStorage.setItem('token', res.data.token);
    const meRes = await API.get('/auth/me');
    setUser(meRes.data);
    setAuthenticated(true);
    navigate('/pricing');
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, authenticated, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}
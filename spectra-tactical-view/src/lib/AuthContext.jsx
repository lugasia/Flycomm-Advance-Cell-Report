/**
 * AuthContext — Phase 1: hardcoded super-admin (no login required).
 * The spectra-api /api/auth/me returns the super admin user object.
 * Real Google + email/password auth is Phase 2.
 */
import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

const API_BASE = import.meta.env.VITE_SPECTRA_API || 'http://localhost:8001';

export const AuthProvider = ({ children }) => {
  const [user, setUser]                       = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth]     = useState(true);
  const [isLoadingPublicSettings]             = useState(false);
  const [authError, setAuthError]             = useState(null);
  const [appPublicSettings]                   = useState({ id: 'spectra', public_settings: {} });

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const u = await res.json();
      setUser(u);
      setIsAuthenticated(true);
    } catch (err) {
      console.error('[Spectra] Auth check failed:', err.message);
      setAuthError({
        type: 'api_unavailable',
        message: `Cannot reach Spectra API — make sure it is running:\n  cd spectra-api && bash start.sh\n\n${err.message}`,
      });
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' }).catch(() => {});
  };

  const navigateToLogin = () => { loadUser(); };

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings,
      authError, appPublicSettings, logout, navigateToLogin,
      checkAppState: loadUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

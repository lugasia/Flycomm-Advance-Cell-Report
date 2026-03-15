/**
 * AuthContext — Google OAuth authentication.
 * Checks for a stored JWT on mount, validates it via /api/auth/me.
 * If no token or token is invalid, redirects to /login.
 */
import React, { createContext, useState, useContext, useEffect } from 'react';
import { spectra } from '@/api/spectraClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]                           = useState(null);
  const [isAuthenticated, setIsAuthenticated]      = useState(false);
  const [isLoadingAuth, setIsLoadingAuth]          = useState(true);
  const [isLoadingPublicSettings]                  = useState(false);
  const [authError, setAuthError]                  = useState(null);
  const [appPublicSettings]                        = useState({ id: 'spectra', public_settings: {} });

  useEffect(() => {
    const checkAuth = async () => {
      const token = spectra.auth.getToken();
      if (!token) {
        setIsLoadingAuth(false);
        setAuthError({ type: 'auth_required' });
        return;
      }
      try {
        const me = await spectra.auth.me();
        setUser(me);
        setIsAuthenticated(true);
      } catch (e) {
        spectra.auth.clearToken();
        setAuthError({ type: 'auth_required' });
      } finally {
        setIsLoadingAuth(false);
      }
    };
    checkAuth();
  }, []);

  const logout = async () => {
    await spectra.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required' });
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user, setUser, isAuthenticated, setIsAuthenticated,
      isLoadingAuth, isLoadingPublicSettings,
      authError, appPublicSettings, logout, navigateToLogin,
      checkAppState: () => {},
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

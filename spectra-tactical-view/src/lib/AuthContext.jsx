/**
 * AuthContext — Supabase Auth integration.
 * Uses Supabase session management with auto-refresh.
 * On first login, backend auto-creates a User row from the Supabase JWT.
 */
import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { spectra } from '@/api/spectraClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings] = useState({ id: 'spectra', public_settings: {} });

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const me = await spectra.auth.me();
          setUser(me);
          setIsAuthenticated(true);
        } catch {
          await supabase.auth.signOut();
          setAuthError({ type: 'auth_required' });
        }
      } else {
        setAuthError({ type: 'auth_required' });
      }
      setIsLoadingAuth(false);
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          try {
            const me = await spectra.auth.me();
            setUser(me);
            setIsAuthenticated(true);
            setAuthError(null);
          } catch {
            setAuthError({ type: 'auth_required' });
          }
        }
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required' });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, setUser, isAuthenticated, setIsAuthenticated,
      isLoadingAuth, isLoadingPublicSettings: false,
      authError, appPublicSettings, logout,
      navigateToLogin: () => { window.location.href = '/login'; },
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

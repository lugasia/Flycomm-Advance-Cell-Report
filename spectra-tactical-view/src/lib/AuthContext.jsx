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
    // Detect recovery hash before anything else — don't run normal auth init
    const hash = window.location.hash;
    const isRecoveryFlow = hash.includes('type=recovery');

    // Register the listener FIRST so it catches the recovery event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY' && session) {
          window.location.href = '/login?recovery=true';
          return;
        }
        if (event === 'SIGNED_IN' && session) {
          try {
            const me = await spectra.auth.me();
            setUser(me);
            setIsAuthenticated(true);
            setAuthError(null);
          } catch {
            setAuthError({ type: 'auth_required' });
          }
          setIsLoadingAuth(false);
        }
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required' });
          setIsLoadingAuth(false);
        }
      }
    );

    // If recovery flow, skip normal init — let onAuthStateChange handle it
    if (isRecoveryFlow) {
      // Supabase will process the hash and fire PASSWORD_RECOVERY
      return () => subscription.unsubscribe();
    }

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

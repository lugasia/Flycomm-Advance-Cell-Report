import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Login() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('recovery') === 'true') {
      setIsRecovery(true);
    }
  }, [searchParams]);

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordUpdated(true);
      setTimeout(() => navigate('/Dashboard'), 2000);
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?recovery=true`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setConfirmationSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/Dashboard');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/Dashboard`,
      },
    });
    if (error) setError(error.message);
  };

  // Password recovery — set new password
  if (isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0F1E]">
        <div className="w-full max-w-md p-10 rounded-2xl bg-[#0F1629] border border-white/[0.06] shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <img src="/fcic.png" alt="Flycomm" className="w-64 mb-8 object-contain" />
            <h2 className="text-xl font-bold text-slate-100">Set New Password</h2>
            <p className="text-sm text-slate-400 mt-2">Enter your new password below</p>
          </div>
          {passwordUpdated ? (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-slate-300">Password updated. Redirecting...</p>
            </div>
          ) : (
            <form onSubmit={handleSetNewPassword} className="space-y-3">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 6 characters)"
                required
                minLength={6}
                className="w-full px-4 py-2.5 rounded-lg bg-[#1A2238] border border-white/[0.08] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
              />
              <button
                type="submit"
                disabled={loading || newPassword.length < 6}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
              {error && <p className="text-center text-sm text-red-400">{error}</p>}
            </form>
          )}
        </div>
      </div>
    );
  }

  // Forgot password — send reset email
  if (isForgotPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0F1E]">
        <div className="w-full max-w-md p-10 rounded-2xl bg-[#0F1629] border border-white/[0.06] shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <img src="/fcic.png" alt="Flycomm" className="w-64 mb-8 object-contain" />
            <h2 className="text-xl font-bold text-slate-100">Reset Password</h2>
            <p className="text-sm text-slate-400 mt-2">Enter your email to receive a reset link</p>
          </div>
          {resetSent ? (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm text-slate-300 mb-4">Reset link sent to <span className="text-slate-100">{email}</span></p>
              <button
                onClick={() => { setIsForgotPassword(false); setResetSent(false); }}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                className="w-full px-4 py-2.5 rounded-lg bg-[#1A2238] border border-white/[0.08] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              {error && <p className="text-center text-sm text-red-400">{error}</p>}
            </form>
          )}
          {!resetSent && (
            <p className="mt-4 text-center text-[12px] text-slate-500">
              <button
                onClick={() => { setIsForgotPassword(false); setError(null); }}
                className="text-blue-400 hover:text-blue-300"
              >
                Back to sign in
              </button>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (confirmationSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0F1E]">
        <div className="w-full max-w-md p-10 rounded-2xl bg-[#0F1629] border border-white/[0.06] shadow-2xl text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Check your email</h2>
          <p className="text-sm text-slate-400 mb-6">
            We sent a confirmation link to <span className="text-slate-200">{email}</span>.
            Click the link to activate your account.
          </p>
          <button
            onClick={() => { setConfirmationSent(false); setIsSignUp(false); }}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0F1E]">
      <div className="w-full max-w-md p-10 rounded-2xl bg-[#0F1629] border border-white/[0.06] shadow-2xl">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src="/fcic.png" alt="Flycomm" className="w-64 mb-8 object-contain" />
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Spectra SOC</h1>
          <p className="text-base text-slate-500 mt-2">Spectral Awareness Platform</p>
        </div>

        {/* Email/Password Login */}
        <form onSubmit={handleEmailAuth} className="space-y-3 mb-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="w-full px-4 py-2.5 rounded-lg bg-[#1A2238] border border-white/[0.08] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="w-full px-4 py-2.5 rounded-lg bg-[#1A2238] border border-white/[0.08] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
          />
          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Forgot password + Toggle sign-in / sign-up */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] text-slate-500">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              className="text-blue-400 hover:text-blue-300"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
          {!isSignUp && (
            <button
              onClick={() => { setIsForgotPassword(true); setError(null); }}
              className="text-[12px] text-slate-500 hover:text-blue-400"
            >
              Forgot password?
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[11px] text-slate-600">or</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-sm text-slate-200 font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-600">
          Access restricted to authorized personnel only.
        </p>
      </div>
    </div>
  );
}

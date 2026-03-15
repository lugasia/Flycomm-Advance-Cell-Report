import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { spectra } from '@/api/spectraClient';
import { useNavigate } from 'react-router-dom';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function Login() {
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError(null);
    try {
      await spectra.auth.googleLogin(credentialResponse.credential);
      navigate('/Dashboard');
    } catch (e) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await spectra.auth.devLogin(email.trim());
      navigate('/Dashboard');
    } catch (e) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0F1E]">
      <div className="w-full max-w-md p-10 rounded-2xl bg-[#0F1629] border border-white/[0.06] shadow-2xl">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src="/fcic.png" alt="Flycomm" className="w-64 mb-8 object-contain" />
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Spectra SOC</h1>
          <p className="text-base text-slate-500 mt-2">Spectral Awareness Platform</p>
        </div>

        {/* Email Login */}
        <form onSubmit={handleEmailLogin} className="space-y-3 mb-4">
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
            {loading ? 'Signing in...' : 'Sign in with Email'}
          </button>
        </form>

        {/* Google Login */}
        {GOOGLE_CLIENT_ID && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[11px] text-slate-600">or</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="flex justify-center">
              {loading ? null : (
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError('Google sign-in failed')}
                  theme="filled_black"
                  size="large"
                  shape="pill"
                  text="signin_with"
                  width="300"
                />
              )}
            </div>
          </>
        )}

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

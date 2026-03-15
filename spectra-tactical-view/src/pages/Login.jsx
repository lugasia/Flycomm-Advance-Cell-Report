import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { spectra } from '@/api/spectraClient';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();

  const handleSuccess = async (credentialResponse) => {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0F1E]">
      <div className="w-full max-w-sm p-8 rounded-2xl bg-[#0F1629] border border-white/[0.06] shadow-2xl">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/fcic.png" alt="Flycomm" className="w-16 h-16 mb-4 object-contain" />
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Spectra SOC</h1>
          <p className="text-sm text-slate-500 mt-1">Spectral Awareness Platform</p>
        </div>

        {/* Google Login */}
        <div className="flex justify-center">
          {loading ? (
            <div className="w-8 h-8 border-4 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
          ) : (
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError('Google sign-in failed')}
              theme="filled_black"
              size="large"
              shape="pill"
              text="signin_with"
              width="300"
            />
          )}
        </div>

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

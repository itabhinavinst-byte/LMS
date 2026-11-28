import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AitMLogo } from '../components/BrandMark';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
import { apiRequest } from '../lib/api';

export function AdminLoginPage() {
  const { settings } = useSite();
  const { loginAdmin, setupSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [fullName, setFullName] = useState('AITM Super Administrator');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<{ needsSetup: boolean }>('/api/auth/admin/status', { token: null });
        if (active) setNeedsSetup(res.needsSetup);
      } catch {
        // Default to standard login on transient error
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await setupSuperAdmin(fullName, identifier, password);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize Super Admin.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginAdmin(identifier, password);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid administrator credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Public Website
        </Link>

        <div className="bg-white border border-slate-200 rounded-xl p-7 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <AitMLogo
              logoUrl={settings?.logo_url}
              shortName={settings?.short_name || 'AITM'}
              className="h-10 w-10"
            />
            <div>
              <h1 className="font-display font-bold text-xl text-slate-950">
                {needsSetup ? 'Initialize First Super Admin' : 'Administrator Console'}
              </h1>
              <p className="text-xs text-slate-500">
                {settings?.institute_name || 'Abhinav Institute of Technology & Management'}
              </p>
            </div>
          </div>

          {checking ? (
            <div className="py-8 text-center text-sm text-slate-500">Checking administration status...</div>
          ) : (
            <>
              {needsSetup && (
                <div className="mb-5 p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed">
                  First-run setup detected. Create the primary Super Administrator account below. Once claimed, this setup form locks permanently and standard administrator login is required.
                </div>
              )}

              {error && (
                <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                  {error}
                </div>
              )}

              {needsSetup ? (
                <form onSubmit={handleSetup} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Administrator Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Official Admin Email
                    </label>
                    <input
                      type="email"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="admin@abhinavinst.com"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Password (min 8 characters)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {loading ? 'Creating Super Admin...' : 'Claim Super Admin & Enter Dashboard'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Administrator Email or Username
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="admin@abhinavinst.com"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {loading ? 'Verifying...' : 'Sign In to Admin Panel'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

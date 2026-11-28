import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { AitMLogo } from '../components/BrandMark';
import { useSite } from '../context/SiteContext';
import { apiRequest } from '../lib/api';

interface TokenVerifyInfo {
  valid: boolean;
  fullName?: string;
  rollNumber?: string;
  emailMasked?: string;
  error?: string;
}

export function ForgotPasswordPage() {
  const { settings } = useSite();
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get('token') || '';
  const isActivationFlow = searchParams.get('mode') === 'activate';

  const [mode, setMode] = useState<'request' | 'reset'>(initialToken ? 'reset' : 'request');
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(Boolean(initialToken));
  const [tokenInfo, setTokenInfo] = useState<TokenVerifyInfo | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!initialToken) return;
    let active = true;
    setVerifying(true);
    apiRequest<TokenVerifyInfo>(
      `/api/auth/reset-password/verify?token=${encodeURIComponent(initialToken)}`,
      { token: null }
    )
      .then((res) => {
        if (!active) return;
        setTokenInfo(res);
        if (!res.valid && res.error) {
          setFeedback({ type: 'error', text: res.error });
        }
      })
      .catch(() => {
        if (!active) return;
        setTokenInfo({ valid: false, error: 'Unable to verify activation link.' });
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [initialToken]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: { identifier },
        token: null,
      });
      setFeedback({ type: 'success', text: res.message });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to process request.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: { token, new_password: newPassword },
        token: null,
      });
      setFeedback({
        type: 'success',
        text: isActivationFlow
          ? 'Your student account is activated and your password has been saved. You can now sign in to the AITM Student LMS Portal.'
          : res.message,
      });
      setResetSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update password.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Student Login
        </Link>

        <div className="bg-white border border-slate-200 rounded-xl p-7 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <AitMLogo
              logoUrl={settings?.logo_url}
              shortName={settings?.short_name || 'AITM'}
              className="h-9 w-9"
            />
            <div>
              <h1 className="font-display font-bold text-xl text-slate-950">
                {isActivationFlow && mode === 'reset'
                  ? 'Activate Student Account'
                  : 'Password Setup & Recovery'}
              </h1>
              <p className="text-xs text-slate-500">
                {settings?.institute_name || 'Abhinav Institute of Technology & Management'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('request');
                setFeedback(null);
                setResetSuccess(false);
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'request' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Request Setup Link
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('reset');
                setFeedback(null);
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'reset' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Set / Reset Password
            </button>
          </div>

          {verifying && (
            <div className="mb-5 p-3.5 rounded-lg text-xs border bg-slate-50 text-slate-700 border-slate-200">
              Verifying your secure activation link...
            </div>
          )}

          {tokenInfo?.valid && mode === 'reset' && !resetSuccess && (
            <div className="mb-5 p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                Verified Student Account
              </div>
              <div>
                <span className="font-semibold">{tokenInfo.fullName}</span>
                {tokenInfo.rollNumber ? (
                  <>
                    {' '}
                    · Roll No: <span className="font-mono font-bold">{tokenInfo.rollNumber}</span>
                  </>
                ) : null}
              </div>
              {tokenInfo.emailMasked && (
                <div className="text-blue-800">Registered Email: {tokenInfo.emailMasked}</div>
              )}
            </div>
          )}

          {feedback && (
            <div
              className={`mb-5 p-3.5 rounded-lg text-sm border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-red-50 text-red-900 border-red-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {feedback.type === 'success' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                )}
                <span>{feedback.text}</span>
              </div>
              {resetSuccess && (
                <div className="mt-3">
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center w-full px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                  >
                    Sign In to Student Portal
                  </Link>
                </div>
              )}
            </div>
          )}

          {mode === 'request' ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Registered Email, Roll Number, Candidate ID, or Username
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g., student@gmail.com, AITM-2026-0001, or CAN_..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {loading ? 'Sending...' : 'Send Password Setup Link'}
              </button>
            </form>
          ) : !resetSuccess ? (
            <form onSubmit={handleReset} className="space-y-4">
              {!tokenInfo?.valid && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Activation / Reset Token
                  </label>
                  <input
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste secure token from your AITM email"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  New Password (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Create a strong personal password"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {loading
                  ? 'Saving Password...'
                  : isActivationFlow
                    ? 'Activate Account & Save Password'
                    : 'Save New Password'}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

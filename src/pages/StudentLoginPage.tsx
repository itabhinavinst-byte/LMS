import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { AitMLogo } from '../components/BrandMark';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';

export function StudentLoginPage() {
  const { settings } = useSite();
  const { loginStudent } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginStudent(identifier, password);
      navigate('/student/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {settings?.short_name || 'AITM'} Website
        </Link>

        <div className="bg-white border border-slate-200 rounded-xl p-7 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <AitMLogo
              logoUrl={settings?.logo_url}
              shortName={settings?.short_name || 'AITM'}
              className="h-10 w-10"
            />
            <div>
              <h1 className="font-display font-bold text-xl text-slate-950">Student Portal Login</h1>
              <p className="text-xs text-slate-500">
                {settings?.institute_name || 'Abhinav Institute of Technology & Management'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Registered Email, Roll Number, Candidate ID, or Employee Code
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g., student@gmail.com, AITM-2026-0001, or CAN_..."
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Forgot / Set password?
                </Link>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              {loading ? 'Signing in...' : 'Sign In to Student Portal'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 space-y-2">
            <p>
              Enrolled students can sign in with their registered Email, Roll Number (e.g.,{' '}
              <span className="font-mono text-slate-700">AITM-2026-0001</span>), Candidate ID, or Employee Code. Use the
              activation link in your AITM welcome email to set your personal password.
            </p>
            <p>
              Not enrolled yet?{' '}
              <Link to="/apply" className="text-blue-700 font-medium hover:underline">
                Apply for a course
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

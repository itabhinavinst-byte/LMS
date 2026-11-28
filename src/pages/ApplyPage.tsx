import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { PublicFooter, PublicHeader } from '../components/PublicLayout';
import { useSite } from '../context/SiteContext';
import { apiRequest } from '../lib/api';

export function ApplyPage() {
  const { courses, settings } = useSite();
  const [searchParams] = useSearchParams();
  const initialCourseId = searchParams.get('course') || '';

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    mobile: '',
    dob: '',
    gender: 'Male',
    qualification: '',
    city: '',
    state: 'Maharashtra',
    course_id: initialCourseId,
    additional_info: '',
  });

  useEffect(() => {
    if (initialCourseId) {
      setForm((prev) => ({ ...prev, course_id: initialCourseId }));
    } else if (!form.course_id && courses.length > 0) {
      setForm((prev) => ({ ...prev, course_id: String(courses[0].id) }));
    }
  }, [initialCourseId, courses]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<{
    application_code: string;
    course_name: string;
    message: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        application: { application_code: string; course_name: string };
        message: string;
      }>('/api/public/applications', {
        method: 'POST',
        body: { ...form, course_id: Number(form.course_id) },
        token: null,
      });
      setSubmitted({
        application_code: res.application.application_code,
        course_name: res.application.course_name,
        message: res.message,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <PublicHeader />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 lg:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Website
        </Link>

        {submitted ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-10">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mb-4" />
            <h1 className="font-display font-bold text-2xl text-slate-950">
              Application Submitted Successfully
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{submitted.message}</p>

            <dl className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Application ID</dt>
                <dd className="font-mono font-semibold text-slate-950">{submitted.application_code}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Selected Course</dt>
                <dd className="font-medium text-slate-900">{submitted.course_name}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Current Status</dt>
                <dd className="font-medium text-amber-700">Pending Administrator Review</dd>
              </div>
            </dl>

            <p className="mt-5 text-xs text-slate-500 leading-relaxed">
              Note: Student portal credentials and your unique AITM Enrollment Number are generated once AITM Administration approves your application.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/"
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                Return to Home
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(null);
                  setForm((prev) => ({
                    ...prev,
                    full_name: '',
                    email: '',
                    mobile: '',
                    additional_info: '',
                  }));
                }}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Submit Another Application
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-10">
            <p className="text-xs font-medium text-blue-700 mb-1">
              {settings?.institute_name || 'Abhinav Institute of Technology & Management'}
            </p>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-950 tracking-tight">
              Student Admission Application
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Complete the application form below. After submission, our Admissions Team reviews your application and activates your AITM Student Portal account.
            </p>

            {error && (
              <div className="mt-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Selected Course *
                </label>
                <select
                  required
                  value={form.course_id}
                  onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                >
                  <option value="" disabled>
                    Select a published course...
                  </option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.duration_display} ({c.mode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="e.g., Vaishnav Deshmukh"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="student@example.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    placeholder="9876543210"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Gender *
                  </label>
                  <select
                    required
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Highest Qualification *
                </label>
                <input
                  type="text"
                  required
                  value={form.qualification}
                  onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                  placeholder="e.g., B.Sc Computer Science / ITI / Diploma / 12th Pass"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="e.g., Thane"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    State *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    placeholder="e.g., Maharashtra"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Additional Information (Optional)
                </label>
                <textarea
                  rows={3}
                  value={form.additional_info}
                  onChange={(e) => setForm({ ...form, additional_info: e.target.value })}
                  placeholder="Preferred batch timing, prior experience, or questions for admissions..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || courses.length === 0}
                  className="w-full sm:w-auto px-7 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  {submitting ? 'Submitting Application...' : 'Submit Admission Application'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

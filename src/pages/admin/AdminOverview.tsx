import React, { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Mail, Send } from 'lucide-react';
import { apiRequest, formatDateShort, formatDateTime } from '../../lib/api';
import { useRealtime } from '../../context/RealtimeContext';
import type { CredentialsEmailOverview } from '../../types';

interface OverviewData {
  stats: {
    totalCourses: number;
    totalEnrollments: number;
    totalUniqueStudents: number;
    activeStudents: number;
    completedStudents: number;
    pendingApplications: number;
    totalMaterials: number;
  };
  charts: {
    courseWise: Array<{
      id: number;
      code: string;
      name: string;
      total_students: number;
      active_students: number;
      completed_students: number;
    }>;
    monthlyRegistrations: Array<{ month: string; enrollments: number }>;
    statusBreakdown: Array<{ status: string; count: number }>;
  };
  recentEnrollments: Array<{
    id: number;
    enrollment_number: string;
    student_name: string;
    email: string;
    course_name: string;
    enrollment_date: string;
    status: string;
    progress_percent: number;
  }>;
  recentApplications: Array<{
    id: number;
    application_code: string;
    full_name: string;
    email: string;
    course_name: string;
    status: string;
    created_at: string;
  }>;
  recentActivities: Array<{
    id: number;
    actor_name: string;
    actor_role: string;
    action: string;
    details: string;
    created_at: string;
  }>;
}

const PIE_COLORS = ['#1D4ED8', '#16A34A', '#D97706', '#DC2626'];

export function AdminOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [emailSummary, setEmailSummary] = useState<CredentialsEmailOverview['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      const [res, credRes] = await Promise.all([
        apiRequest<OverviewData>('/api/admin/overview'),
        apiRequest<CredentialsEmailOverview>('/api/admin/credentials-email/summary').catch(() => null),
      ]);
      setData(res);
      if (credRes) setEmailSummary(credRes.summary);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useRealtime(
    ['stats:updated', 'courses:changed', 'applications:changed', 'enrollments:changed', 'resources:changed', 'emails:changed'],
    () => {
      loadOverview();
    }
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-slate-100 border border-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 bg-slate-100 rounded-xl" />
          <div className="h-72 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
        {error || 'Failed to load dashboard overview.'}
      </div>
    );
  }

  const statItems = [
    { label: 'Total Courses', value: data.stats.totalCourses, tab: 'courses' },
    { label: 'Total Enrollments', value: data.stats.totalEnrollments, tab: 'enrollments' },
    { label: 'Active Students', value: data.stats.activeStudents, tab: 'students' },
    { label: 'Completed Students', value: data.stats.completedStudents, tab: 'enrollments' },
    { label: 'Pending Applications', value: data.stats.pendingApplications, tab: 'applications' },
    { label: 'Learning Materials', value: data.stats.totalMaterials, tab: 'materials' },
  ];

  const courseChartData = data.charts.courseWise.map((c) => ({
    name: c.code || c.name.slice(0, 14),
    fullName: c.name,
    Active: Number(c.active_students || 0),
    Completed: Number(c.completed_students || 0),
    Total: Number(c.total_students || 0),
  }));

  const pieData =
    data.charts.statusBreakdown.length > 0
      ? data.charts.statusBreakdown.map((item) => ({ name: item.status, value: item.count }))
      : [{ name: 'No Enrollments Yet', value: 1 }];

  return (
    <div className="space-y-8">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {statItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onNavigate(item.tab)}
            className="text-left p-5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
          >
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className="mt-2 font-mono font-bold text-2xl text-slate-950 tabular-nums">
              {item.value}
            </div>
          </button>
        ))}
      </div>

      {/* Automated Student Login Credentials Email Quick Action */}
      {emailSummary && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-sm text-slate-950">
                Automated Student Login Credentials Emails
              </h2>
              <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                <span className="font-semibold text-slate-900">{emailSummary.totalEnrolledStudents}</span> enrolled
                students · <span className="font-semibold text-blue-700">{emailSummary.validEmailCount}</span> valid
                emails · <span className="font-semibold text-emerald-700">{emailSummary.sentCount}</span> sent ·{' '}
                <span className="font-semibold text-amber-700">{emailSummary.pendingCount}</span> pending ·{' '}
                <span className="font-semibold text-red-700">{emailSummary.failedCount}</span> failed
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('emails')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            Send Login Emails to All Existing Students
          </button>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-base text-slate-950">
              Course-Wise Enrollments
            </h2>
            <span className="text-xs text-slate-500">Live DB Count</span>
          </div>
          {courseChartData.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-sm text-slate-500">
              Add courses to track enrollments.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={courseChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip />
                  <Bar dataKey="Active" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Completed" fill="#16A34A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-base text-slate-950">
              Monthly Registrations
            </h2>
            <span className="text-xs text-slate-500">Trend</span>
          </div>
          {data.charts.monthlyRegistrations.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-500 text-center px-4">
              Monthly registration trend appears automatically as applications are approved.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.charts.monthlyRegistrations}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="enrollments"
                    stroke="#1D4ED8"
                    fill="#DBEAFE"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="font-display font-semibold text-base text-slate-950 mb-4">
            Active vs Completed
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {pieData.map((entry, idx) => (
                    <Cell
                      key={entry.name}
                      fill={
                        data.charts.statusBreakdown.length === 0
                          ? '#E2E8F0'
                          : PIE_COLORS[idx % PIE_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            {data.charts.statusBreakdown.length === 0 ? (
              <p className="text-slate-500 text-center">No enrollment records yet.</p>
            ) : (
              data.charts.statusBreakdown.map((item, idx) => (
                <div key={item.status} className="flex items-center justify-between">
                  <span className="text-slate-600 flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-xs inline-block"
                      style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    {item.status}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {item.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Course-wise Student Count Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display font-semibold text-base text-slate-950">
            Course-Wise Student Distribution
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('courses')}
            className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
          >
            Manage Courses
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-medium">Course Code</th>
                <th className="px-6 py-3 font-medium">Course Name</th>
                <th className="px-6 py-3 font-medium text-right">Total Enrolled</th>
                <th className="px-6 py-3 font-medium text-right">Active</th>
                <th className="px-6 py-3 font-medium text-right">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.charts.courseWise.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="px-6 py-3 font-mono text-xs text-slate-600">{c.code}</td>
                  <td className="px-6 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-6 py-3 text-right font-mono tabular-nums text-slate-900">
                    {c.total_students}
                  </td>
                  <td className="px-6 py-3 text-right font-mono tabular-nums text-blue-700">
                    {c.active_students || 0}
                  </td>
                  <td className="px-6 py-3 text-right font-mono tabular-nums text-emerald-700">
                    {c.completed_students || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Enrollments, Applications & Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm text-slate-950">Recent Enrollments</h3>
            <button
              type="button"
              onClick={() => onNavigate('enrollments')}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentEnrollments.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">No enrollments yet.</p>
            ) : (
              data.recentEnrollments.map((e) => (
                <div key={e.id} className="px-5 py-3.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{e.student_name}</span>
                    <span className="font-mono font-semibold text-blue-700">{e.enrollment_number}</span>
                  </div>
                  <div className="mt-1 text-slate-500 flex items-center justify-between gap-2">
                    <span className="truncate">{e.course_name}</span>
                    <span className="shrink-0 tabular-nums">{formatDateShort(e.enrollment_date)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm text-slate-950">Recent Applications</h3>
            <button
              type="button"
              onClick={() => onNavigate('applications')}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              Review
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentApplications.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">No applications submitted yet.</p>
            ) : (
              data.recentApplications.map((a) => (
                <div key={a.id} className="px-5 py-3.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{a.full_name}</span>
                    <span
                      className={`font-medium ${
                        a.status === 'PENDING'
                          ? 'text-amber-700'
                          : a.status === 'APPROVED'
                            ? 'text-emerald-700'
                            : 'text-red-700'
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-500 flex items-center justify-between gap-2">
                    <span className="truncate">{a.course_name}</span>
                    <span className="font-mono shrink-0">{a.application_code}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="font-display font-semibold text-sm text-slate-950">Recent Activity</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {data.recentActivities.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">Activity history will appear here.</p>
            ) : (
              data.recentActivities.map((act) => (
                <div key={act.id} className="px-5 py-3 text-xs">
                  <div className="font-medium text-slate-900">{act.details || act.action}</div>
                  <div className="mt-1 text-slate-500 flex items-center justify-between gap-2">
                    <span>{act.actor_name}</span>
                    <span className="tabular-nums">{formatDateTime(act.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

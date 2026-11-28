import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Mail,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest, formatDateTime } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import type {
  AnnouncementRecord,
  BulkCampaignReport,
  Course,
  CredentialsEmailOverview,
  EmailLogRecord,
  EmailProviderStatus,
  MeetingRecord,
} from '../../types';

export function AdminOperations({
  section,
}: {
  section: 'announcements' | 'meetings' | 'emails' | 'reports' | 'settings';
}) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [emails, setEmails] = useState<EmailLogRecord[]>([]);
  const [providerStatus, setProviderStatus] = useState<EmailProviderStatus | null>(null);
  const [credOverview, setCredOverview] = useState<CredentialsEmailOverview | null>(null);
  const [credSearch, setCredSearch] = useState('');
  const [credStatusFilter, setCredStatusFilter] = useState<'ALL' | 'PENDING' | 'SENT' | 'FAILED' | 'INVALID_EMAIL'>('ALL');
  const [confirmBulkAll, setConfirmBulkAll] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [sendingStudentId, setSendingStudentId] = useState<number | null>(null);
  const [lastCampaignReport, setLastCampaignReport] = useState<BulkCampaignReport | null>(null);
  const [previewModal, setPreviewModal] = useState<{
    subject: string;
    html: string;
    text: string;
    studentName: string;
    rollNumber: string;
    email: string;
    tab: 'html' | 'text';
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [reportData, setReportData] = useState<{
    courseSummary: Array<Record<string, unknown>>;
    applicationFunnel: Array<{ status: string; count: number }>;
    emailDelivery: Array<{ status: string; count: number }>;
    sequence: { prefix: string; last_number: number };
  } | null>(null);
  const [inquiries, setInquiries] = useState<Array<Record<string, unknown>>>([]);
  const [adminUsers, setAdminUsers] = useState<Array<Record<string, unknown>>>([]);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Forms
  const [annForm, setAnnForm] = useState({
    title: '',
    content: '',
    course_id: '',
    priority: 'NORMAL',
    is_published: true,
  });

  const [meetForm, setMeetForm] = useState({
    title: '',
    description: '',
    course_id: '',
    batch_name: 'All Batches',
    scheduled_at: '',
    duration_minutes: 60,
    meeting_url: '',
    platform: 'Google Meet',
  });

  const [testEmailTo, setTestEmailTo] = useState(user?.email || '');
  const [newAdminForm, setNewAdminForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'ADMIN',
    designation: 'Academic Administrator',
    department: 'Admissions & LMS',
  });
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });

  const loadSection = useCallback(async () => {
    try {
      const cRes = await apiRequest<{ courses: Course[] }>('/api/admin/courses');
      setCourses(cRes.courses);

      if (section === 'announcements') {
        const res = await apiRequest<{ announcements: AnnouncementRecord[] }>('/api/admin/announcements');
        setAnnouncements(res.announcements);
      } else if (section === 'meetings') {
        const res = await apiRequest<{ meetings: MeetingRecord[] }>('/api/admin/meetings');
        setMeetings(res.meetings);
        if (!meetForm.course_id && cRes.courses.length > 0) {
          setMeetForm((prev) => ({ ...prev, course_id: String(cRes.courses[0].id) }));
        }
      } else if (section === 'emails') {
        const [eRes, cOverview] = await Promise.all([
          apiRequest<{
            logs: EmailLogRecord[];
            providerStatus: EmailProviderStatus;
          }>('/api/admin/emails'),
          apiRequest<CredentialsEmailOverview>('/api/admin/credentials-email/summary'),
        ]);
        setEmails(eRes.logs);
        setProviderStatus(eRes.providerStatus || cOverview.providerStatus);
        setCredOverview(cOverview);
      } else if (section === 'reports') {
        const [rRes, iRes] = await Promise.all([
          apiRequest<typeof reportData>('/api/admin/reports'),
          apiRequest<{ inquiries: Array<Record<string, unknown>> }>('/api/admin/inquiries'),
        ]);
        setReportData(rRes);
        setInquiries(iRes.inquiries);
      } else if (section === 'settings') {
        const res = await apiRequest<{ admins: Array<Record<string, unknown>> }>('/api/admin/users');
        setAdminUsers(res.admins);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load section.' });
    }
  }, [section]);

  useEffect(() => {
    setFeedback(null);
    loadSection();
  }, [loadSection]);

  useRealtime(['announcements:changed', 'meetings:changed', 'emails:changed', 'inquiries:changed', 'stats:updated'], () => {
    loadSection();
  });

  const exportCsv = (rows: Array<Record<string, unknown>>, filename: string) => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        headers
          .map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const filteredCredStudents = useMemo(() => {
    if (!credOverview) return [];
    let list = credOverview.students;
    if (credStatusFilter !== 'ALL') {
      list = list.filter((s) => s.delivery_status === credStatusFilter);
    }
    const q = credSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.full_name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.roll_number.toLowerCase().includes(q) ||
          s.candidate_id.toLowerCase().includes(q) ||
          s.enrolled_courses.toLowerCase().includes(q) ||
          s.batches.toLowerCase().includes(q)
      );
    }
    return list;
  }, [credOverview, credStatusFilter, credSearch]);

  const openTemplatePreview = async (userId?: number) => {
    setLoadingPreview(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{
        subject: string;
        html: string;
        text: string;
        student: { full_name: string; roll_number: string; email: string } | null;
      }>('/api/admin/credentials-email/preview-template', {
        method: 'POST',
        body: userId ? { userId } : {},
      });
      setPreviewModal({
        subject: res.subject,
        html: res.html,
        text: res.text,
        studentName: res.student?.full_name || 'Sample Enrolled Student',
        rollNumber: res.student?.roll_number || 'AITM-2026-0001',
        email: res.student?.email || 'student@example.com',
        tab: 'html',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to generate preview.' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleBulkSendAll = async () => {
    setConfirmBulkAll(false);
    setBulkSending(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ report: BulkCampaignReport; overview: CredentialsEmailOverview }>(
        '/api/admin/credentials-email/send-all',
        { method: 'POST', body: {} }
      );
      setLastCampaignReport(res.report);
      setCredOverview(res.overview);
      setFeedback({
        type: res.report.sentCount > 0 && res.report.failedCount === 0 ? 'success' : res.report.providerConfigured ? 'success' : 'error',
        text: res.report.message,
      });
      await loadSection();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Bulk email campaign failed.' });
    } finally {
      setBulkSending(false);
    }
  };

  const handleRetryFailed = async () => {
    setRetryingFailed(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ report: BulkCampaignReport; overview: CredentialsEmailOverview }>(
        '/api/admin/credentials-email/retry-failed',
        { method: 'POST', body: {} }
      );
      setLastCampaignReport(res.report);
      setCredOverview(res.overview);
      setFeedback({
        type: res.report.sentCount > 0 && res.report.failedCount === 0 ? 'success' : 'error',
        text: res.report.message,
      });
      await loadSection();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Retry failed.' });
    } finally {
      setRetryingFailed(false);
    }
  };

  const handleSendSingleStudent = async (userId: number, forceResend: boolean) => {
    setSendingStudentId(userId);
    setFeedback(null);
    try {
      const res = await apiRequest<{
        result: { status: string; message: string };
        overview: CredentialsEmailOverview;
      }>(`/api/admin/credentials-email/send-student/${userId}`, {
        method: 'POST',
        body: { forceResend },
      });
      setCredOverview(res.overview);
      setFeedback({
        type: res.result.status === 'SENT' || res.result.status === 'SKIPPED_ALREADY_SENT' ? 'success' : 'error',
        text: `${res.result.status}: ${res.result.message}`,
      });
      await loadSection();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to send email.' });
    } finally {
      setSendingStudentId(null);
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-3.5 rounded-lg text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* ANNOUNCEMENTS */}
      {section === 'announcements' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setFeedback(null);
              try {
                await apiRequest('/api/admin/announcements', {
                  method: 'POST',
                  body: {
                    ...annForm,
                    course_id: annForm.course_id ? Number(annForm.course_id) : null,
                  },
                });
                setAnnForm({ title: '', content: '', course_id: '', priority: 'NORMAL', is_published: true });
                setFeedback({ type: 'success', text: 'Announcement published to relevant student dashboards.' });
                await loadSection();
              } catch (err) {
                setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed.' });
              }
            }}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display font-bold text-lg text-slate-950 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blue-700" />
              Create Announcement
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
              <input
                type="text"
                required
                value={annForm.title}
                onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Audience</label>
                <select
                  value={annForm.course_id}
                  onChange={(e) => setAnnForm({ ...annForm, course_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="">All Enrolled Students</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                <select
                  value={annForm.priority}
                  onChange={(e) => setAnnForm({ ...annForm, priority: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Message *</label>
              <textarea
                rows={4}
                required
                value={annForm.content}
                onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={annForm.is_published}
                onChange={(e) => setAnnForm({ ...annForm, is_published: e.target.checked })}
              />
              Publish immediately to student dashboards
            </label>
            <button
              type="submit"
              className="w-full py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Publish Announcement
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            <h2 className="font-display font-bold text-lg text-slate-950">
              Published & Draft Announcements ({announcements.length})
            </h2>
            {announcements.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                No announcements created yet.
              </div>
            ) : (
              announcements.map((a) => (
                <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">
                        <span className="font-semibold text-blue-700">{a.priority}</span> ·{' '}
                        {a.course_name || 'All Students'} · {formatDateTime(a.created_at)}
                      </div>
                      <h3 className="mt-1 font-display font-semibold text-base text-slate-950">
                        {a.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/announcements/${a.id}`, {
                            method: 'PUT',
                            body: { is_published: !a.is_published },
                          });
                          await loadSection();
                        }}
                        className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                      >
                        {a.is_published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/announcements/${a.id}`, { method: 'DELETE' });
                          await loadSection();
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{a.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MEETINGS */}
      {section === 'meetings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setFeedback(null);
              try {
                await apiRequest('/api/admin/meetings', {
                  method: 'POST',
                  body: {
                    ...meetForm,
                    course_id: Number(meetForm.course_id),
                    duration_minutes: Number(meetForm.duration_minutes),
                  },
                });
                setMeetForm((prev) => ({
                  ...prev,
                  title: '',
                  description: '',
                  scheduled_at: '',
                  meeting_url: '',
                }));
                setFeedback({ type: 'success', text: 'Live session scheduled and students notified.' });
                await loadSection();
              } catch (err) {
                setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Scheduling failed.' });
              }
            }}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display font-bold text-lg text-slate-950 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-700" />
              Schedule Live Meeting
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Meeting Title *</label>
              <input
                type="text"
                required
                value={meetForm.title}
                onChange={(e) => setMeetForm({ ...meetForm, title: e.target.value })}
                placeholder="e.g., Weekly Lab Review & Q&A"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course *</label>
                <select
                  required
                  value={meetForm.course_id}
                  onChange={(e) => setMeetForm({ ...meetForm, course_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Batch</label>
                <input
                  type="text"
                  value={meetForm.batch_name}
                  onChange={(e) => setMeetForm({ ...meetForm, batch_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={meetForm.scheduled_at}
                  onChange={(e) => setMeetForm({ ...meetForm, scheduled_at: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (Min)</label>
                <input
                  type="number"
                  min={15}
                  value={meetForm.duration_minutes}
                  onChange={(e) => setMeetForm({ ...meetForm, duration_minutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Platform</label>
                <select
                  value={meetForm.platform}
                  onChange={(e) => setMeetForm({ ...meetForm, platform: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Google Meet">Google Meet</option>
                  <option value="Zoom">Zoom</option>
                  <option value="Microsoft Teams">Teams</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Meeting Link *</label>
                <input
                  type="url"
                  required
                  value={meetForm.meeting_url}
                  onChange={(e) => setMeetForm({ ...meetForm, meeting_url: e.target.value })}
                  placeholder="https://meet.google.com/..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Agenda / Notes</label>
              <textarea
                rows={2}
                value={meetForm.description}
                onChange={(e) => setMeetForm({ ...meetForm, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Schedule Meeting
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            <h2 className="font-display font-bold text-lg text-slate-950">
              Scheduled Live Sessions ({meetings.length})
            </h2>
            {meetings.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                No meetings scheduled yet.
              </div>
            ) : (
              meetings.map((m) => (
                <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      <span className="font-semibold text-blue-700">{m.course_name}</span> · {m.batch_name} ·{' '}
                      {m.platform}
                    </div>
                    <h3 className="mt-1 font-display font-semibold text-base text-slate-950">{m.title}</h3>
                    {m.description && <p className="mt-1 text-xs text-slate-600">{m.description}</p>}
                    <div className="mt-2 text-xs font-mono text-slate-700">
                      {formatDateTime(m.scheduled_at)} · {m.duration_minutes} min
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={m.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Join
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/meetings/${m.id}`, { method: 'DELETE' });
                        await loadSection();
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* EMAIL MANAGEMENT & AUTOMATED STUDENT LOGIN CREDENTIALS EMAIL SYSTEM */}
      {section === 'emails' && (
        <div className="space-y-6">
          {/* Header + Provider Status + Test Email */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display font-bold text-lg text-slate-950 flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-700" />
                Automated Student Login Credentials Email System
              </h2>
              <p className="text-xs text-slate-600">
                Active Email Service:{' '}
                <span
                  className={
                    providerStatus?.configured
                      ? 'text-emerald-700 font-semibold'
                      : 'text-amber-700 font-semibold'
                  }
                >
                  {providerStatus?.configured
                    ? `${providerStatus.provider} (${providerStatus.host}:${providerStatus.port})`
                    : 'Not Configured'}
                </span>
                {' · '}
                <span className="font-mono text-slate-500">From: {providerStatus?.from || 'aitm.connect@abhinavinst.com'}</span>
              </p>
              {!providerStatus?.configured && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  Configure <span className="font-mono font-semibold">RESEND_API_KEY</span>,{' '}
                  <span className="font-mono font-semibold">SENDGRID_API_KEY</span>, or{' '}
                  <span className="font-mono font-semibold">SMTP_HOST / SMTP_USER / SMTP_PASS</span> in Server Environment
                  Secrets to dispatch live emails to students. All passwords stay protected using secure single-use
                  activation links.
                </p>
              )}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setFeedback(null);
                try {
                  const res = await apiRequest<{ result: { status: string; message: string } }>(
                    '/api/admin/emails/test',
                    { method: 'POST', body: { to: testEmailTo } }
                  );
                  setFeedback({
                    type: res.result.status === 'SENT' ? 'success' : 'error',
                    text: `${res.result.status}: ${res.result.message}`,
                  });
                  await loadSection();
                } catch (err) {
                  setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Test failed.' });
                }
              }}
              className="flex items-center gap-2 shrink-0"
            >
              <input
                type="email"
                required
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="recipient@example.com"
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg w-56"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" /> Test Delivery
              </button>
            </form>
          </div>

          {/* 6 KPI Summary Cards */}
          {credOverview && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Total Enrolled Students</div>
                <div className="mt-1 font-mono font-bold text-2xl text-slate-950 tabular-nums">
                  {credOverview.summary.totalEnrolledStudents}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Valid Emails</div>
                <div className="mt-1 font-mono font-bold text-2xl text-blue-700 tabular-nums">
                  {credOverview.summary.validEmailCount}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Emails Sent</div>
                <div className="mt-1 font-mono font-bold text-2xl text-emerald-700 tabular-nums">
                  {credOverview.summary.sentCount}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Pending</div>
                <div className="mt-1 font-mono font-bold text-2xl text-amber-700 tabular-nums">
                  {credOverview.summary.pendingCount}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Failed</div>
                <div className="mt-1 font-mono font-bold text-2xl text-red-700 tabular-nums">
                  {credOverview.summary.failedCount}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Invalid Emails</div>
                <div className="mt-1 font-mono font-bold text-2xl text-slate-700 tabular-nums">
                  {credOverview.summary.invalidEmailCount}
                </div>
              </div>
            </div>
          )}

          {/* Primary Bulk Dispatch Action Bar */}
          {credOverview && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-950">
                    Bulk Student Login Email Dispatch
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Sends the official AITM welcome &amp; account activation email (Subject:{' '}
                    <span className="font-medium text-slate-900">
                      &ldquo;Welcome to AITM – Your Student LMS Login Details&rdquo;
                    </span>
                    ) with Roll Number, LMS Portal URL, and a secure 72-hour single-use password setup link. Never sends
                    plain-text passwords and skips students already marked Sent.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    disabled={loadingPreview}
                    onClick={() => openTemplatePreview()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {loadingPreview ? 'Loading...' : 'Preview HTML Email'}
                  </button>

                  {credOverview.summary.failedCount > 0 && (
                    <button
                      type="button"
                      disabled={retryingFailed || bulkSending || credOverview.bulkInProgress}
                      onClick={handleRetryFailed}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 disabled:opacity-60 rounded-lg cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {retryingFailed
                        ? 'Retrying Failed...'
                        : `Retry Failed Emails (${credOverview.summary.failedCount})`}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={bulkSending || retryingFailed || credOverview.bulkInProgress || credOverview.summary.totalEnrolledStudents === 0}
                    onClick={() => setConfirmBulkAll(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {bulkSending
                      ? 'Sending Login Emails...'
                      : 'Send Login Emails to All Existing Students'}
                  </button>
                </div>
              </div>

              {/* Inline Confirmation Bar (no browser alert/confirm) */}
              {confirmBulkAll && (
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-blue-950 space-y-0.5">
                    <div className="font-semibold">
                      Confirm Bulk Dispatch to Existing Enrolled Students
                    </div>
                    <div>
                      Will process{' '}
                      <span className="font-mono font-bold tabular-nums">
                        {credOverview.summary.pendingCount + credOverview.summary.failedCount}
                      </span>{' '}
                      unsent student(s) with valid emails and automatically skip{' '}
                      <span className="font-mono font-bold tabular-nums">
                        {credOverview.summary.sentCount}
                      </span>{' '}
                      already delivered student(s). Existing passwords will remain intact.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmBulkAll(false)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkSendAll}
                      className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                    >
                      Confirm &amp; Send Now
                    </button>
                  </div>
                </div>
              )}

              {/* Campaign Summary Result Banner */}
              {lastCampaignReport && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      {lastCampaignReport.failedCount === 0 && lastCampaignReport.sentCount > 0 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                      )}
                      Latest Campaign Summary ({lastCampaignReport.campaignKey})
                    </div>
                    <button
                      type="button"
                      onClick={() => setLastCampaignReport(null)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono tabular-nums">
                    <div className="bg-white border border-slate-200 rounded px-3 py-2">
                      <span className="text-slate-500 block font-sans">Sent</span>
                      <span className="font-bold text-emerald-700">{lastCampaignReport.sentCount}</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded px-3 py-2">
                      <span className="text-slate-500 block font-sans">Failed</span>
                      <span className="font-bold text-red-700">{lastCampaignReport.failedCount}</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded px-3 py-2">
                      <span className="text-slate-500 block font-sans">Skipped (Sent)</span>
                      <span className="font-bold text-slate-700">{lastCampaignReport.skippedAlreadySentCount}</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded px-3 py-2">
                      <span className="text-slate-500 block font-sans">Pending</span>
                      <span className="font-bold text-amber-700">{lastCampaignReport.pendingCount}</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded px-3 py-2">
                      <span className="text-slate-500 block font-sans">Invalid Email</span>
                      <span className="font-bold text-slate-700">{lastCampaignReport.invalidEmailCount}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Existing Enrolled Students Email Directory */}
          {credOverview && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: `All Enrolled (${credOverview.summary.totalEnrolledStudents})` },
                      { id: 'PENDING', label: `Pending (${credOverview.summary.pendingCount})` },
                      { id: 'SENT', label: `Sent (${credOverview.summary.sentCount})` },
                      { id: 'FAILED', label: `Failed (${credOverview.summary.failedCount})` },
                      { id: 'INVALID_EMAIL', label: `Invalid (${credOverview.summary.invalidEmailCount})` },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCredStatusFilter(t.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                        credStatusFilter === t.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={credSearch}
                    onChange={(e) => setCredSearch(e.target.value)}
                    placeholder="Search Roll No, Candidate ID, name, email..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-64"
                  />
                </div>
              </div>

              {filteredCredStudents.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No enrolled students match the selected filter.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 font-medium">Roll No &amp; Candidate ID</th>
                        <th className="px-4 py-3 font-medium">Student &amp; Registered Email</th>
                        <th className="px-4 py-3 font-medium">Course(s) &amp; Batch</th>
                        <th className="px-4 py-3 font-medium">Email Status</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCredStudents.map((stu) => (
                        <tr key={stu.user_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono">
                            <div className="font-bold text-blue-700">{stu.roll_number || '—'}</div>
                            {stu.candidate_id && (
                              <div className="text-slate-500">{stu.candidate_id}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{stu.full_name}</div>
                            <div className="text-slate-600">{stu.email || 'No email on record'}</div>
                            {stu.email_warning && (
                              <div className="text-amber-700 text-[11px] mt-0.5">{stu.email_warning}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 max-w-xs truncate" title={stu.enrolled_courses}>
                              {stu.enrolled_courses}
                            </div>
                            <div className="font-mono text-slate-500 text-[11px]">
                              {stu.batches ? `Batch ${stu.batches}` : '—'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div
                              className={`font-semibold ${
                                stu.delivery_status === 'SENT'
                                  ? 'text-emerald-700'
                                  : stu.delivery_status === 'PENDING'
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                              }`}
                            >
                              {stu.delivery_status.replace(/_/g, ' ')}
                              {stu.last_provider ? ` (${stu.last_provider})` : ''}
                            </div>
                            {stu.last_sent_at && (
                              <div className="text-slate-500 tabular-nums text-[11px]">
                                Sent: {formatDateTime(stu.last_sent_at)}
                              </div>
                            )}
                            {stu.delivery_status === 'FAILED' && stu.last_error && (
                              <div className="text-red-600 max-w-xs truncate text-[11px]" title={stu.last_error}>
                                {stu.last_error}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                            <button
                              type="button"
                              onClick={() => openTemplatePreview(stu.user_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                              title="Preview personalized email"
                            >
                              <Eye className="w-3 h-3" /> Preview
                            </button>
                            <button
                              type="button"
                              disabled={!stu.email_valid || sendingStudentId === stu.user_id || bulkSending}
                              onClick={() =>
                                handleSendSingleStudent(stu.user_id, stu.delivery_status === 'SENT')
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              {sendingStudentId === stu.user_id
                                ? 'Sending...'
                                : stu.delivery_status === 'SENT'
                                  ? 'Resend'
                                  : stu.delivery_status === 'FAILED'
                                    ? 'Retry'
                                    : 'Send Email'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Email Delivery Audit Log */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-slate-950">
                Email Delivery Audit Log ({emails.length})
              </h3>
              <span className="text-xs text-slate-500">All automated &amp; manual dispatches</span>
            </div>
            {emails.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No email logs recorded yet.</div>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-5 py-3 font-medium">Recipient</th>
                      <th className="px-5 py-3 font-medium">Event &amp; Subject</th>
                      <th className="px-5 py-3 font-medium">Delivery Status</th>
                      <th className="px-5 py-3 font-medium">Timestamp</th>
                      <th className="px-5 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {emails.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-xs">
                          <div className="font-semibold text-slate-900">{log.recipient_name || '—'}</div>
                          <div className="text-slate-500">{log.recipient_email}</div>
                        </td>
                        <td className="px-5 py-3 text-xs">
                          <div className="font-medium text-slate-900">{log.subject}</div>
                          <div className="text-slate-500 font-mono">
                            {log.event_type}
                            {log.provider ? ` · ${log.provider}` : ''}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs">
                          <span
                            className={`font-semibold ${
                              log.status === 'SENT'
                                ? 'text-emerald-700'
                                : log.status === 'NOT_CONFIGURED'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }`}
                          >
                            {log.status}
                          </span>
                          {log.error_message && (
                            <div className="text-slate-500 max-w-xs truncate" title={log.error_message}>
                              {log.error_message}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs tabular-nums text-slate-500">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              setFeedback(null);
                              const res = await apiRequest<{ result: { status: string; message: string } }>(
                                `/api/admin/emails/${log.id}/resend`,
                                { method: 'POST' }
                              );
                              setFeedback({
                                type: res.result.status === 'SENT' ? 'success' : 'error',
                                text: `${res.result.status}: ${res.result.message}`,
                              });
                              await loadSection();
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-200 rounded hover:bg-blue-50 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" /> Resend
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sandboxed HTML Email Template Preview Modal */}
          {previewModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono text-slate-500">
                      Preview for {previewModal.studentName} ({previewModal.rollNumber}) · {previewModal.email}
                    </div>
                    <h3 className="font-display font-bold text-base text-slate-950 mt-0.5">
                      Subject: {previewModal.subject}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewModal(null)}
                    className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewModal((prev) => (prev ? { ...prev, tab: 'html' } : null))}
                      className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
                        previewModal.tab === 'html' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Branded HTML Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewModal((prev) => (prev ? { ...prev, tab: 'text' } : null))}
                      className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
                        previewModal.tab === 'text' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Plain-Text Fallback
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Activation link below is a safe preview placeholder
                  </span>
                </div>

                <div className="flex-1 overflow-auto bg-slate-100 p-4">
                  {previewModal.tab === 'html' ? (
                    <iframe
                      title="AITM Student Login Email Preview"
                      srcDoc={previewModal.html}
                      sandbox=""
                      className="w-full h-[540px] bg-white border border-slate-200 rounded-lg"
                    />
                  ) : (
                    <pre className="p-5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 whitespace-pre-wrap">
                      {previewModal.text}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* REPORTS & INQUIRIES */}
      {section === 'reports' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-bold text-xl text-slate-950">Reports & Contact Inquiries</h2>
              <p className="text-sm text-slate-600">
                Real-time SQL reports, persistent enrollment sequence status, CSV export, and public inquiry inbox.
              </p>
            </div>
            {reportData && (
              <button
                type="button"
                onClick={() => exportCsv(reportData.courseSummary, 'aitm-course-report.csv')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Export Course CSV
              </button>
            )}
          </div>

          {reportData && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Persistent Enrollment Sequence</div>
                  <div className="mt-1 font-mono font-bold text-xl text-slate-950">
                    {reportData.sequence?.prefix || 'AITM'}
                    {reportData.sequence?.last_number || 0} (Next: {reportData.sequence?.prefix || 'AITM'}
                    {(reportData.sequence?.last_number || 0) + 1})
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Application Funnel</div>
                  <div className="mt-1 text-xs text-slate-800 space-y-0.5">
                    {reportData.applicationFunnel.length === 0
                      ? 'No applications yet'
                      : reportData.applicationFunnel.map((f) => (
                          <div key={f.status} className="flex justify-between font-mono">
                            <span>{f.status}</span>
                            <span>{f.count}</span>
                          </div>
                        ))}
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Email Delivery Summary</div>
                  <div className="mt-1 text-xs text-slate-800 space-y-0.5">
                    {reportData.emailDelivery.length === 0
                      ? 'No emails logged yet'
                      : reportData.emailDelivery.map((f) => (
                          <div key={f.status} className="flex justify-between font-mono">
                            <span>{f.status}</span>
                            <span>{f.count}</span>
                          </div>
                        ))}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h3 className="font-display font-semibold text-base text-slate-950">
                    Course-Wise Performance Report
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3 font-medium">Course</th>
                        <th className="px-5 py-3 font-medium text-right">Applications</th>
                        <th className="px-5 py-3 font-medium text-right">Enrolled</th>
                        <th className="px-5 py-3 font-medium text-right">Active</th>
                        <th className="px-5 py-3 font-medium text-right">Completed</th>
                        <th className="px-5 py-3 font-medium text-right">Resources</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportData.courseSummary.map((r) => (
                        <tr key={String(r.id)}>
                          <td className="px-5 py-3 font-medium text-slate-900">
                            {String(r.name)}{' '}
                            <span className="font-mono text-xs text-slate-400">({String(r.code)})</span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono tabular-nums">{String(r.total_applications || 0)}</td>
                          <td className="px-5 py-3 text-right font-mono tabular-nums">{String(r.total_enrolled || 0)}</td>
                          <td className="px-5 py-3 text-right font-mono tabular-nums text-blue-700">{String(r.active_count || 0)}</td>
                          <td className="px-5 py-3 text-right font-mono tabular-nums text-emerald-700">{String(r.completed_count || 0)}</td>
                          <td className="px-5 py-3 text-right font-mono tabular-nums">{String(r.total_resources || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display font-semibold text-base text-slate-950">
                Website Contact Inquiries ({inquiries.length})
              </h3>
            </div>
            {inquiries.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No inquiries submitted from the Contact Us form yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {inquiries.map((inq) => (
                  <div key={String(inq.id)} className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {String(inq.full_name)} · <span className="font-normal text-slate-600">{String(inq.subject)}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {String(inq.email)} {inq.phone ? `· ${String(inq.phone)}` : ''} ·{' '}
                        {formatDateTime(String(inq.created_at))}
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{String(inq.message)}</p>
                    </div>
                    <select
                      value={String(inq.status)}
                      onChange={async (e) => {
                        await apiRequest(`/api/admin/inquiries/${inq.id}`, {
                          method: 'PUT',
                          body: { status: e.target.value },
                        });
                        await loadSection();
                      }}
                      className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-300 rounded-md h-fit"
                    >
                      <option value="NEW">NEW</option>
                      <option value="RESPONDED">RESPONDED</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADMIN SETTINGS */}
      {section === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display font-bold text-lg text-slate-950 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-700" />
                Change Your Password
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setFeedback(null);
                  if (pwForm.new_password !== pwForm.confirm) {
                    setFeedback({ type: 'error', text: 'New passwords do not match.' });
                    return;
                  }
                  try {
                    await apiRequest('/api/auth/change-password', {
                      method: 'POST',
                      body: {
                        current_password: pwForm.current_password,
                        new_password: pwForm.new_password,
                      },
                    });
                    setPwForm({ current_password: '', new_password: '', confirm: '' });
                    setFeedback({ type: 'success', text: 'Your administrator password has been updated.' });
                  } catch (err) {
                    setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Update failed.' });
                  }
                }}
                className="space-y-3"
              >
                <input
                  type="password"
                  required
                  placeholder="Current Password"
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="New Password (min 8 chars)"
                  value={pwForm.new_password}
                  onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Confirm New Password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Update Password
                </button>
              </form>
            </div>

            {user?.role === 'SUPER_ADMIN' && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="font-display font-bold text-base text-slate-950">
                  Add Administrator Account (Super Admin Only)
                </h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setFeedback(null);
                    try {
                      await apiRequest('/api/admin/users', { method: 'POST', body: newAdminForm });
                      setNewAdminForm({
                        full_name: '',
                        email: '',
                        password: '',
                        role: 'ADMIN',
                        designation: 'Academic Administrator',
                        department: 'Admissions & LMS',
                      });
                      setFeedback({ type: 'success', text: 'New administrator account created.' });
                      await loadSection();
                    } catch (err) {
                      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed.' });
                    }
                  }}
                  className="space-y-3"
                >
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={newAdminForm.full_name}
                    onChange={(e) => setNewAdminForm({ ...newAdminForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Official Email"
                    value={newAdminForm.email}
                    onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="Initial Password"
                      value={newAdminForm.password}
                      onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <select
                      value={newAdminForm.role}
                      onChange={(e) => setNewAdminForm({ ...newAdminForm, role: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="SUPER_ADMIN">Super Admin</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    Create Admin User
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden h-fit">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display font-bold text-base text-slate-950">
                Authorized Administrators ({adminUsers.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {adminUsers.map((a) => (
                <div key={String(a.id)} className="px-6 py-4 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <div className="font-semibold text-slate-900">{String(a.full_name)}</div>
                    <div className="text-xs text-slate-500">
                      {String(a.email)} · <span className="font-mono text-blue-700">{String(a.role)}</span>
                    </div>
                  </div>
                  {user?.role === 'SUPER_ADMIN' && Number(a.id) !== user.id && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/users/${a.id}/status`, {
                          method: 'PUT',
                          body: { is_active: !Number(a.is_active) },
                        });
                        await loadSection();
                      }}
                      className="px-3 py-1 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      {Number(a.is_active) ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

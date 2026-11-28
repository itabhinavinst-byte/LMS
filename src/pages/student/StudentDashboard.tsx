import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  User,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSite } from '../../context/SiteContext';
import { useRealtime } from '../../context/RealtimeContext';
import { AitMLogo, SafeImage } from '../../components/BrandMark';
import {
  apiRequest,
  fetchAuthorizedBlob,
  formatDateShort,
  formatDateTime,
  formatFileSize,
} from '../../lib/api';
import type {
  AnnouncementRecord,
  AssignmentRecord,
  Course,
  CourseModule,
  EnrollmentRecord,
  LearningResource,
  MeetingRecord,
  NotificationRecord,
} from '../../types';

const STUDENT_NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'courses', label: 'My Courses', icon: BookOpen },
  { id: 'materials', label: 'Learning Materials', icon: FolderOpen },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'meetings', label: 'Meetings', icon: Calendar },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'password', label: 'Change Password', icon: KeyRound },
] as const;

interface StudentOverviewPayload {
  profile: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    must_change_password: number;
    enrollment_number: string;
    employee_code?: string;
    mobile: string;
    dob: string;
    gender: string;
    qualification: string;
    city: string;
    state: string;
    account_status: string;
  };
  enrollments: EnrollmentRecord[];
  recentAnnouncements: AnnouncementRecord[];
  upcomingMeetings: MeetingRecord[];
  availableDocuments: LearningResource[];
  unreadNotifications: number;
}

interface EnrolledCourseDetail {
  enrollment: EnrollmentRecord;
  course: Course;
  modules: CourseModule[];
  resources: LearningResource[];
  assignments: AssignmentRecord[];
  meetings: MeetingRecord[];
  announcements: AnnouncementRecord[];
}

export function StudentDashboard() {
  const { user, logout, refreshMe } = useAuth();
  const { settings } = useSite();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [overview, setOverview] = useState<StudentOverviewPayload | null>(null);
  const [materials, setMaterials] = useState<LearningResource[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const [activeCourseDetail, setActiveCourseDetail] = useState<EnrolledCourseDetail | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    url: string;
    mimeType: string;
    fileName: string;
  } | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    mobile: '',
    city: '',
    state: '',
    qualification: '',
  });

  // Change password form
  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [pwSaving, setPwSaving] = useState(false);

  // Assignment submission state
  const [submittingAssignment, setSubmittingAssignment] = useState<AssignmentRecord | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [ov, mat, asg, mtg, ann, ntf] = await Promise.all([
        apiRequest<StudentOverviewPayload>('/api/student/overview'),
        apiRequest<{ materials: LearningResource[] }>('/api/student/materials'),
        apiRequest<{ assignments: AssignmentRecord[] }>('/api/student/assignments'),
        apiRequest<{ meetings: MeetingRecord[] }>('/api/student/meetings'),
        apiRequest<{ announcements: AnnouncementRecord[] }>('/api/student/announcements'),
        apiRequest<{ notifications: NotificationRecord[] }>('/api/student/notifications'),
      ]);
      setOverview(ov);
      setMaterials(mat.materials);
      setAssignments(asg.assignments);
      setMeetings(mtg.meetings);
      setAnnouncements(ann.announcements);
      setNotifications(ntf.notifications);
      if (ov.profile) {
        setProfileForm({
          mobile: ov.profile.mobile || '',
          city: ov.profile.city || '',
          state: ov.profile.state || '',
          qualification: ov.profile.qualification || '',
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load dashboard.' });
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'STUDENT') {
      loadAll();
    }
  }, [user, loadAll]);

  useRealtime(
    [
      'courses:changed',
      'enrollments:changed',
      'resources:changed',
      'modules:changed',
      'announcements:changed',
      'meetings:changed',
      'assignments:changed',
      'notifications:new',
    ],
    () => {
      if (user?.role === 'STUDENT') {
        loadAll();
        if (activeCourseDetail) {
          openCourseWorkspace(activeCourseDetail.course.id);
        }
      }
    }
  );

  if (!user || user.role !== 'STUDENT') {
    return <Navigate to="/login" replace />;
  }

  const mustChangePassword = Boolean(user.must_change_password);

  const openCourseWorkspace = async (courseId: number) => {
    setFeedback(null);
    try {
      const detail = await apiRequest<EnrolledCourseDetail>(`/api/student/courses/${courseId}`);
      setActiveCourseDetail(detail);
      setActiveTab('courses');
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to open course.' });
    }
  };

  const handleViewDocument = async (res: LearningResource) => {
    setFeedback(null);
    try {
      const { blob, contentType } = await fetchAuthorizedBlob(`/api/resources/${res.id}/file`);
      const objectUrl = URL.createObjectURL(blob);
      setPreviewDoc({
        title: res.title,
        url: objectUrl,
        mimeType: contentType || res.mime_type,
        fileName: res.file_name || res.title,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to open document.' });
    }
  };

  const handleDownloadDocument = async (res: LearningResource) => {
    setFeedback(null);
    try {
      const { blob } = await fetchAuthorizedBlob(`/api/resources/${res.id}/file?download=1`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.file_name || res.title;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Download failed.' });
    }
  };

  const closePreview = () => {
    if (previewDoc) {
      URL.revokeObjectURL(previewDoc.url);
      setPreviewDoc(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (pwForm.new_password !== pwForm.confirm_password) {
      setFeedback({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    setPwSaving(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: {
          current_password: pwForm.current_password,
          new_password: pwForm.new_password,
        },
      });
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      await refreshMe();
      await loadAll();
      setFeedback({
        type: 'success',
        text: 'Password updated successfully. You now have full access to your Student Dashboard.',
      });
      setActiveTab('overview');
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to update password.' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingAssignment) return;
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('submission_text', submissionText);
      if (submissionFile) fd.append('file', submissionFile);
      await apiRequest(`/api/student/assignments/${submittingAssignment.id}/submit`, {
        method: 'POST',
        formData: fd,
      });
      setSubmittingAssignment(null);
      setSubmissionText('');
      setSubmissionFile(null);
      setFeedback({ type: 'success', text: 'Assignment submitted successfully.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Submission failed.' });
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const currentTab = activeTab;
  const currentNavLabel = STUDENT_NAV.find((n) => n.id === currentTab)?.label || 'Overview';
  const documentOnlyMaterials = materials.filter((m) => Boolean(m.file_name));

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Student Sidebar (10 items including Logout) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200 lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <AitMLogo
              logoUrl={settings?.logo_url}
              shortName={settings?.short_name || 'AITM'}
              className="h-8 w-8"
            />
            <span className="font-display font-bold text-slate-950 text-sm truncate">
              {settings?.short_name || 'AITM'} Student
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {STUDENT_NAV.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveCourseDetail(null);
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-blue-700 text-white cursor-pointer'
                    : 'text-slate-700 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-slate-500 truncate">
              <span>Student Portal</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-semibold text-slate-950">{currentNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {(overview?.unreadNotifications || 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 text-[10px] font-mono font-bold text-white bg-blue-700 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {overview?.unreadNotifications}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">Notifications</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest('/api/student/notifications/read-all', { method: 'PUT' });
                        await loadAll();
                      }}
                      className="text-xs text-blue-700 hover:underline cursor-pointer"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-3.5 text-xs ${n.is_read ? 'bg-white' : 'bg-blue-50/40'}`}
                        >
                          <div className="font-semibold text-slate-900">{n.title}</div>
                          <p className="mt-0.5 text-slate-600">{n.message}</p>
                          <div className="mt-1 text-[11px] text-slate-400">{formatDateTime(n.created_at)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-slate-900">{user.full_name}</div>
              <div className="text-[11px] font-mono text-blue-700">
                {overview?.profile?.enrollment_number || user.enrollment_number || user.username}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
          {mustChangePassword && currentTab !== 'password' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Security Reminder: Update Your Temporary Password</div>
                  <p className="text-xs mt-0.5 text-amber-900">
                    You are currently using your initial temporary enrollment password. We recommend setting a personal password.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('password')}
                className="px-3.5 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg shrink-0 cursor-pointer"
              >
                Change Password
              </button>
            </div>
          )}

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

          {/* 1. OVERVIEW */}
          {currentTab === 'overview' && overview && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono text-blue-700 font-semibold">
                    Enrollment Number: {overview.profile.enrollment_number}
                    {overview.profile.employee_code ? ` · Employee Code: ${overview.profile.employee_code}` : ''}
                    {' · '}Username: {overview.profile.username}
                  </div>
                  <h1 className="mt-1 font-display font-bold text-2xl text-slate-950">
                    Welcome, {overview.profile.full_name}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600">
                    Access your enrolled AITM programs, private course documents, assignments, and live classes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('courses')}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shrink-0 cursor-pointer"
                >
                  Open My Courses
                </button>
              </div>

              {/* Enrolled Course Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {overview.enrollments.map((enr) => (
                  <div key={enr.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-mono text-slate-500">
                          {enr.enrollment_number} · {enr.course_duration_snapshot}
                          {enr.enrollment_type ? ` · ${enr.enrollment_type}` : ''}
                        </div>
                        <h2 className="mt-0.5 font-display font-bold text-lg text-slate-950">
                          {enr.course_name_snapshot}
                        </h2>
                      </div>
                      <span className="text-xs font-semibold text-blue-700">{enr.status}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Enrolled: {formatDateShort(enr.enrollment_date)} · Batch: {enr.batch_name}
                      {enr.payment_status ? ` · ${enr.payment_status}` : ''}
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600">Course Progress</span>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {enr.progress_percent}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-700 rounded-full"
                          style={{ width: `${enr.progress_percent}%` }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCourseWorkspace(enr.course_id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                      View Course Modules & Materials
                    </button>
                  </div>
                ))}
              </div>

              {/* Recent Announcements, Meetings, Documents */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-display font-semibold text-sm text-slate-950">Recent Announcements</h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('announcements')}
                      className="text-xs text-blue-700 hover:underline cursor-pointer"
                    >
                      All
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {overview.recentAnnouncements.length === 0 ? (
                      <p className="p-5 text-xs text-slate-500">No announcements yet.</p>
                    ) : (
                      overview.recentAnnouncements.map((a) => (
                        <div key={a.id} className="p-4 text-xs">
                          <div className="font-semibold text-slate-900">{a.title}</div>
                          <p className="mt-1 text-slate-600 line-clamp-2">{a.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-display font-semibold text-sm text-slate-950">Upcoming Meetings</h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('meetings')}
                      className="text-xs text-blue-700 hover:underline cursor-pointer"
                    >
                      All
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {overview.upcomingMeetings.length === 0 ? (
                      <p className="p-5 text-xs text-slate-500">No upcoming meetings scheduled.</p>
                    ) : (
                      overview.upcomingMeetings.map((m) => (
                        <div key={m.id} className="p-4 text-xs">
                          <div className="font-semibold text-slate-900">{m.title}</div>
                          <div className="mt-1 text-slate-500 font-mono">{formatDateTime(m.scheduled_at)}</div>
                          <a
                            href={m.meeting_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1 text-blue-700 font-semibold hover:underline"
                          >
                            Join {m.platform} <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-display font-semibold text-sm text-slate-950">Available Documents</h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('documents')}
                      className="text-xs text-blue-700 hover:underline cursor-pointer"
                    >
                      All
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {overview.availableDocuments.length === 0 ? (
                      <p className="p-5 text-xs text-slate-500">No materials uploaded yet.</p>
                    ) : (
                      overview.availableDocuments.map((d) => (
                        <div key={d.id} className="p-4 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{d.title}</div>
                            <div className="text-slate-500 truncate">{d.course_name}</div>
                          </div>
                          {d.file_name ? (
                            <button
                              type="button"
                              onClick={() => handleDownloadDocument(d)}
                              className="p-1.5 text-blue-700 hover:bg-blue-50 rounded cursor-pointer shrink-0"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          ) : d.external_url ? (
                            <a
                              href={d.external_url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-blue-700 hover:bg-blue-50 rounded shrink-0"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. MY COURSES + COURSE WORKSPACE */}
          {currentTab === 'courses' && (
            activeCourseDetail ? (
              <div className="space-y-6">
                <button
                  type="button"
                  onClick={() => setActiveCourseDetail(null)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to My Courses
                </button>

                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="text-xs font-mono text-blue-700">
                    {activeCourseDetail.enrollment.enrollment_number} ·{' '}
                    {activeCourseDetail.enrollment.course_duration_snapshot} ·{' '}
                    {activeCourseDetail.enrollment.status}
                  </div>
                  <h2 className="mt-1 font-display font-bold text-2xl text-slate-950">
                    {activeCourseDetail.course?.name || activeCourseDetail.enrollment.course_name_snapshot}
                  </h2>
                  {activeCourseDetail.course?.short_description && (
                    <p className="mt-2 text-sm text-slate-600">{activeCourseDetail.course.short_description}</p>
                  )}
                </div>

                {/* Course Modules & Materials */}
                <div className="space-y-4">
                  <h3 className="font-display font-bold text-lg text-slate-950">
                    Course Modules & Study Materials
                  </h3>
                  {activeCourseDetail.modules.map((mod) => {
                    const modDocs = activeCourseDetail.resources.filter((r) => r.module_id === mod.id);
                    return (
                      <div key={mod.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                          <h4 className="font-display font-semibold text-sm text-slate-950">{mod.title}</h4>
                          {mod.description && <p className="text-xs text-slate-500 mt-0.5">{mod.description}</p>}
                        </div>
                        <div className="divide-y divide-slate-100">
                          {modDocs.length === 0 ? (
                            <p className="px-5 py-4 text-xs text-slate-500">No files in this module yet.</p>
                          ) : (
                            modDocs.map((res) => (
                              <ResourceRow
                                key={res.id}
                                res={res}
                                onView={handleViewDocument}
                                onDownload={handleDownloadDocument}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {activeCourseDetail.resources.filter((r) => !r.module_id).length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                        <h4 className="font-display font-semibold text-sm text-slate-950">
                          General Course Documents
                        </h4>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {activeCourseDetail.resources
                          .filter((r) => !r.module_id)
                          .map((res) => (
                            <ResourceRow
                              key={res.id}
                              res={res}
                              onView={handleViewDocument}
                              onDownload={handleDownloadDocument}
                            />
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display font-bold text-xl text-slate-950">My Enrolled Courses</h2>
                  <p className="text-sm text-slate-600">
                    You only see programs in which your enrollment has been officially approved by AITM Administration.
                  </p>
                </div>

                {!overview || overview.enrollments.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                    No active course enrollments found.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {overview.enrollments.map((enr) => (
                      <div
                        key={enr.id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
                      >
                        <div className="aspect-[16/9] bg-slate-100 border-b border-slate-100">
                          <SafeImage
                            src={enr.image_url}
                            alt={enr.course_name_snapshot}
                            fallbackTitle={enr.course_name_snapshot}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-6 flex-1 flex flex-col">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-mono text-blue-700 font-semibold">
                              {enr.enrollment_number}
                            </span>
                            <span>
                              {enr.course_duration_snapshot}
                              {enr.enrollment_type ? ` · ${enr.enrollment_type}` : ''}
                              {enr.payment_status ? ` · ${enr.payment_status}` : ''} · {enr.status}
                            </span>
                          </div>
                          <h3 className="mt-1.5 font-display font-bold text-lg text-slate-950">
                            {enr.course_name_snapshot}
                          </h3>
                          {enr.short_description && (
                            <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">{enr.short_description}</p>
                          )}
                          <div className="mt-4">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-500">Progress</span>
                              <span className="font-mono font-semibold text-slate-900">
                                {enr.progress_percent}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-700 rounded-full"
                                style={{ width: `${enr.progress_percent}%` }}
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openCourseWorkspace(enr.course_id)}
                            className="mt-5 w-full py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                          >
                            View Course
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {/* 3. LEARNING MATERIALS */}
          {currentTab === 'materials' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-950">Learning Materials</h2>
                <p className="text-sm text-slate-600">
                  All study documents, lecture slides, notes, and video links assigned to your enrolled courses.
                </p>
              </div>
              {materials.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  No learning materials have been published for your enrolled courses yet.
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {materials.map((res) => (
                    <ResourceRow
                      key={res.id}
                      res={res}
                      showCourse
                      onView={handleViewDocument}
                      onDownload={handleDownloadDocument}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. DOCUMENTS */}
          {currentTab === 'documents' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-950">Course Documents</h2>
                <p className="text-sm text-slate-600">
                  Authorized private PDFs, notes, spreadsheets, and reference files for your courses.
                </p>
              </div>
              {documentOnlyMaterials.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  No downloadable course files available yet.
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {documentOnlyMaterials.map((res) => (
                    <ResourceRow
                      key={res.id}
                      res={res}
                      showCourse
                      onView={handleViewDocument}
                      onDownload={handleDownloadDocument}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. ASSIGNMENTS */}
          {currentTab === 'assignments' && (
            <div className="space-y-5">
              <h2 className="font-display font-bold text-xl text-slate-950">Course Assignments</h2>
              {assignments.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  No assignments assigned to your courses yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {assignments.map((a) => (
                    <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs text-slate-500">
                            <span className="font-semibold text-blue-700">{a.course_name}</span>
                            {a.due_date ? ` · Due ${formatDateShort(a.due_date)}` : ''} · Max {a.max_score} pts
                          </div>
                          <h3 className="mt-1 font-display font-bold text-base text-slate-950">{a.title}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          {a.submission_status === 'GRADED' ? (
                            <span className="text-xs font-mono font-semibold text-emerald-700">
                              Graded: {a.score}/{a.max_score}
                            </span>
                          ) : a.submission_status === 'SUBMITTED' ? (
                            <span className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setSubmittingAssignment(a);
                              setSubmissionText(a.submission_text || '');
                              setSubmissionFile(null);
                            }}
                            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                          >
                            {a.submission_id ? 'Update Submission' : 'Submit Work'}
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 whitespace-pre-line">{a.description}</p>
                      {a.feedback && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                          <span className="font-semibold">Instructor Feedback:</span> {a.feedback}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. MEETINGS */}
          {currentTab === 'meetings' && (
            <div className="space-y-5">
              <h2 className="font-display font-bold text-xl text-slate-950">Scheduled Meetings & Live Classes</h2>
              {meetings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  No live sessions scheduled for your courses yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {meetings.map((m) => (
                    <div
                      key={m.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="text-xs text-slate-500">
                          <span className="font-semibold text-blue-700">{m.course_name}</span> · {m.batch_name} ·{' '}
                          {m.platform}
                        </div>
                        <h3 className="mt-1 font-display font-semibold text-base text-slate-950">{m.title}</h3>
                        {m.description && <p className="mt-1 text-xs text-slate-600">{m.description}</p>}
                        <div className="mt-2 text-xs font-mono text-slate-700">
                          {formatDateTime(m.scheduled_at)} · {m.duration_minutes} minutes
                        </div>
                      </div>
                      <a
                        href={m.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Join Session
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 7. ANNOUNCEMENTS */}
          {currentTab === 'announcements' && (
            <div className="space-y-5">
              <h2 className="font-display font-bold text-xl text-slate-950">Announcements</h2>
              {announcements.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  No announcements available.
                </div>
              ) : (
                <div className="space-y-4">
                  {announcements.map((a) => (
                    <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-6">
                      <div className="text-xs text-slate-500">
                        <span className="font-semibold text-blue-700">{a.priority}</span> ·{' '}
                        {a.course_name || 'All AITM Students'} · {formatDateTime(a.created_at)}
                      </div>
                      <h3 className="mt-1.5 font-display font-bold text-lg text-slate-950">{a.title}</h3>
                      <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {a.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 8. MY PROFILE */}
          {currentTab === 'profile' && overview && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-5">
              <h2 className="font-display font-bold text-xl text-slate-950">My Student Profile</h2>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pb-5 border-b border-slate-200">
                <div>
                  <dt className="text-xs text-slate-500">Full Name</dt>
                  <dd className="font-semibold text-slate-950">{overview.profile.full_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Enrollment Number</dt>
                  <dd className="font-mono font-semibold text-blue-700">
                    {overview.profile.enrollment_number}
                  </dd>
                </div>
                {overview.profile.employee_code && (
                  <div>
                    <dt className="text-xs text-slate-500">Employee Code</dt>
                    <dd className="font-mono font-semibold text-slate-900">
                      {overview.profile.employee_code}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-500">Portal Username</dt>
                  <dd className="font-mono text-slate-800">{overview.profile.username}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Registered Email</dt>
                  <dd className="text-slate-800">{overview.profile.email}</dd>
                </div>
              </dl>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setFeedback(null);
                  try {
                    await apiRequest('/api/student/profile', { method: 'PUT', body: profileForm });
                    setFeedback({ type: 'success', text: 'Profile updated successfully.' });
                    await loadAll();
                  } catch (err) {
                    setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Update failed.' });
                  }
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number</label>
                    <input
                      type="tel"
                      value={profileForm.mobile}
                      onChange={(e) => setProfileForm({ ...profileForm, mobile: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Qualification</label>
                    <input
                      type="text"
                      value={profileForm.qualification}
                      onChange={(e) => setProfileForm({ ...profileForm, qualification: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                    <input
                      type="text"
                      value={profileForm.city}
                      onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                    <input
                      type="text"
                      value={profileForm.state}
                      onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  Save Profile Changes
                </button>
              </form>
            </div>
          )}

          {/* 9. CHANGE PASSWORD */}
          {currentTab === 'password' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950">Change Password</h2>
              <p className="text-xs text-slate-600">
                Choose a strong password (at least 8 characters) to protect your AITM Student Portal account.
              </p>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current Password (or Initial Temporary Password)
                  </label>
                  <input
                    type="password"
                    required
                    value={pwForm.current_password}
                    onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password (min 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={pwForm.new_password}
                    onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={pwForm.confirm_password}
                    onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {pwSaving ? 'Updating Password...' : 'Update Password'}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Secure Inline Document Viewer Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-display font-bold text-sm text-slate-950 truncate">{previewDoc.title}</div>
                <div className="text-xs text-slate-500 truncate">{previewDoc.fileName}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewDoc.url}
                  download={previewDoc.fileName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <button
                  type="button"
                  onClick={closePreview}
                  className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-auto">
              {previewDoc.mimeType.includes('pdf') ? (
                <iframe src={previewDoc.url} title={previewDoc.title} className="w-full h-full border-0" />
              ) : previewDoc.mimeType.startsWith('image/') ? (
                <img src={previewDoc.url} alt={previewDoc.title} className="max-w-full max-h-full object-contain" />
              ) : previewDoc.mimeType.startsWith('video/') ? (
                <video src={previewDoc.url} controls className="max-w-full max-h-full" />
              ) : (
                <div className="text-center p-8 space-y-3">
                  <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-sm text-slate-700">
                    Inline preview is not supported for this file format ({previewDoc.mimeType}).
                  </p>
                  <a
                    href={previewDoc.url}
                    download={previewDoc.fileName}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
                  >
                    <Download className="w-3.5 h-3.5" /> Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assignment Submission Modal */}
      {submittingAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-slate-950">
                Submit — {submittingAssignment.title}
              </h3>
              <button
                type="button"
                onClick={() => setSubmittingAssignment(null)}
                className="p-1 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitAssignment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Your Answer / Notes</label>
                <textarea
                  rows={4}
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  placeholder="Write your response or paste project repository link..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Attach File (Optional — PDF, DOC, ZIP, Images)
                </label>
                <input
                  type="file"
                  onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100"
                />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSubmittingAssignment(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  Submit Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceRow({
  res,
  showCourse,
  onView,
  onDownload,
}: {
  res: LearningResource;
  showCourse?: boolean;
  onView: (r: LearningResource) => void;
  onDownload: (r: LearningResource) => void;
}) {
  return (
    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        {res.resource_type === 'VIDEO_LINK' ? (
          <Video className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
        ) : (
          <FileText className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
        )}
        <div className="min-w-0">
          <div className="font-semibold text-sm text-slate-900">{res.title}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {showCourse && res.course_name ? `${res.course_name} · ` : ''}
            {res.module_title ? `${res.module_title} · ` : ''}
            {res.file_name ? `${res.file_name} (${formatFileSize(res.file_size)})` : 'Video / External Link'}
          </div>
          {res.description && <p className="text-xs text-slate-600 mt-1">{res.description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {res.file_name && (
          <>
            <button
              type="button"
              onClick={() => onView(res)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" /> View
            </button>
            <button
              type="button"
              onClick={() => onDownload(res)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          </>
        )}
        {res.external_url && (
          <a
            href={res.external_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {res.resource_type === 'VIDEO_LINK' ? 'Watch Video' : 'Open Link'}
          </a>
        )}
      </div>
    </div>
  );
}

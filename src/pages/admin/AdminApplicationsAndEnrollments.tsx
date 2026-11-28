import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Plus, Search, UserCheck, UserX, X, XCircle } from 'lucide-react';
import { apiRequest, formatDateShort, formatDateTime } from '../../lib/api';
import { useRealtime } from '../../context/RealtimeContext';
import type { ApplicationRecord, Course, EnrollmentRecord } from '../../types';

interface StudentDirectoryRow {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: number;
  must_change_password: number;
  enrollment_number: string;
  employee_code?: string;
  candidate_id?: string;
  mobile: string;
  city: string;
  state: string;
  qualification: string;
  account_status: string;
  course_count: number;
  enrolled_courses: string;
  created_at: string;
}

export function AdminApplicationsAndEnrollments({
  section,
}: {
  section: 'applications' | 'students' | 'enrollments';
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [students, setStudents] = useState<StudentDirectoryRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);

  const [courseFilter, setCourseFilter] = useState('0');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [approvalBanner, setApprovalBanner] = useState<{
    studentName: string;
    courseName: string;
    enrollmentNumber: string;
    username: string;
    temporaryPassword: string | null;
    emailStatus: string;
    emailMessage: string;
  } | null>(null);

  const [selectedApp, setSelectedApp] = useState<ApplicationRecord | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [batchDraft, setBatchDraft] = useState('Batch 2026');
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Manual Direct Enrollment Modal
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    full_name: '',
    email: '',
    employee_code: '',
    mobile: '',
    qualification: '',
    city: '',
    state: 'Maharashtra',
    course_id: '',
    batch_name: 'Batch 2026',
    enrollment_type: 'Regular',
    payment_status: 'Pending',
    send_email: true,
  });

  const loadData = useCallback(async () => {
    try {
      const cRes = await apiRequest<{ courses: Course[] }>('/api/admin/courses');
      setCourses(cRes.courses);

      const q = new URLSearchParams();
      if (courseFilter !== '0') q.set('courseId', courseFilter);
      if (statusFilter !== 'ALL') q.set('status', statusFilter);
      if (search.trim()) q.set('search', search.trim());

      if (section === 'applications') {
        const res = await apiRequest<{ applications: ApplicationRecord[] }>(
          `/api/admin/applications?${q.toString()}`
        );
        setApplications(res.applications);
      } else if (section === 'students') {
        const res = await apiRequest<{ students: StudentDirectoryRow[] }>(
          `/api/admin/students?${q.toString()}`
        );
        setStudents(res.students);
      } else {
        const res = await apiRequest<{ enrollments: EnrollmentRecord[] }>(
          `/api/admin/enrollments?${q.toString()}`
        );
        setEnrollments(res.enrollments);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load records.' });
    } finally {
      setLoading(false);
    }
  }, [section, courseFilter, statusFilter, search]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  useRealtime(['applications:changed', 'enrollments:changed', 'students:changed', 'courses:changed'], () => {
    loadData();
  });

  const handleApproveApplication = async (app: ApplicationRecord) => {
    setProcessingId(app.id);
    setFeedback(null);
    setApprovalBanner(null);
    try {
      const res = await apiRequest<{
        enrollment: { enrollment_number: string; student_name: string; course_name: string };
        credentials: { username: string; isNewAccount: boolean; temporaryPassword: string | null };
        email: { status: string; message: string };
      }>(`/api/admin/applications/${app.id}/approve`, {
        method: 'POST',
        body: { admin_notes: notesDraft || app.admin_notes, batch_name: batchDraft },
      });

      setApprovalBanner({
        studentName: res.enrollment.student_name,
        courseName: res.enrollment.course_name,
        enrollmentNumber: res.enrollment.enrollment_number,
        username: res.credentials.username,
        temporaryPassword: res.credentials.temporaryPassword,
        emailStatus: res.email.status,
        emailMessage: res.email.message,
      });
      setSelectedApp(null);
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Approval failed.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectApplication = async (app: ApplicationRecord) => {
    setProcessingId(app.id);
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/applications/${app.id}`, {
        method: 'PUT',
        body: { status: 'REJECTED', admin_notes: notesDraft || app.admin_notes },
      });
      setSelectedApp(null);
      setFeedback({ type: 'success', text: `Application ${app.application_code} marked as Rejected.` });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Rejection failed.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaveNotes = async (app: ApplicationRecord) => {
    try {
      await apiRequest(`/api/admin/applications/${app.id}`, {
        method: 'PUT',
        body: { admin_notes: notesDraft },
      });
      setFeedback({ type: 'success', text: 'Admin notes saved.' });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to save notes.' });
    }
  };

  const handleToggleStudentActive = async (s: StudentDirectoryRow) => {
    try {
      await apiRequest(`/api/admin/students/${s.id}`, {
        method: 'PUT',
        body: { is_active: !s.is_active },
      });
      setFeedback({
        type: 'success',
        text: `Student ${s.full_name} account ${s.is_active ? 'suspended' : 'reactivated'}.`,
      });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Update failed.' });
    }
  };

  const handleResetTempPassword = async (s: StudentDirectoryRow) => {
    if (!window.confirm(`Reset password for ${s.full_name} back to their enrollment number (${s.enrollment_number})?`)) {
      return;
    }
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/students/${s.id}/reset-temp-password`, {
        method: 'POST',
      });
      setFeedback({ type: 'success', text: res.message });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Reset failed.' });
    }
  };

  const handleUpdateEnrollment = async (
    enr: EnrollmentRecord,
    updates: { status?: string; progress_percent?: number }
  ) => {
    try {
      await apiRequest(`/api/admin/enrollments/${enr.id}`, {
        method: 'PUT',
        body: updates,
      });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Update failed.' });
    }
  };

  const handleManualEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setApprovalBanner(null);
    try {
      const res = await apiRequest<{
        enrollment: {
          enrollmentNumber: string;
          studentName: string;
          courseName: string;
          username: string;
          temporaryPassword: string | null;
        };
        email: { status: string; message: string };
      }>('/api/admin/enrollments', {
        method: 'POST',
        body: { ...manualForm, course_id: Number(manualForm.course_id) },
      });
      setManualOpen(false);
      setManualForm({
        full_name: '',
        email: '',
        employee_code: '',
        mobile: '',
        qualification: '',
        city: '',
        state: 'Maharashtra',
        course_id: '',
        batch_name: 'Batch 2026',
        enrollment_type: 'Regular',
        payment_status: 'Pending',
        send_email: true,
      });
      setApprovalBanner({
        studentName: res.enrollment.studentName,
        courseName: res.enrollment.courseName,
        enrollmentNumber: res.enrollment.enrollmentNumber,
        username: res.enrollment.username,
        temporaryPassword: res.enrollment.temporaryPassword,
        emailStatus: res.email.status,
        emailMessage: res.email.message,
      });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Manual enrollment failed.' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-950">
            {section === 'applications'
              ? 'Student Applications'
              : section === 'students'
                ? 'Student Directory'
                : 'Enrollment Management'}
          </h2>
          <p className="text-sm text-slate-600">
            {section === 'applications'
              ? 'Review pending admission applications, add notes, reject, or approve to automatically generate AITM enrollment numbers and student credentials.'
              : section === 'students'
                ? 'Filter enrolled students by course, manage account access, or reset temporary passwords.'
                : 'Track all course enrollments, progress percentages, batch assignments, and completion status.'}
          </p>
        </div>

        {section === 'enrollments' && (
          <button
            type="button"
            onClick={() => {
              setManualForm((prev) => ({
                ...prev,
                course_id: courses[0] ? String(courses[0].id) : '',
              }));
              setManualOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Direct Enroll Student
          </button>
        )}
      </div>

      {/* Generated Credentials & Email Confirmation Banner */}
      {approvalBanner && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              Enrollment Activated for {approvalBanner.studentName} ({approvalBanner.courseName})
            </div>
            <button
              type="button"
              onClick={() => setApprovalBanner(null)}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div className="bg-white border border-emerald-200 rounded-lg p-3">
              <div className="text-slate-500">Generated Enrollment Number</div>
              <div className="mt-0.5 font-mono font-bold text-slate-950 text-sm">
                {approvalBanner.enrollmentNumber}
              </div>
            </div>
            <div className="bg-white border border-emerald-200 rounded-lg p-3">
              <div className="text-slate-500">Student Login Username</div>
              <div className="mt-0.5 font-mono font-bold text-slate-950 text-sm">
                {approvalBanner.username}
              </div>
            </div>
            <div className="bg-white border border-emerald-200 rounded-lg p-3">
              <div className="text-slate-500">Initial Temporary Password</div>
              <div className="mt-0.5 font-mono font-bold text-slate-950 text-sm">
                {approvalBanner.temporaryPassword || 'Existing student password preserved'}
              </div>
            </div>
          </div>
          <p className="text-xs text-emerald-900">
            Welcome Email Status:{' '}
            <span className="font-mono font-semibold">{approvalBanner.emailStatus}</span> —{' '}
            {approvalBanner.emailMessage}
          </p>
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

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, enrollment no., or code..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
        >
          <option value="0">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {section !== 'students' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          >
            <option value="ALL">All Statuses</option>
            {section === 'applications' ? (
              <>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </>
            ) : (
              <>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="DROPPED">Dropped</option>
                <option value="SUSPENDED">Suspended</option>
              </>
            )}
          </select>
        )}
      </div>

      {/* SECTION TABLE */}
      {loading ? (
        <div className="p-8 text-sm text-slate-500">Loading records...</div>
      ) : section === 'applications' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {applications.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No matching applications found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-medium">App ID</th>
                    <th className="px-5 py-3 font-medium">Applicant</th>
                    <th className="px-5 py-3 font-medium">Course</th>
                    <th className="px-5 py-3 font-medium">Location & Qual.</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Submitted</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applications.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{a.application_code}</td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{a.full_name}</div>
                        <div className="text-xs text-slate-500">
                          {a.email} · {a.mobile}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-medium text-slate-800">{a.course_name}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <div>
                          {a.city}, {a.state}
                        </div>
                        <div className="text-slate-400">{a.qualification}</div>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <span
                          className={`font-semibold ${
                            a.status === 'PENDING'
                              ? 'text-amber-700'
                              : a.status === 'APPROVED'
                                ? 'text-emerald-700'
                                : 'text-red-700'
                          }`}
                        >
                          {a.status}
                        </span>
                        {a.enrollment_number && (
                          <div className="font-mono text-blue-700">{a.enrollment_number}</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs tabular-nums text-slate-500">
                        {formatDateShort(a.created_at)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedApp(a);
                            setNotesDraft(a.admin_notes || '');
                            setBatchDraft('Batch 2026');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                        >
                          {a.status === 'PENDING' ? 'Review & Decide' : 'View Details'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : section === 'students' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {students.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No enrolled students yet. Approve a pending application to create a student account.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-medium">Enrollment No.</th>
                    <th className="px-5 py-3 font-medium">Candidate / Emp ID</th>
                    <th className="px-5 py-3 font-medium">Student</th>
                    <th className="px-5 py-3 font-medium">Username</th>
                    <th className="px-5 py-3 font-medium">Enrolled Courses</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-blue-700 tabular-nums">
                        {s.enrollment_number || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        {s.candidate_id || s.employee_code || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{s.full_name}</div>
                        <div className="text-xs text-slate-500">
                          {s.email} {s.mobile ? `· ${s.mobile}` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{s.username}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-700 max-w-xs truncate">
                        {s.enrolled_courses || 'None'}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <span className={s.is_active ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                          {s.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleResetTempPassword(s)}
                            title="Reset to Temporary Enrollment Password"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Reset PW
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStudentActive(s)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                          >
                            {s.is_active ? (
                              <>
                                <UserX className="w-3.5 h-3.5 text-red-600" /> Suspend
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5 text-emerald-600" /> Activate
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {enrollments.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No enrollment records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-medium">Enrollment No.</th>
                    <th className="px-5 py-3 font-medium">Candidate / Emp ID</th>
                    <th className="px-5 py-3 font-medium">Student</th>
                    <th className="px-5 py-3 font-medium">Course</th>
                    <th className="px-5 py-3 font-medium">Type & Payment</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Progress</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrollments.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-blue-700 tabular-nums">
                        {e.enrollment_number}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        {e.candidate_id || e.candidate_id_snapshot || e.employee_code || e.employee_code_snapshot || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{e.student_name_snapshot}</div>
                        <div className="text-xs text-slate-500">{e.student_email_snapshot}</div>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <div className="font-medium text-slate-900">{e.course_name_snapshot}</div>
                        <div className="text-slate-500">
                          {e.course_duration_snapshot} · {e.batch_name}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <div className="font-semibold text-slate-900">{e.enrollment_type || 'Regular'}</div>
                        <div className="text-slate-500">{e.payment_status || 'Pending'}</div>
                      </td>
                      <td className="px-5 py-3.5 text-xs tabular-nums text-slate-600">
                        {formatDateShort(e.enrollment_date)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            defaultValue={e.progress_percent}
                            onBlur={(ev) =>
                              handleUpdateEnrollment(e, { progress_percent: Number(ev.target.value) })
                            }
                            className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                          />
                          <span className="text-xs text-slate-500">%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <select
                          value={e.status}
                          onChange={(ev) => handleUpdateEnrollment(e, { status: ev.target.value })}
                          className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-300 rounded-md"
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="COMPLETED">COMPLETED</option>
                          <option value="DROPPED">DROPPED</option>
                          <option value="SUSPENDED">SUSPENDED</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Application Review Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-950">
                  Application Review — {selectedApp.application_code}
                </h3>
                <p className="text-xs text-slate-500">
                  Submitted {formatDateTime(selectedApp.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApp(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Full Name</dt>
                  <dd className="font-semibold text-slate-900">{selectedApp.full_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Selected Course</dt>
                  <dd className="font-semibold text-blue-700">{selectedApp.course_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Email Address</dt>
                  <dd className="text-slate-800">{selectedApp.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Mobile Number</dt>
                  <dd className="font-mono text-slate-800">{selectedApp.mobile}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">DOB & Gender</dt>
                  <dd className="text-slate-800">
                    {selectedApp.dob} · {selectedApp.gender}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Qualification</dt>
                  <dd className="text-slate-800">{selectedApp.qualification}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">City & State</dt>
                  <dd className="text-slate-800">
                    {selectedApp.city}, {selectedApp.state}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Status</dt>
                  <dd className="font-semibold text-slate-900">{selectedApp.status}</dd>
                </div>
              </dl>

              {selectedApp.additional_info && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                  <span className="font-semibold block mb-1">Applicant Note:</span>
                  {selectedApp.additional_info}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Notes</label>
                  <input
                    type="text"
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Verification remarks..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                {selectedApp.status === 'PENDING' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Assign Batch</label>
                    <input
                      type="text"
                      value={batchDraft}
                      onChange={(e) => setBatchDraft(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveNotes(selectedApp)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Save Notes
                </button>

                {selectedApp.status === 'PENDING' && (
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={processingId === selectedApp.id}
                      onClick={() => handleRejectApplication(selectedApp)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={processingId === selectedApp.id}
                      onClick={() => handleApproveApplication(selectedApp)}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {processingId === selectedApp.id
                        ? 'Enrolling...'
                        : 'Approve & Generate Enrollment'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Direct Enrollment Modal */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-950">Direct Student Enrollment</h3>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleManualEnroll} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Course *</label>
                <select
                  required
                  value={manualForm.course_id}
                  onChange={(e) => setManualForm({ ...manualForm, course_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={manualForm.full_name}
                    onChange={(e) => setManualForm({ ...manualForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={manualForm.email}
                    onChange={(e) => setManualForm({ ...manualForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Employee Code</label>
                  <input
                    type="text"
                    value={manualForm.employee_code}
                    onChange={(e) => setManualForm({ ...manualForm, employee_code: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile</label>
                  <input
                    type="tel"
                    value={manualForm.mobile}
                    onChange={(e) => setManualForm({ ...manualForm, mobile: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Name</label>
                  <input
                    type="text"
                    value={manualForm.batch_name}
                    onChange={(e) => setManualForm({ ...manualForm, batch_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Enrollment Type</label>
                  <select
                    value={manualForm.enrollment_type}
                    onChange={(e) => setManualForm({ ...manualForm, enrollment_type: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Regular">Regular</option>
                    <option value="Demo">Demo</option>
                    <option value="Sponsored">Sponsored</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Status</label>
                  <select
                    value={manualForm.payment_status}
                    onChange={(e) => setManualForm({ ...manualForm, payment_status: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Free / No Payment">Free / No Payment</option>
                    <option value="Paid">Paid</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualForm.send_email}
                  onChange={(e) => setManualForm({ ...manualForm, send_email: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Send welcome email with login credentials
              </label>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setManualOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  {manualForm.send_email ? 'Create Enrollment & Send Email' : 'Create Enrollment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

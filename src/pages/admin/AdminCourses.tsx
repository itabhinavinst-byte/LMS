import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, formatDateShort } from '../../lib/api';
import { useRealtime } from '../../context/RealtimeContext';
import { SafeImage } from '../../components/BrandMark';
import type { BatchRecord, Course } from '../../types';

interface CourseStudentRow {
  enrollment_id: number;
  enrollment_number: string;
  employee_code: string;
  candidate_id: string;
  batch_id: number | null;
  batch_code_snapshot: string;
  sdms_enrolment_number: string;
  scheme_name: string;
  candidate_course_fee: string;
  fee_paid_by: string;
  tc_id: string;
  tc_name: string;
  assessment_mode: string;
  assessment_from_date: string;
  assessment_to_date: string;
  certificate_name: string;
  placement_type: string;
  enrollment_type: string;
  payment_status: string;
  enrollment_date: string;
  course_status: string;
  progress_percent: number;
  batch_name: string;
  student_user_id: number;
  student_name: string;
  username: string;
  email: string;
  mobile: string;
  country_code?: string;
  salutation?: string;
  dob?: string;
  gender?: string;
  marital_status?: string;
  fathers_name?: string;
  mothers_name?: string;
  guardians_name?: string;
  religion?: string;
  category?: string;
  disability?: string;
  domicile_state?: string;
  domicile_district?: string;
  id_type?: string;
  qualification?: string;
  city?: string;
  state?: string;
  permanent_address?: string;
  permanent_district?: string;
  permanent_pincode?: string;
  permanent_tehsil?: string;
  comm_same_as_permanent?: string;
  comm_state?: string;
  comm_district?: string;
  comm_pincode?: string;
  comm_city?: string;
  comm_tehsil?: string;
  profile_extra_fields?: Record<string, string>;
  enrollment_extra_fields?: Record<string, string>;
  account_status: string;
  is_active: number;
}

const EMPTY_COURSE_FORM = {
  code: '',
  name: '',
  short_description: '',
  detailed_description: '',
  image_url: '',
  category: 'IT & Software Development',
  duration_value: 3,
  duration_unit: 'Months' as 'Days' | 'Weeks' | 'Months' | 'Years',
  total_training_hours: 180,
  level: 'Intermediate',
  eligibility: '12th Pass / Diploma / Graduate',
  mode: 'Hybrid' as 'Online' | 'Offline' | 'Hybrid',
  fees: '',
  start_date: '',
  end_date: '',
  syllabusText: '',
  certificate_info: 'AITM Verified Certificate (ISO 9001:2015 Aligned)',
  status: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
};

export function AdminCourses({ onOpenMaterials }: { onOpenMaterials: (courseId: number) => void }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_COURSE_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Course-wise Student Enrollment Detail View
  const [selectedCourseRoster, setSelectedCourseRoster] = useState<{
    course: Course;
    batches: BatchRecord[];
    counts: { total: number; totalAll?: number; active: number; completed: number };
    students: CourseStudentRow[];
  } | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<number>(0);
  const [rosterSearch, setRosterSearch] = useState('');
  const [profileStudent, setProfileStudent] = useState<CourseStudentRow | null>(null);

  // Bulk Enrollment Modal State
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkType, setBulkType] = useState('Demo');
  const [bulkPayment, setBulkPayment] = useState('Free / No Payment');
  const [bulkBatch, setBulkBatch] = useState('Demo Batch');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    enrolledCount: number;
    existingCount: number;
    failedCount: number;
    totalInCourse: number;
    existing: Array<{ employee_code: string; full_name: string; email: string; reason: string }>;
    failed: Array<{ employee_code: string; full_name: string; email: string; reason: string }>;
  } | null>(null);

  const loadCourses = useCallback(async () => {
    try {
      const res = await apiRequest<{ courses: Course[] }>('/api/admin/courses');
      setCourses(res.courses);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load courses.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useRealtime(['courses:changed', 'enrollments:changed'], () => {
    loadCourses();
    if (selectedCourseRoster) {
      openCourseRoster(selectedCourseRoster.course.id, selectedBatchId);
    }
  });

  const openCourseRoster = async (courseId: number, batchId = 0) => {
    try {
      const qs = batchId > 0 ? `?batchId=${batchId}` : '';
      const data = await apiRequest<{
        course: Course;
        batches: BatchRecord[];
        counts: { total: number; totalAll?: number; active: number; completed: number };
        students: CourseStudentRow[];
      }>(`/api/admin/courses/${courseId}/students${qs}`);
      setSelectedCourseRoster(data);
      setSelectedBatchId(batchId);
      setBulkBatch(`${data.course.name} - Demo Batch`);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load students.' });
    }
  };

  const handleBulkEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseRoster) return;
    setBulkSaving(true);
    setFeedback(null);
    setBulkResult(null);

    const parsedStudents = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.includes('\t')
          ? line.split('\t').map((p) => p.trim())
          : line.split(',').map((p) => p.trim());
        if (parts.length >= 3) {
          return { employee_code: parts[0], full_name: parts[1], email: parts[2] };
        }
        return { employee_code: '', full_name: parts[0] || '', email: parts[1] || '' };
      });

    try {
      const res = await apiRequest<{
        summary: {
          enrolledCount: number;
          existingCount: number;
          failedCount: number;
          totalInCourse: number;
        };
        existing: Array<{ employee_code: string; full_name: string; email: string; reason: string }>;
        failed: Array<{ employee_code: string; full_name: string; email: string; reason: string }>;
      }>('/api/admin/enrollments/bulk', {
        method: 'POST',
        body: {
          course_id: selectedCourseRoster.course.id,
          enrollment_type: bulkType,
          payment_status: bulkPayment,
          status: 'ACTIVE',
          batch_name: bulkBatch,
          send_email: false,
          students: parsedStudents,
        },
      });
      setBulkResult({
        ...res.summary,
        existing: res.existing,
        failed: res.failed,
      });
      setBulkText('');
      await openCourseRoster(selectedCourseRoster.course.id);
      await loadCourses();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Bulk enrollment failed.' });
    } finally {
      setBulkSaving(false);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm(EMPTY_COURSE_FORM);
    setModalOpen(true);
  };

  const openEditModal = (c: Course) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      name: c.name,
      short_description: c.short_description,
      detailed_description: c.detailed_description,
      image_url: c.image_url,
      category: c.category,
      duration_value: c.duration_value,
      duration_unit: c.duration_unit,
      total_training_hours: c.total_training_hours,
      level: c.level,
      eligibility: c.eligibility,
      mode: c.mode,
      fees: c.fees,
      start_date: c.start_date,
      end_date: c.end_date,
      syllabusText: (c.syllabus || []).join('\n'),
      certificate_info: c.certificate_info,
      status: c.status,
    });
    setModalOpen(true);
  };

  const handleUploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiRequest<{ url: string }>('/api/admin/upload/public', {
        method: 'POST',
        formData: fd,
      });
      setForm((prev) => ({ ...prev, image_url: res.url }));
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Image upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    const payload = {
      ...form,
      duration_value: Number(form.duration_value),
      total_training_hours: Number(form.total_training_hours),
      syllabus: form.syllabusText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      if (editingId) {
        await apiRequest(`/api/admin/courses/${editingId}`, { method: 'PUT', body: payload });
        setFeedback({ type: 'success', text: 'Course updated across website and student dashboards.' });
      } else {
        await apiRequest('/api/admin/courses', { method: 'POST', body: payload });
        setFeedback({ type: 'success', text: 'New course created and synced with the public catalog.' });
      }
      setModalOpen(false);
      await loadCourses();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to save course.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (c: Course) => {
    const nextStatus = c.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await apiRequest(`/api/admin/courses/${c.id}`, { method: 'PUT', body: { status: nextStatus } });
      await loadCourses();
      setFeedback({
        type: 'success',
        text: `${c.name} is now ${nextStatus === 'PUBLISHED' ? 'Published on Public Website' : 'Unpublished (Draft)'}.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Update failed.' });
    }
  };

  const handleDelete = async (c: Course) => {
    if (
      !window.confirm(
        `Remove "${c.name}" from the catalog? Existing student accounts and historical enrollment records will be safely preserved.`
      )
    ) {
      return;
    }
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/courses/${c.id}`, {
        method: 'DELETE',
      });
      setFeedback({ type: 'success', text: res.message });
      await loadCourses();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed.' });
    }
  };

  // COURSE-WISE STUDENT ENROLLMENT VIEW
  if (selectedCourseRoster) {
    const { course, batches, counts, students } = selectedCourseRoster;
    const query = rosterSearch.trim().toLowerCase();
    const filteredStudents = query
      ? students.filter(
          (s) =>
            s.student_name.toLowerCase().includes(query) ||
            s.email.toLowerCase().includes(query) ||
            s.enrollment_number.toLowerCase().includes(query) ||
            (s.candidate_id || '').toLowerCase().includes(query) ||
            (s.employee_code || '').toLowerCase().includes(query) ||
            (s.batch_code_snapshot || '').toLowerCase().includes(query) ||
            (s.mobile || '').toLowerCase().includes(query) ||
            s.username.toLowerCase().includes(query)
        )
      : students;

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            setSelectedCourseRoster(null);
            setSelectedBatchId(0);
            setRosterSearch('');
            setBulkResult(null);
            setProfileStudent(null);
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Course Management
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-slate-500">
              Courses / {course.code} · {course.duration_display} · {course.mode}
            </div>
            <h2 className="mt-1 font-display font-bold text-xl text-slate-950">
              {course.name} — Student Enrollment
            </h2>
            <p className="mt-1 text-sm text-slate-600">{course.short_description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setBulkResult(null);
                setBulkOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Bulk Enroll Students
            </button>
            <button
              type="button"
              onClick={() => onOpenMaterials(course.id)}
              className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              Manage Materials
            </button>
            <button
              type="button"
              onClick={() => openEditModal(course)}
              className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              Edit Course
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 bg-white border border-slate-200 rounded-xl">
            <div className="text-xs text-slate-500">Total Enrolled Students</div>
            <div className="mt-1 font-mono font-bold text-2xl text-slate-950 tabular-nums">
              {counts.total}
            </div>
          </div>
          <div className="p-5 bg-white border border-slate-200 rounded-xl">
            <div className="text-xs text-slate-500">Active Enrollments</div>
            <div className="mt-1 font-mono font-bold text-2xl text-blue-700 tabular-nums">
              {counts.active}
            </div>
          </div>
          <div className="p-5 bg-white border border-slate-200 rounded-xl">
            <div className="text-xs text-slate-500">Completed Students</div>
            <div className="mt-1 font-mono font-bold text-2xl text-emerald-700 tabular-nums">
              {counts.completed}
            </div>
          </div>
        </div>

        {/* Batch Filter Cards */}
        {batches && batches.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-slate-950">
                Course Batches ({batches.length})
              </h3>
              <span className="text-xs text-slate-500">Click a batch to view its exact student roster</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => openCourseRoster(course.id, 0)}
                className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  selectedBatchId === 0
                    ? 'border-blue-700 bg-blue-50/70'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900">All Batches</div>
                <div className="mt-1 font-mono font-bold text-lg text-blue-700 tabular-nums">
                  {counts.totalAll ?? counts.total} students
                </div>
                <div className="text-[11px] text-slate-500">Complete course roster</div>
              </button>
              {batches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => openCourseRoster(course.id, b.id)}
                  className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                    selectedBatchId === b.id
                      ? 'border-blue-700 bg-blue-50/70'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-950">Batch {b.batch_code}</span>
                    <span className="font-mono text-xs font-bold text-blue-700 tabular-nums">
                      {b.student_count ?? 0}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-600 tabular-nums">
                    {b.start_date || '—'} → {b.end_date || '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {b.trainer_name ? `Trainer: ${b.trainer_name}` : b.tc_name || 'AITM Training Center'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-semibold text-base text-slate-950">
                Student Enrollment ({counts.total})
                {selectedBatchId > 0 && batches?.find((b) => b.id === selectedBatchId)
                  ? ` — Batch ${batches.find((b) => b.id === selectedBatchId)?.batch_code}`
                  : ''}
              </h3>
              <p className="text-xs text-slate-500">
                Showing {filteredStudents.length} of {counts.total} enrolled student record(s)
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Search name, CandidateID, email, batch..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          {students.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No students are enrolled in this course yet. Approve an application or use Bulk Enroll / Excel Import to populate this roster.
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No students matched &ldquo;{rosterSearch}&rdquo;.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-medium">Sr.</th>
                    <th className="px-4 py-3 font-medium">Candidate / Emp ID</th>
                    <th className="px-4 py-3 font-medium">Batch & Enrollment</th>
                    <th className="px-4 py-3 font-medium">Student Name</th>
                    <th className="px-4 py-3 font-medium">Email & Mobile</th>
                    <th className="px-4 py-3 font-medium">Type & Payment</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((s, idx) => (
                    <tr key={s.enrollment_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">
                        <div className="font-semibold text-slate-900">
                          {s.candidate_id || s.employee_code || '—'}
                        </div>
                        {s.candidate_id && s.employee_code && (
                          <div className="text-[11px] text-slate-500">Emp: {s.employee_code}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">
                        <div className="font-semibold text-blue-700">{s.enrollment_number}</div>
                        <div className="text-[11px] text-slate-600">
                          {s.batch_code_snapshot ? `Batch ${s.batch_code_snapshot}` : s.batch_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div>
                          {s.salutation ? `${s.salutation} ` : ''}
                          {s.student_name}
                        </div>
                        <div className="text-xs font-mono text-slate-400">{s.username}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div>{s.email}</div>
                        {s.mobile && <div className="font-mono text-slate-500">{s.mobile}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        <div className="font-semibold text-slate-900">{s.enrollment_type || 'Regular'}</div>
                        <div className="text-slate-500">{s.payment_status || 'Pending'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div
                          className={
                            s.course_status === 'ACTIVE'
                              ? 'text-emerald-700 font-semibold'
                              : s.course_status === 'COMPLETED'
                                ? 'text-blue-700 font-semibold'
                                : 'text-slate-600 font-semibold'
                          }
                        >
                          {s.course_status === 'ACTIVE' ? 'Active' : s.course_status}
                        </div>
                        <div className="text-slate-400 tabular-nums">{formatDateShort(s.enrollment_date)}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setProfileStudent(s)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
                        >
                          Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Full Student Imported Profile Modal */}
        {profileStudent && (
          <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-slate-500">
                    {profileStudent.candidate_id || profileStudent.enrollment_number} ·{' '}
                    {profileStudent.batch_code_snapshot ? `Batch ${profileStudent.batch_code_snapshot}` : profileStudent.batch_name}
                  </div>
                  <h3 className="font-display font-bold text-lg text-slate-950">
                    {profileStudent.salutation ? `${profileStudent.salutation} ` : ''}
                    {profileStudent.student_name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileStudent(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div>
                    <div className="text-slate-500">Candidate ID</div>
                    <div className="font-mono font-semibold text-slate-950">{profileStudent.candidate_id || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">AITM Enrollment No.</div>
                    <div className="font-mono font-semibold text-blue-700">{profileStudent.enrollment_number}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">SDMS Enrolment No.</div>
                    <div className="font-mono text-slate-900 break-all">
                      {profileStudent.sdms_enrolment_number || '—'}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-display font-semibold text-sm text-slate-900 mb-2">Personal & Family Details</h4>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div><dt className="text-slate-500">Email</dt><dd className="font-medium text-slate-900 break-all">{profileStudent.email || '—'}</dd></div>
                    <div><dt className="text-slate-500">Mobile</dt><dd className="font-mono text-slate-900">{profileStudent.country_code ? `${profileStudent.country_code} ` : ''}{profileStudent.mobile || '—'}</dd></div>
                    <div><dt className="text-slate-500">Date of Birth</dt><dd className="font-mono text-slate-900">{profileStudent.dob || '—'}</dd></div>
                    <div><dt className="text-slate-500">Gender / Marital</dt><dd className="text-slate-900">{profileStudent.gender || '—'}{profileStudent.marital_status ? ` · ${profileStudent.marital_status}` : ''}</dd></div>
                    <div><dt className="text-slate-500">Father&apos;s Name</dt><dd className="text-slate-900">{profileStudent.fathers_name || '—'}</dd></div>
                    <div><dt className="text-slate-500">Mother&apos;s Name</dt><dd className="text-slate-900">{profileStudent.mothers_name || '—'}</dd></div>
                    <div><dt className="text-slate-500">Guardian</dt><dd className="text-slate-900">{profileStudent.guardians_name || '—'}</dd></div>
                    <div><dt className="text-slate-500">Education Level</dt><dd className="text-slate-900">{profileStudent.qualification || '—'}</dd></div>
                    <div><dt className="text-slate-500">Religion / Category</dt><dd className="text-slate-900">{profileStudent.religion || '—'}{profileStudent.category ? ` · ${profileStudent.category}` : ''}</dd></div>
                    <div><dt className="text-slate-500">Disability / ID Type</dt><dd className="text-slate-900">{profileStudent.disability || '—'}{profileStudent.id_type ? ` · ${profileStudent.id_type}` : ''}</dd></div>
                    <div><dt className="text-slate-500">Domicile</dt><dd className="text-slate-900">{[profileStudent.domicile_district, profileStudent.domicile_state].filter(Boolean).join(', ') || '—'}</dd></div>
                  </dl>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h4 className="font-display font-semibold text-sm text-slate-900 mb-2">Address Details</h4>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <dt className="text-slate-500">Permanent Address</dt>
                      <dd className="text-slate-900">
                        {[
                          profileStudent.permanent_address,
                          profileStudent.city,
                          profileStudent.permanent_tehsil,
                          profileStudent.permanent_district,
                          profileStudent.state,
                          profileStudent.permanent_pincode,
                        ]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Communication Address</dt>
                      <dd className="text-slate-900">
                        {[
                          profileStudent.comm_city,
                          profileStudent.comm_tehsil,
                          profileStudent.comm_district,
                          profileStudent.comm_state,
                          profileStudent.comm_pincode,
                        ]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h4 className="font-display font-semibold text-sm text-slate-900 mb-2">Training, Assessment & Certification</h4>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div><dt className="text-slate-500">Training Center</dt><dd className="text-slate-900">{[profileStudent.tc_id, profileStudent.tc_name].filter(Boolean).join(' — ') || '—'}</dd></div>
                    <div><dt className="text-slate-500">Scheme</dt><dd className="text-slate-900">{profileStudent.scheme_name || '—'}</dd></div>
                    <div><dt className="text-slate-500">Fee / Paid By</dt><dd className="text-slate-900">{[profileStudent.candidate_course_fee, profileStudent.fee_paid_by].filter(Boolean).join(' · ') || '—'}</dd></div>
                    <div><dt className="text-slate-500">Assessment Mode</dt><dd className="text-slate-900">{profileStudent.assessment_mode || '—'}</dd></div>
                    <div><dt className="text-slate-500">Assessment Window</dt><dd className="font-mono text-slate-900">{profileStudent.assessment_from_date ? `${profileStudent.assessment_from_date} → ${profileStudent.assessment_to_date}` : '—'}</dd></div>
                    <div><dt className="text-slate-500">Certificate</dt><dd className="text-slate-900">{profileStudent.certificate_name || '—'}</dd></div>
                    <div><dt className="text-slate-500">Placement Type</dt><dd className="text-slate-900">{profileStudent.placement_type || '—'}</dd></div>
                  </dl>
                </div>

                {((profileStudent.profile_extra_fields && Object.keys(profileStudent.profile_extra_fields).length > 0) ||
                  (profileStudent.enrollment_extra_fields && Object.keys(profileStudent.enrollment_extra_fields).length > 0)) && (
                  <div className="border-t border-slate-200 pt-4">
                    <h4 className="font-display font-semibold text-sm text-slate-900 mb-2">
                      Preserved Source Extra Fields
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      {Object.entries({
                        ...(profileStudent.profile_extra_fields || {}),
                        ...(profileStudent.enrollment_extra_fields || {}),
                      }).map(([k, v]) => (
                        <div key={k}>
                          <div className="text-[11px] font-mono text-slate-500 truncate">{k}</div>
                          <div className="text-slate-900 font-medium break-words">{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bulk Enrollment Modal */}
        {bulkOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-950">
                    Bulk Enroll Students — {course.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Creates missing student accounts, maps existing emails, preserves Employee Codes, and sends no emails or payment requests.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkOpen(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleBulkEnrollSubmit} className="p-6 space-y-4">
                {bulkResult && (
                  <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-950 space-y-1.5">
                    <div className="font-semibold">
                      Enrolled: {bulkResult.enrolledCount} · Already Enrolled: {bulkResult.existingCount} · Failed:{' '}
                      {bulkResult.failedCount} · Total in Course: {bulkResult.totalInCourse}
                    </div>
                    {bulkResult.existing.length > 0 && (
                      <div className="text-amber-900">
                        Existing: {bulkResult.existing.map((r) => `${r.full_name} (${r.email})`).join(', ')}
                      </div>
                    )}
                    {bulkResult.failed.length > 0 && (
                      <div className="text-red-800">
                        Failed: {bulkResult.failed.map((r) => `${r.email || r.full_name}: ${r.reason}`).join('; ')}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Enrollment Type</label>
                    <select
                      value={bulkType}
                      onChange={(e) => setBulkType(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="Demo">Demo</option>
                      <option value="Regular">Regular</option>
                      <option value="Sponsored">Sponsored</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Status</label>
                    <select
                      value={bulkPayment}
                      onChange={(e) => setBulkPayment(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="Free / No Payment">Free / No Payment</option>
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Name</label>
                    <input
                      type="text"
                      value={bulkBatch}
                      onChange={(e) => setBulkBatch(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Student Records (One per line: Employee Code, Student Name, Email ID)
                  </label>
                  <textarea
                    rows={8}
                    required
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={'209761, LAV SANJEEV BODADE, bodadelove@gmail.com\n209762, JITENDRA YADAV, jy43437@gmail.com'}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setBulkOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={bulkSaving}
                    className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                  >
                    {bulkSaving ? 'Enrolling...' : 'Enroll Listed Students'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-950">Course Management</h2>
          <p className="text-sm text-slate-600">
            Add, edit, publish, or remove courses. Published courses automatically appear on the public website and application form.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add New Course
        </button>
      </div>

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

      {loading ? (
        <div className="p-8 text-sm text-slate-500">Loading courses...</div>
      ) : courses.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="font-display font-semibold text-slate-900">No courses created yet</p>
          <p className="mt-1 text-sm text-slate-600">Create your first course to display it on the public website.</p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
          >
            Add First Course
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-medium">Course</th>
                  <th className="px-5 py-3 font-medium">Duration & Mode</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Students</th>
                  <th className="px-5 py-3 font-medium text-right">Materials</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courses.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-10 rounded-md overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                          <SafeImage src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{c.name}</div>
                          <div className="text-xs text-slate-500">
                            <span className="font-mono">{c.code}</span> · {c.category}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-700 tabular-nums">
                      <div className="font-medium text-slate-900">{c.duration_display}</div>
                      <div className="text-slate-500">
                        {c.mode} · {c.level}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <span
                        className={`font-semibold ${
                          c.status === 'PUBLISHED'
                            ? 'text-emerald-700'
                            : c.status === 'DRAFT'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums text-xs">
                      <button
                        type="button"
                        onClick={() => openCourseRoster(c.id)}
                        className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:underline cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>{c.total_students || 0}</span>
                        <span className="font-sans font-medium text-slate-500">
                          {c.batch_count ? `(${c.batch_count} ${c.batch_count === 1 ? 'batch' : 'batches'})` : 'enrolled'}
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums text-xs">
                      <button
                        type="button"
                        onClick={() => onOpenMaterials(c.id)}
                        className="text-slate-700 hover:text-blue-700 hover:underline cursor-pointer"
                      >
                        {c.resource_count || 0} files
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openCourseRoster(c.id)}
                          title="Student Enrollment"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer"
                        >
                          <Users className="w-3.5 h-3.5" />
                          Student Enrollment
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(c)}
                          title={c.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                          className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                        >
                          {c.status === 'PUBLISHED' ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          title="Edit Course"
                          className="p-1.5 text-slate-600 hover:text-blue-700 rounded hover:bg-slate-100 cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          title="Remove Course"
                          className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Course Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-950">
                {editingId ? 'Edit Course' : 'Add New Course'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Course Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Python Programming & Automation"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Course Code *</label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="AITM-PY-102"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Short Description *</label>
                <textarea
                  rows={2}
                  required
                  value={form.short_description}
                  onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Detailed Course Description
                </label>
                <textarea
                  rows={3}
                  value={form.detailed_description}
                  onChange={(e) => setForm({ ...form, detailed_description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Duration *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.duration_value}
                    onChange={(e) => setForm({ ...form, duration_value: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Duration Unit *</label>
                  <select
                    value={form.duration_unit}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        duration_unit: e.target.value as 'Days' | 'Weeks' | 'Months' | 'Years',
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Days">Days</option>
                    <option value="Weeks">Weeks</option>
                    <option value="Months">Months</option>
                    <option value="Years">Years</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Training Hours</label>
                  <input
                    type="number"
                    min={0}
                    value={form.total_training_hours}
                    onChange={(e) => setForm({ ...form, total_training_hours: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Course Mode *</label>
                  <select
                    value={form.mode}
                    onChange={(e) =>
                      setForm({ ...form, mode: e.target.value as 'Online' | 'Offline' | 'Hybrid' })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Hybrid">Hybrid</option>
                    <option value="Online">Online</option>
                    <option value="Offline">Offline</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                  <input
                    type="text"
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Level *</label>
                  <input
                    type="text"
                    required
                    value={form.level}
                    onChange={(e) => setForm({ ...form, level: e.target.value })}
                    placeholder="Beginner / Intermediate / Advanced"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fees (Optional)</label>
                  <input
                    type="text"
                    value={form.fees}
                    onChange={(e) => setForm({ ...form, fees: e.target.value })}
                    placeholder="₹15,000 or Sponsored"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status *</label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="PUBLISHED">Published (Visible on Website)</option>
                    <option value="DRAFT">Draft (Hidden)</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Eligibility Criteria *</label>
                <input
                  type="text"
                  required
                  value={form.eligibility}
                  onChange={(e) => setForm({ ...form, eligibility: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Certificate Information</label>
                <input
                  type="text"
                  value={form.certificate_info}
                  onChange={(e) => setForm({ ...form, certificate_info: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Course Image (Upload or URL)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={form.image_url}
                    onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    placeholder="/uploads/public/... or https://..."
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading...' : 'Upload'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadImage(f);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Course Syllabus (One topic/module per line)
                </label>
                <textarea
                  rows={4}
                  value={form.syllabusText}
                  onChange={(e) => setForm({ ...form, syllabusText: e.target.value })}
                  placeholder={'Module 1: Introduction\nModule 2: Core Skills\nModule 3: Capstone Project'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

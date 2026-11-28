import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  Plus,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { apiRequest, fetchAuthorizedBlob, formatDateShort, formatFileSize } from '../../lib/api';
import { useRealtime } from '../../context/RealtimeContext';
import type { AssignmentRecord, Course, CourseModule, LearningResource } from '../../types';

interface SubmissionRow {
  id: number;
  student_name: string;
  username: string;
  enrollment_number: string;
  submission_text: string;
  file_name: string;
  score: number | null;
  feedback: string;
  status: string;
  submitted_at: string;
}

export function AdminMaterials({ initialCourseId }: { initialCourseId?: number | null }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number>(initialCourseId || 0);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [subTab, setSubTab] = useState<'materials' | 'assignments'>('materials');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Module create form
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleDesc, setModuleDesc] = useState('');

  // Resource upload form
  const [resTitle, setResTitle] = useState('');
  const [resDesc, setResDesc] = useState('');
  const [resType, setResType] = useState<'DOCUMENT' | 'VIDEO_LINK' | 'STUDY_MATERIAL'>('DOCUMENT');
  const [resModuleId, setResModuleId] = useState('');
  const [resUrl, setResUrl] = useState('');
  const [resFile, setResFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Assignment create form
  const [assignForm, setAssignForm] = useState({
    title: '',
    description: '',
    module_id: '',
    due_date: '',
    max_score: 100,
  });

  // Submissions modal
  const [gradingAssignment, setGradingAssignment] = useState<AssignmentRecord | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);

  useEffect(() => {
    if (initialCourseId) setSelectedCourseId(initialCourseId);
  }, [initialCourseId]);

  const loadCourses = useCallback(async () => {
    const res = await apiRequest<{ courses: Course[] }>('/api/admin/courses');
    setCourses(res.courses);
    if (!selectedCourseId && res.courses.length > 0) {
      setSelectedCourseId(res.courses[0].id);
    }
  }, [selectedCourseId]);

  const loadCourseData = useCallback(async () => {
    if (!selectedCourseId) return;
    try {
      const [mRes, rRes, aRes] = await Promise.all([
        apiRequest<{ modules: CourseModule[] }>(`/api/admin/modules?courseId=${selectedCourseId}`),
        apiRequest<{ resources: LearningResource[] }>(`/api/admin/resources?courseId=${selectedCourseId}`),
        apiRequest<{ assignments: AssignmentRecord[] }>(`/api/admin/assignments?courseId=${selectedCourseId}`),
      ]);
      setModules(mRes.modules);
      setResources(rRes.resources);
      setAssignments(aRes.assignments);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load materials.' });
    }
  }, [selectedCourseId]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    loadCourseData();
  }, [loadCourseData]);

  useRealtime(['modules:changed', 'resources:changed', 'assignments:changed', 'courses:changed'], () => {
    loadCourseData();
  });

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !moduleTitle.trim()) return;
    setFeedback(null);
    try {
      await apiRequest('/api/admin/modules', {
        method: 'POST',
        body: {
          course_id: selectedCourseId,
          title: moduleTitle.trim(),
          description: moduleDesc.trim(),
          sort_order: modules.length + 1,
        },
      });
      setModuleTitle('');
      setModuleDesc('');
      setFeedback({ type: 'success', text: 'Learning module added.' });
      await loadCourseData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create module.' });
    }
  };

  const handleDeleteModule = async (id: number) => {
    if (!window.confirm('Delete this module? Its resources will remain under Unassigned Materials.')) return;
    await apiRequest(`/api/admin/modules/${id}`, { method: 'DELETE' });
    await loadCourseData();
  };

  const handleUploadResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !resTitle.trim()) return;
    setUploading(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('course_id', String(selectedCourseId));
      if (resModuleId) fd.append('module_id', resModuleId);
      fd.append('title', resTitle.trim());
      fd.append('description', resDesc.trim());
      fd.append('resource_type', resType);
      if (resUrl.trim()) fd.append('external_url', resUrl.trim());
      if (resFile) fd.append('file', resFile);

      await apiRequest('/api/admin/resources', {
        method: 'POST',
        formData: fd,
      });

      setResTitle('');
      setResDesc('');
      setResUrl('');
      setResFile(null);
      setFeedback({
        type: 'success',
        text: 'Learning material saved securely and made available to enrolled students.',
      });
      await loadCourseData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteResource = async (id: number) => {
    if (!window.confirm('Delete this learning material permanently?')) return;
    await apiRequest(`/api/admin/resources/${id}`, { method: 'DELETE' });
    setFeedback({ type: 'success', text: 'Learning material removed.' });
    await loadCourseData();
  };

  const handleDownloadResource = async (res: LearningResource) => {
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

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) return;
    setFeedback(null);
    try {
      await apiRequest('/api/admin/assignments', {
        method: 'POST',
        body: {
          course_id: selectedCourseId,
          module_id: assignForm.module_id ? Number(assignForm.module_id) : null,
          title: assignForm.title,
          description: assignForm.description,
          due_date: assignForm.due_date,
          max_score: Number(assignForm.max_score),
        },
      });
      setAssignForm({ title: '', description: '', module_id: '', due_date: '', max_score: 100 });
      setFeedback({ type: 'success', text: 'Assignment published to enrolled students.' });
      await loadCourseData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to create assignment.' });
    }
  };

  const openSubmissions = async (a: AssignmentRecord) => {
    setGradingAssignment(a);
    const res = await apiRequest<{ submissions: SubmissionRow[] }>(
      `/api/admin/assignments/${a.id}/submissions`
    );
    setSubmissions(res.submissions);
  };

  const handleGrade = async (subId: number, score: number, feedbackText: string) => {
    await apiRequest(`/api/admin/submissions/${subId}/grade`, {
      method: 'PUT',
      body: { score, feedback: feedbackText },
    });
    if (gradingAssignment) {
      openSubmissions(gradingAssignment);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-950">
            Learning Materials, Modules & Assignments
          </h2>
          <p className="text-sm text-slate-600">
            Upload private course documents (PDF, DOCX, PPTX, XLSX, ZIP, Images, Videos) and organize by module. Files are protected and accessible only to enrolled students.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(Number(e.target.value))}
            className="px-3.5 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('materials')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                subTab === 'materials' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Modules & Files
            </button>
            <button
              type="button"
              onClick={() => setSubTab('assignments')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                subTab === 'assignments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Assignments ({assignments.length})
            </button>
          </div>
        </div>
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

      {subTab === 'materials' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Forms: Add Module + Upload Material */}
          <div className="lg:col-span-5 space-y-6">
            <form
              onSubmit={handleUploadResource}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <h3 className="font-display font-semibold text-base text-slate-950 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-700" />
                Upload Document or Add Video Link
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Material Type</label>
                <select
                  value={resType}
                  onChange={(e) =>
                    setResType(e.target.value as 'DOCUMENT' | 'VIDEO_LINK' | 'STUDY_MATERIAL')
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="DOCUMENT">Course Document (PDF / DOC / PPT / XLS / ZIP / Media)</option>
                  <option value="VIDEO_LINK">Video Lecture Link (YouTube / Drive / Vimeo)</option>
                  <option value="STUDY_MATERIAL">Study Material / Reading Note</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assign to Module</label>
                <select
                  value={resModuleId}
                  onChange={(e) => setResModuleId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="">General Course Resources (No specific module)</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Material Title *</label>
                <input
                  type="text"
                  required
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  placeholder="e.g., Module 1 - Introduction Notes"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={resDesc}
                  onChange={(e) => setResDesc(e.target.value)}
                  placeholder="Optional overview for students..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {resType === 'VIDEO_LINK' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Video URL *</label>
                  <input
                    type="url"
                    required
                    value={resUrl}
                    onChange={(e) => setResUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Upload Private File (Max 50MB) {resType === 'DOCUMENT' ? '*' : ''}
                  </label>
                  <input
                    type="file"
                    required={resType === 'DOCUMENT'}
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.jpg,.jpeg,.png,.webp,.mp4,.webm,.txt"
                    onChange={(e) => setResFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200"
                  />
                  {resType === 'STUDY_MATERIAL' && (
                    <div className="mt-2">
                      <label className="block text-xs text-slate-500 mb-1">Or External Reference Link</label>
                      <input
                        type="url"
                        value={resUrl}
                        onChange={(e) => setResUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={uploading}
                className="w-full py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {uploading ? 'Uploading Securely...' : 'Publish Learning Material'}
              </button>
            </form>

            <form
              onSubmit={handleAddModule}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <h3 className="font-display font-semibold text-base text-slate-950 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-blue-700" />
                Create Course Module
              </h3>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Module Title *</label>
                <input
                  type="text"
                  required
                  value={moduleTitle}
                  onChange={(e) => setModuleTitle(e.target.value)}
                  placeholder="e.g., Module 4 - JavaScript Practicals"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Module Summary</label>
                <input
                  type="text"
                  value={moduleDesc}
                  onChange={(e) => setModuleDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Add Module to Course
              </button>
            </form>
          </div>

          {/* Right List: Organized Modules & Resources */}
          <div className="lg:col-span-7 space-y-5">
            {modules.map((mod) => {
              const modRes = resources.filter((r) => r.module_id === mod.id);
              return (
                <div key={mod.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div>
                      <h4 className="font-display font-semibold text-sm text-slate-950">{mod.title}</h4>
                      {mod.description && <p className="text-xs text-slate-500">{mod.description}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteModule(mod.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      title="Delete Module"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {modRes.length === 0 ? (
                      <p className="px-5 py-4 text-xs text-slate-500">
                        No materials uploaded for this module yet.
                      </p>
                    ) : (
                      modRes.map((r) => (
                        <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            {r.resource_type === 'VIDEO_LINK' ? (
                              <Video className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-slate-900 truncate">{r.title}</div>
                              <div className="text-xs text-slate-500">
                                {r.file_name
                                  ? `${r.file_name} · ${formatFileSize(r.file_size)}`
                                  : r.external_url}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {r.file_name && (
                              <button
                                type="button"
                                onClick={() => handleDownloadResource(r)}
                                className="p-1.5 text-slate-600 hover:text-blue-700 rounded hover:bg-slate-100 cursor-pointer"
                                title="Download File"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            {r.external_url && (
                              <a
                                href={r.external_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-slate-600 hover:text-blue-700 rounded hover:bg-slate-100"
                                title="Open Link"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteResource(r.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                              title="Delete Material"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}

            {/* Unassigned / General Course Materials */}
            {resources.filter((r) => !r.module_id).length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                  <h4 className="font-display font-semibold text-sm text-slate-950">
                    General Course Resources
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {resources
                    .filter((r) => !r.module_id)
                    .map((r) => (
                      <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-slate-900 truncate">{r.title}</div>
                          <div className="text-xs text-slate-500">
                            {r.file_name ? `${r.file_name} · ${formatFileSize(r.file_size)}` : r.external_url}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {r.file_name && (
                            <button
                              type="button"
                              onClick={() => handleDownloadResource(r)}
                              className="p-1.5 text-slate-600 hover:text-blue-700 cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteResource(r.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {modules.length === 0 && resources.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                No modules or documents yet for this course. Add your first module or upload a PDF on the left.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Assignments Tab */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateAssignment}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit"
          >
            <h3 className="font-display font-semibold text-base text-slate-950 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-700" />
              Post Course Assignment
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assignment Title *</label>
              <input
                type="text"
                required
                value={assignForm.title}
                onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Module (Optional)</label>
              <select
                value={assignForm.module_id}
                onChange={(e) => setAssignForm({ ...assignForm, module_id: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="">None</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={assignForm.due_date}
                  onChange={(e) => setAssignForm({ ...assignForm, due_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max Score</label>
                <input
                  type="number"
                  min={1}
                  value={assignForm.max_score}
                  onChange={(e) => setAssignForm({ ...assignForm, max_score: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions *</label>
              <textarea
                rows={4}
                required
                value={assignForm.description}
                onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Publish Assignment
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            {assignments.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                No assignments posted for this course yet.
              </div>
            ) : (
              assignments.map((a) => (
                <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-display font-semibold text-base text-slate-950">{a.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Max Score: {a.max_score}
                        {a.due_date ? ` · Due ${formatDateShort(a.due_date)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openSubmissions(a)}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer"
                      >
                        Submissions ({a.submission_count || 0})
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/assignments/${a.id}`, { method: 'DELETE' });
                          await loadCourseData();
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2.5 text-sm text-slate-600 whitespace-pre-line">{a.description}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Submissions Grading Modal */}
      {gradingAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-slate-950">
                Submissions — {gradingAssignment.title}
              </h3>
              <button
                type="button"
                onClick={() => setGradingAssignment(null)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {submissions.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">No student submissions yet.</p>
              ) : (
                submissions.map((sub) => (
                  <SubmissionGradeCard
                    key={sub.id}
                    sub={sub}
                    maxScore={gradingAssignment.max_score}
                    onGrade={handleGrade}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionGradeCard({
  sub,
  maxScore,
  onGrade,
}: {
  sub: SubmissionRow;
  maxScore: number;
  onGrade: (id: number, score: number, feedback: string) => Promise<void>;
}) {
  const [score, setScore] = useState(sub.score ?? 0);
  const [fb, setFb] = useState(sub.feedback || '');
  const [saving, setSaving] = useState(false);

  return (
    <div className="p-4 border border-slate-200 rounded-lg space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-900">
          {sub.student_name} ({sub.enrollment_number})
        </span>
        <span className="text-slate-500">{sub.status}</span>
      </div>
      {sub.submission_text && (
        <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-100 whitespace-pre-line">
          {sub.submission_text}
        </p>
      )}
      {sub.file_name && (
        <button
          type="button"
          onClick={async () => {
            const { blob } = await fetchAuthorizedBlob(`/api/submissions/${sub.id}/file`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = sub.file_name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Download {sub.file_name}
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input
          type="number"
          min={0}
          max={maxScore}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="w-20 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
          placeholder="Score"
        />
        <input
          type="text"
          value={fb}
          onChange={(e) => setFb(e.target.value)}
          placeholder="Instructor feedback..."
          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
        />
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onGrade(sub.id, score, fb);
            setSaving(false);
          }}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded cursor-pointer"
        >
          {saving ? 'Saving...' : 'Save Grade'}
        </button>
      </div>
    </div>
  );
}

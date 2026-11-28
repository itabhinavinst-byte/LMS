import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface PreviewCourseSummary {
  courseId: string;
  courseName: string;
  sector: string;
  courseType: string;
  courseFee: string;
  certificateName: string;
  existsInDb: boolean;
  existingDbId: number | null;
  studentCount: number;
  batchIds: string[];
}

interface PreviewBatchSummary {
  batchId: string;
  courseId: string;
  courseName: string;
  startDate: string;
  endDate: string;
  trainerId: string;
  trainerName: string;
  tcId: string;
  tcName: string;
  assessmentFromDate: string;
  assessmentToDate: string;
  existsInDb: boolean;
  studentCount: number;
}

interface PreviewRowItem {
  rowNumber: number;
  status: 'NEW_STUDENT' | 'EXISTING_STUDENT' | 'MULTI_COURSE' | 'DUPLICATE_ENROLLMENT' | 'EXCEPTION';
  candidateId: string;
  fullName: string;
  email: string;
  mobile: string;
  courseId: string;
  courseName: string;
  batchId: string;
  batchStartDate: string;
  batchEndDate: string;
  sdmsEnrolmentNumber: string;
  existingUserId: number | null;
  note: string;
}

interface DuplicateCandidateGroup {
  candidateId: string;
  fullName: string;
  email: string;
  occurrences: Array<{
    rowNumber: number;
    courseId: string;
    courseName: string;
    batchId: string;
  }>;
  reconciliationType: 'MULTI_COURSE' | 'SAME_COURSE_DUPLICATE';
  note: string;
}

interface ImportPreviewResponse {
  previewId: string;
  fileName: string;
  sheetName: string;
  headerRow: number;
  totalRowsRead: number;
  summary: {
    totalRowsRead: number;
    uniqueCandidatesInFile: number;
    existingStudentsMatched: number;
    newStudentsCount: number;
    newEnrollmentsCount: number;
    existingEnrollmentsCount: number;
    duplicateCandidateIdCount: number;
    multiCourseEnrollmentCount: number;
    exceptionCount: number;
  };
  detectedCourses: PreviewCourseSummary[];
  detectedBatches: PreviewBatchSummary[];
  newStudents: PreviewRowItem[];
  existingStudents: PreviewRowItem[];
  duplicateCandidateIds: DuplicateCandidateGroup[];
  exceptions: PreviewRowItem[];
  previewRows: PreviewRowItem[];
}

interface ImportCommitReport {
  totalRowsRead: number;
  existingStudentsMatched: number;
  newStudentProfilesCreated: number;
  newEnrollmentsCreated: number;
  updatedEnrollments: number;
  duplicateRecordsDetected: number;
  failedImports: number;
  coursesCreated: number;
  coursesReused: number;
  batchesCreated: number;
  batchesReused: number;
  courseCounts: Array<{
    courseDbId: number;
    courseId: string;
    courseName: string;
    importedRows: number;
    totalEnrolledInDb: number;
  }>;
  batchCounts: Array<{
    batchDbId: number;
    batchId: string;
    courseId: string;
    courseName: string;
    startDate: string;
    endDate: string;
    importedRows: number;
    totalEnrolledInDb: number;
  }>;
  duplicates: DuplicateCandidateGroup[];
  failures: Array<{
    rowNumber: number;
    candidateId: string;
    fullName: string;
    courseName: string;
    batchId: string;
    reason: string;
  }>;
}

type PreviewFilterTab = 'ALL' | 'NEW' | 'EXISTING' | 'DUPLICATES' | 'EXCEPTIONS';

export function AdminExcelImport({ onGoToCourses }: { onGoToCourses: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [report, setReport] = useState<ImportCommitReport | null>(null);
  const [sendWelcomeEmails, setSendWelcomeEmails] = useState(false);
  const [importEmailSummary, setImportEmailSummary] = useState<{
    attempted: number;
    sent: number;
    failed: number;
    skipped: number;
    invalid: number;
  } | null>(null);

  const [activeFilter, setActiveFilter] = useState<PreviewFilterTab>('ALL');
  const [courseFilter, setCourseFilter] = useState<string>('ALL');
  const [batchFilter, setBatchFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const handleFileSelected = async (file: File) => {
    setError(null);
    setReport(null);
    setPreview(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiRequest<ImportPreviewResponse>('/api/admin/import/excel/preview', {
        method: 'POST',
        formData: fd,
      });
      setPreview(res);
      setActiveFilter('ALL');
      setCourseFilter('ALL');
      setBatchFilter('ALL');
      setSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse Excel file.');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!preview) return;
    setError(null);
    setImportEmailSummary(null);
    setCommitting(true);
    try {
      const res = await apiRequest<{
        report: ImportCommitReport;
        emailSummary?: { attempted: number; sent: number; failed: number; skipped: number; invalid: number } | null;
      }>('/api/admin/import/excel/commit', {
        method: 'POST',
        body: { previewId: preview.previewId, sendWelcomeEmails },
      });
      setReport(res.report);
      setImportEmailSummary(res.emailSummary || null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit import to database.');
    } finally {
      setCommitting(false);
    }
  };

  const filteredPreviewRows = useMemo(() => {
    if (!preview) return [];
    let list = preview.previewRows;
    if (activeFilter === 'NEW') {
      list = list.filter((r) => r.status === 'NEW_STUDENT');
    } else if (activeFilter === 'EXISTING') {
      list = list.filter((r) => r.status === 'EXISTING_STUDENT');
    } else if (activeFilter === 'DUPLICATES') {
      const dupIds = new Set(preview.duplicateCandidateIds.map((d) => d.candidateId.toUpperCase()));
      list = list.filter(
        (r) =>
          r.status === 'MULTI_COURSE' ||
          r.status === 'DUPLICATE_ENROLLMENT' ||
          dupIds.has(r.candidateId.toUpperCase())
      );
    } else if (activeFilter === 'EXCEPTIONS') {
      list = list.filter((r) => r.status === 'EXCEPTION');
    }

    if (courseFilter !== 'ALL') {
      list = list.filter((r) => r.courseId === courseFilter);
    }
    if (batchFilter !== 'ALL') {
      list = list.filter((r) => r.batchId === batchFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.candidateId.toLowerCase().includes(q) ||
          r.fullName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.mobile.toLowerCase().includes(q) ||
          r.courseName.toLowerCase().includes(q) ||
          r.batchId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [preview, activeFilter, courseFilter, batchFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-950">Excel Student Import</h2>
          <p className="text-sm text-slate-600">
            Upload Excel workbooks (e.g. <span className="font-mono text-xs">Book1.xlsx</span> →{' '}
            <span className="font-mono text-xs">Sheet1</span>, headers on Row 9, student records from Row 10) to preview
            detected courses, batches, existing profiles, and duplicates before committing.
          </p>
        </div>
        {(preview || report) && (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setReport(null);
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Upload Another File
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-900 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-red-700 hover:text-red-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* UPLOAD ZONE */}
      {!preview && !report && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileSelected(file);
          }}
          className={`bg-white border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            dragging ? 'border-blue-600 bg-blue-50/40' : 'border-slate-300'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-blue-700">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <h3 className="mt-4 font-display font-bold text-base text-slate-950">
            {parsing ? 'Parsing Excel workbook and matching existing database records...' : 'Upload Student Excel Workbook'}
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 max-w-xl mx-auto">
            Supports <span className="font-mono text-xs">.xlsx</span> and <span className="font-mono text-xs">.csv</span>{' '}
            up to 15 MB. Matches students by <span className="font-mono text-xs">CandidateID</span>, maps exact{' '}
            <span className="font-mono text-xs">CourseId + CourseName + BatchID</span>, preserves blank cells without
            overwriting existing fields, and never triggers emails or payments.
          </p>
          <div className="mt-6 flex items-center justify-center">
            <label className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer">
              <Upload className="w-4 h-4" />
              {parsing ? 'Analyzing Workbook...' : 'Select Excel File (.xlsx / .csv)'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                disabled={parsing}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* STEP 2: PREVIEW BEFORE COMMIT */}
      {preview && (
        <div className="space-y-6">
          {/* File Header + Confirm Action Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono text-slate-500">
                Preview Ready · Sheet: {preview.sheetName} · Header Row: {preview.headerRow}
              </div>
              <h3 className="mt-1 font-display font-bold text-lg text-slate-950">{preview.fileName}</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Review detected courses, batches, existing students, and duplicate CandidateIDs below. No database changes
                are written until you explicitly confirm.
              </p>
            </div>
            <div className="flex flex-col sm:items-end gap-2.5 shrink-0">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWelcomeEmails}
                  onChange={(e) => setSendWelcomeEmails(e.target.checked)}
                />
                Automatically send AITM login/activation emails to newly enrolled students
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={committing}
                  onClick={() => setPreview(null)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={committing || preview.summary.totalRowsRead === preview.summary.exceptionCount}
                  onClick={handleConfirmImport}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {committing
                    ? 'Saving to Database...'
                    : `Confirm & Import ${preview.summary.totalRowsRead - preview.summary.exceptionCount} Records`}
                </button>
              </div>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total Rows Read</div>
              <div className="mt-1 font-mono font-bold text-2xl text-slate-950 tabular-nums">
                {preview.summary.totalRowsRead}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">New Students</div>
              <div className="mt-1 font-mono font-bold text-2xl text-blue-700 tabular-nums">
                {preview.summary.newStudentsCount}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Existing Matched</div>
              <div className="mt-1 font-mono font-bold text-2xl text-emerald-700 tabular-nums">
                {preview.summary.existingStudentsMatched}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">New Enrollments</div>
              <div className="mt-1 font-mono font-bold text-2xl text-slate-950 tabular-nums">
                {preview.summary.newEnrollmentsCount}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Duplicate CandidateIDs</div>
              <div className="mt-1 font-mono font-bold text-2xl text-amber-700 tabular-nums">
                {preview.summary.duplicateCandidateIdCount}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Exceptions</div>
              <div className="mt-1 font-mono font-bold text-2xl text-red-700 tabular-nums">
                {preview.summary.exceptionCount}
              </div>
            </div>
          </div>

          {/* Detected Courses & Batches Side-by-Side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h4 className="font-display font-semibold text-sm text-slate-950">
                  Detected Courses ({preview.detectedCourses.length})
                </h4>
                <span className="text-xs font-mono text-slate-500">CourseId + CourseName</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Course</th>
                      <th className="px-4 py-2.5 font-medium">Course ID</th>
                      <th className="px-4 py-2.5 font-medium">DB Action</th>
                      <th className="px-4 py-2.5 font-medium text-right">Students</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.detectedCourses.map((c) => (
                      <tr key={`${c.courseId}-${c.courseName}`}>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900">{c.courseName}</div>
                          <div className="text-slate-500">{c.sector || c.courseType || '—'}</div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{c.courseId}</td>
                        <td className="px-4 py-2.5 font-semibold">
                          <span className={c.existsInDb ? 'text-emerald-700' : 'text-blue-700'}>
                            {c.existsInDb ? 'Reuse Existing' : 'Create New'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {c.studentCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h4 className="font-display font-semibold text-sm text-slate-950">
                  Detected Batches ({preview.detectedBatches.length})
                </h4>
                <span className="text-xs font-mono text-slate-500">BatchID Schedule</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Batch ID</th>
                      <th className="px-4 py-2.5 font-medium">Course</th>
                      <th className="px-4 py-2.5 font-medium">Dates</th>
                      <th className="px-4 py-2.5 font-medium text-right">Students</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.detectedBatches.map((b) => (
                      <tr key={b.batchId}>
                        <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">
                          <div>{b.batchId}</div>
                          <div className={b.existsInDb ? 'text-emerald-700 font-sans' : 'text-blue-700 font-sans'}>
                            {b.existsInDb ? 'Existing' : 'New Batch'}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{b.courseName}</div>
                          <div className="font-mono text-slate-500">{b.courseId}</div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-600 tabular-nums">
                          {b.startDate || '—'} → {b.endDate || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {b.studentCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Duplicate CandidateIDs Reconciliation Panel */}
          {preview.duplicateCandidateIds.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-950 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                Duplicate CandidateID Reconciliation ({preview.duplicateCandidateIds.length} detected)
              </div>
              <div className="space-y-2">
                {preview.duplicateCandidateIds.map((dup) => (
                  <div
                    key={dup.candidateId}
                    className="bg-white border border-amber-200 rounded-lg p-3.5 text-xs space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-slate-950">{dup.candidateId}</span> ·{' '}
                        <span className="font-semibold text-slate-900">{dup.fullName}</span> ({dup.email})
                      </div>
                      <span className="font-mono font-semibold text-amber-800">{dup.reconciliationType}</span>
                    </div>
                    <p className="text-slate-600">{dup.note}</p>
                    <div className="flex flex-wrap gap-3 pt-1 font-mono text-slate-700">
                      {dup.occurrences.map((o) => (
                        <span key={`${o.rowNumber}-${o.batchId}`} className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                          Row {o.rowNumber}: {o.courseName} ({o.courseId}) / Batch {o.batchId}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student Records Preview Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 border-b lg:border-b-0 border-slate-100 pb-2 lg:pb-0">
                {(
                  [
                    { id: 'ALL', label: `All (${preview.previewRows.length})` },
                    { id: 'NEW', label: `New Students (${preview.newStudents.length})` },
                    { id: 'EXISTING', label: `Existing (${preview.existingStudents.length})` },
                    { id: 'DUPLICATES', label: `Duplicates (${preview.duplicateCandidateIds.length})` },
                    { id: 'EXCEPTIONS', label: `Exceptions (${preview.exceptions.length})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveFilter(t.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                      activeFilter === t.id
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="ALL">All Courses</option>
                  {preview.detectedCourses.map((c) => (
                    <option key={c.courseId} value={c.courseId}>
                      {c.courseName} ({c.studentCount})
                    </option>
                  ))}
                </select>
                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="ALL">All Batches</option>
                  {preview.detectedBatches.map((b) => (
                    <option key={b.batchId} value={b.batchId}>
                      Batch {b.batchId} ({b.studentCount})
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter CandidateID, name..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-52"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Row</th>
                    <th className="px-4 py-2.5 font-medium">Candidate ID</th>
                    <th className="px-4 py-2.5 font-medium">Student Name & Contact</th>
                    <th className="px-4 py-2.5 font-medium">Course</th>
                    <th className="px-4 py-2.5 font-medium">Batch ID</th>
                    <th className="px-4 py-2.5 font-medium">Action / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPreviewRows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.candidateId}-${row.batchId}`} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-slate-500 tabular-nums">{row.rowNumber}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">
                        {row.candidateId || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">{row.fullName || '—'}</div>
                        <div className="text-slate-500">
                          {row.email || 'No email'} {row.mobile ? `· ${row.mobile}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{row.courseName || '—'}</div>
                        <div className="font-mono text-slate-500">{row.courseId || '—'}</div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">
                        <div>{row.batchId || '—'}</div>
                        <div className="text-[11px] text-slate-500">
                          {row.batchStartDate ? `${row.batchStartDate}–${row.batchEndDate}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div
                          className={`font-semibold ${
                            row.status === 'NEW_STUDENT'
                              ? 'text-blue-700'
                              : row.status === 'EXISTING_STUDENT'
                                ? 'text-emerald-700'
                                : row.status === 'EXCEPTION'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                          }`}
                        >
                          {row.status.replace(/_/g, ' ')}
                        </div>
                        <div className="text-slate-500 max-w-xs">{row.note}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: POST-IMPORT VERIFICATION REPORT */}
      {report && (
        <div className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-base text-emerald-950">
                  Student Import Completed & Saved to Database
                </h3>
                <p className="text-xs text-emerald-900 mt-0.5">
                  All validated courses, batches, student profiles, and enrollments are live in the AITM LMS database.
                  {importEmailSummary
                    ? ` Welcome activation emails processed: ${importEmailSummary.sent} sent, ${importEmailSummary.failed} failed, ${importEmailSummary.skipped} skipped.`
                    : ' No automatic emails were dispatched during this import.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onGoToCourses}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              View Courses & Batches
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total Excel Records Read</div>
              <div className="mt-1 font-mono font-bold text-2xl text-slate-950 tabular-nums">
                {report.totalRowsRead}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Existing Students Matched</div>
              <div className="mt-1 font-mono font-bold text-2xl text-emerald-700 tabular-nums">
                {report.existingStudentsMatched}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">New Profiles Created</div>
              <div className="mt-1 font-mono font-bold text-2xl text-blue-700 tabular-nums">
                {report.newStudentProfilesCreated}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">New Enrollments Created</div>
              <div className="mt-1 font-mono font-bold text-2xl text-slate-950 tabular-nums">
                {report.newEnrollmentsCreated}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Duplicates Detected</div>
              <div className="mt-1 font-mono font-bold text-2xl text-amber-700 tabular-nums">
                {report.duplicateRecordsDetected}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Failed Imports</div>
              <div className="mt-1 font-mono font-bold text-2xl text-red-700 tabular-nums">
                {report.failedImports}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h4 className="font-display font-semibold text-sm text-slate-950">Course-wise Counts</h4>
                <span className="text-xs text-slate-500">
                  {report.coursesCreated} created · {report.coursesReused} reused
                </span>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Course Name</th>
                    <th className="px-4 py-2.5 font-medium">Course ID</th>
                    <th className="px-4 py-2.5 font-medium text-right">Imported</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total in DB</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.courseCounts.map((c) => (
                    <tr key={c.courseDbId}>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{c.courseName}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{c.courseId}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-700 tabular-nums">
                        {c.importedRows}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {c.totalEnrolledInDb}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h4 className="font-display font-semibold text-sm text-slate-950">Batch-wise Counts</h4>
                <span className="text-xs text-slate-500">
                  {report.batchesCreated} created · {report.batchesReused} reused
                </span>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Batch ID</th>
                    <th className="px-4 py-2.5 font-medium">Course</th>
                    <th className="px-4 py-2.5 font-medium">Schedule</th>
                    <th className="px-4 py-2.5 font-medium text-right">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.batchCounts.map((b) => (
                    <tr key={b.batchDbId}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{b.batchId}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{b.courseName}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600 tabular-nums">
                        {b.startDate} → {b.endDate}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {b.totalEnrolledInDb}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {report.failures.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-2">
              <h4 className="font-display font-semibold text-sm text-red-900">
                Failed Rows ({report.failures.length})
              </h4>
              <ul className="text-xs text-red-900 space-y-1 font-mono">
                {report.failures.map((f) => (
                  <li key={`${f.rowNumber}-${f.candidateId}`}>
                    Row {f.rowNumber} ({f.candidateId || 'No ID'} / {f.fullName || 'Unnamed'}): {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

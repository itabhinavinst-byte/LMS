import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { db, logActivity } from './db.ts';
import { generateUniqueStudentUsername, hashPassword } from './security.ts';

export interface ParsedExcelRow {
  rowNumber: number;
  raw: Record<string, string>;
}

export interface ParsedWorkbookResult {
  fileName: string;
  sheetName: string;
  headerRow: number;
  headers: string[];
  rows: ParsedExcelRow[];
}

export interface PreviewCourseSummary {
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

export interface PreviewBatchSummary {
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

export type PreviewRowStatus =
  | 'NEW_STUDENT'
  | 'EXISTING_STUDENT'
  | 'MULTI_COURSE'
  | 'DUPLICATE_ENROLLMENT'
  | 'EXCEPTION';

export interface PreviewRowItem {
  rowNumber: number;
  status: PreviewRowStatus;
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

export interface DuplicateCandidateGroup {
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

export interface ImportPreviewReport {
  previewId?: string;
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

export interface ImportCommitReport {
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
  enrolledUserIds: number[];
}

// Canonical header lookup (case/punctuation insensitive)
const HEADER_ALIASES: Record<string, string[]> = {
  Salutation: ['salutation'],
  FullName: ['fullname', 'full name', 'studentname', 'student name', 'candidatename', 'candidate name'],
  Gender: ['gender'],
  DateofBirth: ['dateofbirth', 'date of birth', 'dob'],
  EmailID: ['emailid', 'email id', 'email', 'emailaddress', 'email address'],
  MaritalStatus: ['maritalstatus', 'marital status'],
  FathersName: ['fathersname', 'fathername', "father's name", 'fathers name'],
  MothersName: ['mothersname', 'mothername', "mother's name", 'mothers name'],
  GuardiansName: ['guardiansname', 'guardianname', "guardian's name", 'guardians name'],
  Religion: ['religion'],
  Category: ['category'],
  Disability: ['disability'],
  TypeofDisability: ['typeofdisability', 'type of disability'],
  DomicileState: ['domicilestate', 'domicile state'],
  DomicileDistrict: ['domiciledistrict', 'domicile district'],
  IDType: ['idtype', 'id type'],
  TypeofAlternateID: ['typeofalternateid', 'type of alternate id'],
  IDNo: ['idno', 'id no', 'id number'],
  CountryCode: ['countrycode', 'country code'],
  MobileNo: ['mobileno', 'mobile no', 'mobile', 'phonenumber', 'phone number'],
  EducationLevel: ['educationlevel', 'education level', 'qualification'],
  PermanentAddressAddress: ['permanentaddressaddress', 'permanent address', 'permanentaddress'],
  PermanentAddressState: ['permanentaddressstate', 'permanent address state'],
  PermanentAddressDistrict: ['permanentaddressdistrict', 'permanent address district'],
  PermanentAddressPINCode: ['permanentaddresspincode', 'permanent address pincode', 'permanent pincode'],
  PermanentAddressCity: ['permanentaddresscity', 'permanent address city'],
  PermanentAddressTehsil: ['permanentaddresstehsil', 'permanent address tehsil'],
  PermanentAddressConstituency: ['permanentaddressconstituency', 'permanent address constituency'],
  CommunicationSameasPermanentAddress: [
    'communicationsameaspermanentaddress',
    'communicationsameasp',
    'communication same as permanent address',
  ],
  CommunicationAddressState: ['communicationaddressstate', 'communication address state'],
  CommunicationAddressDistrict: ['communicationaddressdistrict', 'communication address district'],
  CommunicationAddressPINCode: ['communicationaddresspincode', 'communication address pincode'],
  CommunicationAddressCity: ['communicationaddresscity', 'communication address city'],
  CommunicationAddressTehsil: ['communicationaddresstehsil', 'communication address tehsil'],
  CommunicationAddressPermanentConstituency: [
    'communicationaddresspermanentconstituency',
    'communication address permanent constituency',
  ],
  PreTrainingStatus: ['pretrainingstatus', 'pre training status'],
  PreviousExperienceSector: ['previousexperiencesector', 'previous experience sector'],
  Noofmonthsofpreviousexperience: ['noofmonthsofpreviousexperience', 'no of months of previous experience'],
  Employed: ['employed'],
  EmploymentStatus: ['employmentstatus', 'employment status'],
  EmploymentDetails: ['employmentdetails', 'employment details'],
  HeardAboutUs: ['heardaboutus', 'heard about us'],
  CandidateID: ['candidateid', 'candidate id'],
  CurrentlyEnrolled: ['currentlyenrolled', 'currently enrolled'],
  Schemes: ['schemes', 'scheme(s)', 'scheme'],
  TrainingStatus: ['trainingstatus', 'training status'],
  CandidateTrainingAttendancePercentage: [
    'candidatetrainingattendancepercentage',
    'candidate training attendance percentage',
  ],
  CandidateCourseFee: ['candidatecoursefee', 'candidate course fee'],
  SDMSEnrolmentNumber: ['sdmsenrolmentnumber', 'sdms enrolment number', 'sdms enrollment number'],
  SkillingCategory: ['skillingcategory', 'skilling category'],
  BatchID: ['batchid', 'batch id'],
  BatchStartDate: ['batchstartdate', 'batch start date'],
  BatchEndDate: ['batchenddate', 'batch end date'],
  TrainerID: ['trainerid', 'trainer id'],
  TrainerName: ['trainername', 'trainer name'],
  CourseId: ['courseid', 'course id'],
  CourseName: ['coursename', 'course name'],
  CourseType: ['coursetype', 'course type'],
  SectorCovered: ['sectorcovered', 'sector covered'],
  CourseFee: ['coursefee', 'course fee'],
  FeePaidBy: ['feepaidby', 'fee paid by'],
  TCID: ['tcid', 'tc id'],
  TCName: ['tcname', 'tc name'],
  TCCentre: ['tccentre', 'tc centre', 'tc center'],
  TCDistrict: ['tcdistrict', 'tc district'],
  TCPINCode: ['tcpincode', 'tc pincode', 'tc pin code'],
  AssessmentthroughMode: ['assessmentthroughmode', 'assessmentthrough(mode)', 'assessment through (mode)'],
  AssessmentAgencyID: ['assessmentagencyid', 'assessment agency id'],
  AssessmentAgencyName: ['assessmentagencyname', 'assessment agency name'],
  AssessorID: ['assessorid', 'assessor id'],
  Assessor: ['assessor'],
  AssessmentFromDate: ['assessmentfromdate', 'assessment from date'],
  AssessmentToDate: ['assessmenttodate', 'assessment to date'],
  CandidateAssessmentStatus: ['candidateassessmentstatus', 'candidate assessment status'],
  AssessmentPercentage: ['assessmentpercentage', 'assessment percentage'],
  Grade: ['grade'],
  CertifyingAgency: ['certifyingagency', 'certifying agency'],
  Certified: ['certified'],
  CertificationDate: ['certificationdate', 'certification date'],
  NameoftheCertificateIssued: ['nameofthecertificateissued', 'name of the certificate issued'],
  PlacementStatus: ['placementstatus', 'placement status'],
  PlacementType: ['placementtype', 'placement type'],
};

const DEDICATED_PROFILE_FIELDS = new Set([
  'Salutation',
  'FullName',
  'Gender',
  'DateofBirth',
  'EmailID',
  'MaritalStatus',
  'FathersName',
  'MothersName',
  'GuardiansName',
  'Religion',
  'Category',
  'Disability',
  'DomicileState',
  'DomicileDistrict',
  'IDType',
  'CountryCode',
  'MobileNo',
  'EducationLevel',
  'PermanentAddressAddress',
  'PermanentAddressState',
  'PermanentAddressDistrict',
  'PermanentAddressPINCode',
  'PermanentAddressCity',
  'PermanentAddressTehsil',
  'CommunicationSameasPermanentAddress',
  'CommunicationAddressState',
  'CommunicationAddressDistrict',
  'CommunicationAddressPINCode',
  'CommunicationAddressCity',
  'CommunicationAddressTehsil',
  'CandidateID',
]);

const DEDICATED_ENROLLMENT_FIELDS = new Set([
  'CandidateID',
  'BatchID',
  'BatchStartDate',
  'BatchEndDate',
  'TrainerID',
  'TrainerName',
  'CourseId',
  'CourseName',
  'CourseType',
  'SectorCovered',
  'CourseFee',
  'CandidateCourseFee',
  'FeePaidBy',
  'SDMSEnrolmentNumber',
  'Schemes',
  'TCID',
  'TCName',
  'AssessmentthroughMode',
  'AssessmentFromDate',
  'AssessmentToDate',
  'NameoftheCertificateIssued',
  'PlacementType',
]);

const ENROLLMENT_EXTRA_CANDIDATES = new Set([
  'CurrentlyEnrolled',
  'TrainingStatus',
  'CandidateTrainingAttendancePercentage',
  'SkillingCategory',
  'TCCentre',
  'TCDistrict',
  'TCPINCode',
  'AssessmentAgencyID',
  'AssessmentAgencyName',
  'AssessorID',
  'Assessor',
  'CandidateAssessmentStatus',
  'AssessmentPercentage',
  'Grade',
  'CertifyingAgency',
  'Certified',
  'CertificationDate',
  'PlacementStatus',
]);

const CORE_HEADER_SIGNATURES = new Set([
  'candidateid',
  'fullname',
  'emailid',
  'courseid',
  'coursename',
  'batchid',
  'mobileno',
  'salutation',
]);

function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NORMALIZED_TO_CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
  NORMALIZED_TO_CANONICAL.set(normalizeKey(canonical), canonical);
  for (const a of aliases) {
    NORMALIZED_TO_CANONICAL.set(normalizeKey(a), canonical);
  }
}

function cellValueToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    return Number.isInteger(val) ? String(val) : String(val);
  }
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (val instanceof Date) {
    const dd = String(val.getUTCDate()).padStart(2, '0');
    const mm = String(val.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = val.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  if (typeof val === 'object') {
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((part) => part.text || '').join('').trim();
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
    if ('result' in val) {
      return cellValueToString((val as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    }
  }
  return String(val).trim();
}

function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c !== '')) rows.push(row);
  }
  return rows;
}

export async function parseExcelWorkbook(buffer: Buffer, fileName: string): Promise<ParsedWorkbookResult> {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (ext === 'csv') {
    const grid = parseCsvLines(buffer.toString('utf8'));
    if (grid.length < 2) {
      throw new Error('CSV file must contain a header row and at least one student row.');
    }
    let headerIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < Math.min(grid.length, 25); i++) {
      const score = grid[i].reduce((acc, h) => acc + (CORE_HEADER_SIGNATURES.has(normalizeKey(h)) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
      }
    }
    const headers = grid[headerIdx];
    const rows: ParsedExcelRow[] = [];
    for (let r = headerIdx + 1; r < grid.length; r++) {
      const raw: Record<string, string> = {};
      let hasData = false;
      for (let c = 0; c < headers.length; c++) {
        const h = headers[c]?.trim();
        if (!h) continue;
        const val = (grid[r][c] || '').trim();
        if (val !== '') {
          raw[h] = val;
          hasData = true;
        }
      }
      if (hasData) {
        rows.push({ rowNumber: r + 1, raw });
      }
    }
    return { fileName, sheetName: 'CSV', headerRow: headerIdx + 1, headers, rows };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.getWorksheet('Sheet1') || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('No worksheet found in the uploaded Excel file.');
  }

  const maxScan = Math.min(sheet.rowCount, 25);
  let headerRowNum = 9;
  let bestScore = -1;

  // Prefer Row 9 if it contains recognizable headers (Book1.xlsx standard)
  const scoreRow = (rNum: number): number => {
    const row = sheet.getRow(rNum);
    let score = 0;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const k = normalizeKey(cellValueToString(cell.value));
      if (CORE_HEADER_SIGNATURES.has(k)) score++;
    });
    return score;
  };

  const row9Score = sheet.rowCount >= 9 ? scoreRow(9) : 0;
  if (row9Score >= 3) {
    headerRowNum = 9;
  } else {
    for (let r = 1; r <= maxScan; r++) {
      const sc = scoreRow(r);
      if (sc > bestScore) {
        bestScore = sc;
        headerRowNum = r;
      }
    }
    if (bestScore < 2) {
      throw new Error(
        'Could not locate required student import headers (CandidateID, FullName, CourseId, CourseName, BatchID) in rows 1–25.'
      );
    }
  }

  const colHeaders = new Map<number, string>();
  const headers: string[] = [];
  sheet.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const label = cellValueToString(cell.value);
    if (label) {
      colHeaders.set(colNumber, label);
      headers.push(label);
    }
  });

  const rows: ParsedExcelRow[] = [];
  for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const raw: Record<string, string> = {};
    let hasData = false;
    colHeaders.forEach((headerName, colNumber) => {
      const val = cellValueToString(row.getCell(colNumber).value);
      if (val !== '') {
        raw[headerName] = val;
        hasData = true;
      }
    });
    if (hasData) {
      rows.push({ rowNumber: r, raw });
    }
  }

  return {
    fileName,
    sheetName: sheet.name,
    headerRow: headerRowNum,
    headers,
    rows,
  };
}

interface NormalizedRecord {
  rowNumber: number;
  fields: Record<string, string>;
  profileExtra: Record<string, string>;
  enrollmentExtra: Record<string, string>;
}

function normalizeRow(row: ParsedExcelRow): NormalizedRecord {
  const fields: Record<string, string> = {};
  const profileExtra: Record<string, string> = {};
  const enrollmentExtra: Record<string, string> = {};

  for (const [origHeader, rawVal] of Object.entries(row.raw)) {
    const val = String(rawVal ?? '').trim();
    if (!val) continue;
    const canonical = NORMALIZED_TO_CANONICAL.get(normalizeKey(origHeader));
    if (canonical) {
      fields[canonical] = val;
      if (ENROLLMENT_EXTRA_CANDIDATES.has(canonical)) {
        enrollmentExtra[origHeader] = val;
      } else if (!DEDICATED_PROFILE_FIELDS.has(canonical) && !DEDICATED_ENROLLMENT_FIELDS.has(canonical)) {
        profileExtra[origHeader] = val;
      }
    } else {
      // Unrecognized custom column — preserve in profileExtra so nothing is ever lost
      profileExtra[origHeader] = val;
    }
  }

  return {
    rowNumber: row.rowNumber,
    fields,
    profileExtra,
    enrollmentExtra,
  };
}

function findExistingCourse(courseId: string, courseName: string) {
  return db
    .prepare(
      `SELECT id, code, source_course_id, name, duration_value, duration_unit
       FROM courses
       WHERE is_deleted = 0
         AND (
           (source_course_id != '' AND UPPER(source_course_id) = UPPER(?))
           OR UPPER(code) = UPPER(?)
           OR LOWER(name) = LOWER(?)
         )
       ORDER BY
         CASE
           WHEN UPPER(source_course_id) = UPPER(?) THEN 0
           WHEN UPPER(code) = UPPER(?) THEN 1
           ELSE 2
         END
       LIMIT 1`
    )
    .get(courseId, courseId, courseName, courseId, courseId) as
    | { id: number; code: string; source_course_id: string; name: string; duration_value: number; duration_unit: string }
    | undefined;
}

function findExistingBatch(batchId: string) {
  return db
    .prepare('SELECT id, batch_code, course_id FROM batches WHERE batch_code = ?')
    .get(batchId) as { id: number; batch_code: string; course_id: number } | undefined;
}

function findExistingStudentByCandidateOrEmail(candidateId: string, email: string) {
  if (candidateId) {
    const byCand = db
      .prepare(
        `SELECT u.id, u.username, u.email, u.full_name, sp.enrollment_number, sp.candidate_id
         FROM student_profiles sp
         JOIN users u ON u.id = sp.user_id
         WHERE UPPER(sp.candidate_id) = UPPER(?)
         LIMIT 1`
      )
      .get(candidateId) as
      | { id: number; username: string; email: string; full_name: string; enrollment_number: string; candidate_id: string }
      | undefined;
    if (byCand) return { matchType: 'CANDIDATE_ID' as const, user: byCand };
  }
  if (email) {
    const byEmail = db
      .prepare(
        `SELECT u.id, u.username, u.email, u.full_name, COALESCE(sp.enrollment_number, '') as enrollment_number, COALESCE(sp.candidate_id, '') as candidate_id
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.role = 'STUDENT' AND LOWER(u.email) = LOWER(?)
         LIMIT 1`
      )
      .get(email) as
      | { id: number; username: string; email: string; full_name: string; enrollment_number: string; candidate_id: string }
      | undefined;
    if (byEmail) {
      if (!byEmail.candidate_id || byEmail.candidate_id.toUpperCase() === candidateId.toUpperCase()) {
        return { matchType: 'EMAIL_MATCH' as const, user: byEmail };
      }
      return { matchType: 'EMAIL_COLLISION' as const, user: byEmail };
    }
  }
  return { matchType: 'NONE' as const, user: undefined };
}

function parseJsonObject(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function formatDurationDisplay(val: number, unit: string): string {
  const n = Number(val) || 1;
  return `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`;
}

export function previewStudentImport(parsed: ParsedWorkbookResult): ImportPreviewReport {
  const normalized = parsed.rows.map(normalizeRow);

  const courseMap = new Map<string, PreviewCourseSummary>();
  const batchMap = new Map<string, PreviewBatchSummary>();
  const candOccurrences = new Map<
    string,
    Array<{ rowNumber: number; fullName: string; email: string; courseId: string; courseName: string; batchId: string }>
  >();

  for (const rec of normalized) {
    const f = rec.fields;
    const candId = f.CandidateID || '';
    const courseId = f.CourseId || '';
    const courseName = f.CourseName || '';
    const batchId = f.BatchID || '';

    if (candId) {
      const list = candOccurrences.get(candId.toUpperCase()) || [];
      list.push({
        rowNumber: rec.rowNumber,
        fullName: f.FullName || '',
        email: f.EmailID || '',
        courseId,
        courseName,
        batchId,
      });
      candOccurrences.set(candId.toUpperCase(), list);
    }

    if (courseId && courseName) {
      const cKey = `${courseId.toUpperCase()}|${courseName.toLowerCase()}`;
      let cEntry = courseMap.get(cKey);
      if (!cEntry) {
        const existingCourse = findExistingCourse(courseId, courseName);
        cEntry = {
          courseId,
          courseName,
          sector: f.SectorCovered || '',
          courseType: f.CourseType || '',
          courseFee: f.CourseFee || f.CandidateCourseFee || '',
          certificateName: f.NameoftheCertificateIssued || '',
          existsInDb: Boolean(existingCourse),
          existingDbId: existingCourse?.id ?? null,
          studentCount: 0,
          batchIds: [],
        };
        courseMap.set(cKey, cEntry);
      }
      cEntry.studentCount++;
      if (batchId && !cEntry.batchIds.includes(batchId)) {
        cEntry.batchIds.push(batchId);
      }
    }

    if (batchId && courseId && courseName) {
      let bEntry = batchMap.get(batchId);
      if (!bEntry) {
        const existingBatch = findExistingBatch(batchId);
        bEntry = {
          batchId,
          courseId,
          courseName,
          startDate: f.BatchStartDate || '',
          endDate: f.BatchEndDate || '',
          trainerId: f.TrainerID || '',
          trainerName: f.TrainerName || '',
          tcId: f.TCID || '',
          tcName: f.TCName || '',
          assessmentFromDate: f.AssessmentFromDate || '',
          assessmentToDate: f.AssessmentToDate || '',
          existsInDb: Boolean(existingBatch),
          studentCount: 0,
        };
        batchMap.set(batchId, bEntry);
      }
      bEntry.studentCount++;
    }
  }

  const duplicateCandidateIds: DuplicateCandidateGroup[] = [];
  for (const [, occs] of candOccurrences.entries()) {
    if (occs.length > 1) {
      const uniqueCourseBatch = new Set(occs.map((o) => `${o.courseId.toUpperCase()}|${o.batchId}`));
      const isMultiCourse = uniqueCourseBatch.size === occs.length;
      duplicateCandidateIds.push({
        candidateId: normalized.find((n) => n.rowNumber === occs[0].rowNumber)?.fields.CandidateID || '',
        fullName: occs[0].fullName,
        email: occs[0].email,
        occurrences: occs.map((o) => ({
          rowNumber: o.rowNumber,
          courseId: o.courseId,
          courseName: o.courseName,
          batchId: o.batchId,
        })),
        reconciliationType: isMultiCourse ? 'MULTI_COURSE' : 'SAME_COURSE_DUPLICATE',
        note: isMultiCourse
          ? 'Same CandidateID enrolled across multiple courses — will reuse 1 student profile and create each course/batch enrollment.'
          : 'Duplicate CandidateID in the same course/batch — will reconcile safely without creating duplicate records.',
      });
    }
  }

  const seenCandCourseInFile = new Set<string>();
  const seenCandInFile = new Set<string>();
  const previewRows: PreviewRowItem[] = [];
  const newStudents: PreviewRowItem[] = [];
  const existingStudents: PreviewRowItem[] = [];
  const exceptions: PreviewRowItem[] = [];

  let existingStudentsMatched = 0;
  let newStudentsCount = 0;
  let newEnrollmentsCount = 0;
  let existingEnrollmentsCount = 0;
  let multiCourseEnrollmentCount = 0;

  for (const rec of normalized) {
    const f = rec.fields;
    const candidateId = f.CandidateID || '';
    const fullName = f.FullName || '';
    const email = f.EmailID || '';
    const mobile = f.MobileNo || '';
    const courseId = f.CourseId || '';
    const courseName = f.CourseName || '';
    const batchId = f.BatchID || '';

    const missing: string[] = [];
    if (!candidateId) missing.push('CandidateID');
    if (!fullName) missing.push('FullName');
    if (!courseId) missing.push('CourseId');
    if (!courseName) missing.push('CourseName');
    if (!batchId) missing.push('BatchID');

    if (missing.length > 0) {
      const item: PreviewRowItem = {
        rowNumber: rec.rowNumber,
        status: 'EXCEPTION',
        candidateId,
        fullName,
        email,
        mobile,
        courseId,
        courseName,
        batchId,
        batchStartDate: f.BatchStartDate || '',
        batchEndDate: f.BatchEndDate || '',
        sdmsEnrolmentNumber: f.SDMSEnrolmentNumber || '',
        existingUserId: null,
        note: `Missing required field(s): ${missing.join(', ')}`,
      };
      previewRows.push(item);
      exceptions.push(item);
      continue;
    }

    const candUpper = candidateId.toUpperCase();
    const candCourseKey = `${candUpper}|${courseId.toUpperCase()}`;
    const lookup = findExistingStudentByCandidateOrEmail(candidateId, email);
    const existingCourse = findExistingCourse(courseId, courseName);

    let alreadyEnrolledInDb = false;
    if (lookup.user && lookup.matchType !== 'EMAIL_COLLISION' && existingCourse) {
      const enr = db
        .prepare('SELECT id FROM enrollments WHERE student_user_id = ? AND course_id = ?')
        .get(lookup.user.id, existingCourse.id);
      alreadyEnrolledInDb = Boolean(enr);
    }

    let status: PreviewRowStatus;
    let note = '';

    if (seenCandCourseInFile.has(candCourseKey)) {
      status = 'DUPLICATE_ENROLLMENT';
      note = 'Duplicate row for same CandidateID & Course in this file — will reconcile safely.';
    } else if (seenCandInFile.has(candUpper)) {
      status = 'MULTI_COURSE';
      note = 'Additional course enrollment for same CandidateID — reuses single student profile.';
      multiCourseEnrollmentCount++;
      if (alreadyEnrolledInDb) {
        existingEnrollmentsCount++;
      } else {
        newEnrollmentsCount++;
      }
    } else if (lookup.user && lookup.matchType !== 'EMAIL_COLLISION') {
      status = 'EXISTING_STUDENT';
      existingStudentsMatched++;
      if (alreadyEnrolledInDb) {
        existingEnrollmentsCount++;
        note = 'Matched existing student & existing enrollment — will preserve non-empty fields and update blanks/extra data.';
      } else {
        newEnrollmentsCount++;
        note =
          lookup.matchType === 'CANDIDATE_ID'
            ? 'Matched existing student by CandidateID — will create new course/batch enrollment.'
            : 'Matched existing student by Email — will attach CandidateID and create enrollment.';
      }
    } else {
      status = 'NEW_STUDENT';
      newStudentsCount++;
      newEnrollmentsCount++;
      note =
        lookup.matchType === 'EMAIL_COLLISION'
          ? 'New CandidateID (email already used by another CandidateID — will create separate profile safely).'
          : 'New student profile and course/batch enrollment will be created.';
    }

    seenCandInFile.add(candUpper);
    seenCandCourseInFile.add(candCourseKey);

    const item: PreviewRowItem = {
      rowNumber: rec.rowNumber,
      status,
      candidateId,
      fullName,
      email,
      mobile,
      courseId,
      courseName,
      batchId,
      batchStartDate: f.BatchStartDate || '',
      batchEndDate: f.BatchEndDate || '',
      sdmsEnrolmentNumber: f.SDMSEnrolmentNumber || '',
      existingUserId: lookup.matchType !== 'EMAIL_COLLISION' ? lookup.user?.id ?? null : null,
      note,
    };

    previewRows.push(item);
    if (status === 'NEW_STUDENT') newStudents.push(item);
    if (status === 'EXISTING_STUDENT') existingStudents.push(item);
  }

  return {
    fileName: parsed.fileName,
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRow,
    totalRowsRead: normalized.length,
    summary: {
      totalRowsRead: normalized.length,
      uniqueCandidatesInFile: candOccurrences.size,
      existingStudentsMatched,
      newStudentsCount,
      newEnrollmentsCount,
      existingEnrollmentsCount,
      duplicateCandidateIdCount: duplicateCandidateIds.length,
      multiCourseEnrollmentCount,
      exceptionCount: exceptions.length,
    },
    detectedCourses: Array.from(courseMap.values()),
    detectedBatches: Array.from(batchMap.values()),
    newStudents,
    existingStudents,
    duplicateCandidateIds,
    exceptions,
    previewRows,
  };
}

function nextEnrollmentNumber(): string {
  const seq = db.prepare('SELECT prefix, last_number FROM enrollment_sequences WHERE id = 1').get() as
    | { prefix: string; last_number: number }
    | undefined;
  const prefix = seq?.prefix || 'AITM';
  const nextNum = (seq?.last_number || 0) + 1;
  db.prepare('UPDATE enrollment_sequences SET last_number = ? WHERE id = 1').run(nextNum);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}

function keepNonEmpty(existing: string | null | undefined, incoming: string | null | undefined): string {
  const inc = String(incoming ?? '').trim();
  const ext = String(existing ?? '').trim();
  return inc !== '' ? inc : ext;
}

function mergeExtraJson(existingJson: string | null | undefined, incoming: Record<string, string>): string {
  const base = parseJsonObject(existingJson);
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== '') {
      base[k] = v;
    }
  }
  return JSON.stringify(base);
}

function parseDdMmYyyyToIso(raw: string): string {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return raw;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function commitStudentImport(
  parsed: ParsedWorkbookResult,
  actor: { id: number | null; full_name: string; role: string }
): ImportCommitReport {
  const preview = previewStudentImport(parsed);
  const normalized = parsed.rows.map(normalizeRow);

  let coursesCreated = 0;
  let coursesReused = 0;
  let batchesCreated = 0;
  let batchesReused = 0;
  let existingStudentsMatched = 0;
  let newStudentProfilesCreated = 0;
  let newEnrollmentsCreated = 0;
  let updatedEnrollments = 0;
  const failures: ImportCommitReport['failures'] = [];

  const courseDbMap = new Map<string, { id: number; courseId: string; courseName: string; durationDisplay: string }>();
  const batchDbMap = new Map<string, { id: number; batchId: string; courseDbId: number; courseId: string; courseName: string; startDate: string; endDate: string }>();
  const courseImportCount = new Map<number, number>();
  const batchImportCount = new Map<number, number>();
  const matchedExistingUserIdsInRun = new Set<number>();
  const createdNewUserIdsInRun = new Set<number>();
  const newlyEnrolledUserIdsInRun = new Set<number>();

  const runTx = db.transaction(() => {
    // 1. Create or reuse every unique Course first
    const uniqueCourses = new Map<string, NormalizedRecord>();
    for (const rec of normalized) {
      const cid = rec.fields.CourseId || '';
      const cname = rec.fields.CourseName || '';
      if (!cid || !cname) continue;
      const key = `${cid.toUpperCase()}|${cname.toLowerCase()}`;
      if (!uniqueCourses.has(key)) uniqueCourses.set(key, rec);
    }

    for (const [key, rec] of uniqueCourses.entries()) {
      const f = rec.fields;
      const courseId = f.CourseId;
      const courseName = f.CourseName;
      const existing = findExistingCourse(courseId, courseName);

      if (existing) {
        coursesReused++;
        // Attach source_course_id / sector / course_type if empty on existing course (never overwrite with blank)
        const cur = db
          .prepare('SELECT source_course_id, sector, course_type, fees, certificate_info FROM courses WHERE id = ?')
          .get(existing.id) as {
          source_course_id: string;
          sector: string;
          course_type: string;
          fees: string;
          certificate_info: string;
        };
        db.prepare(
          `UPDATE courses
           SET source_course_id = ?, sector = ?, course_type = ?, fees = ?, certificate_info = ?, updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          cur.source_course_id || courseId,
          cur.sector || f.SectorCovered || '',
          cur.course_type || f.CourseType || '',
          cur.fees || (f.CourseFee ? `₹${f.CourseFee}` : ''),
          cur.certificate_info || f.NameoftheCertificateIssued || '',
          existing.id
        );
        courseDbMap.set(key, {
          id: existing.id,
          courseId,
          courseName: existing.name,
          durationDisplay: formatDurationDisplay(existing.duration_value, existing.duration_unit),
        });
      } else {
        coursesCreated++;
        const startIso = f.BatchStartDate ? parseDdMmYyyyToIso(f.BatchStartDate) : '';
        const endIso = f.BatchEndDate ? parseDdMmYyyyToIso(f.BatchEndDate) : '';
        const sector = f.SectorCovered || 'Skill Development';
        const courseType = f.CourseType || 'Fee Based';
        const fees = f.CourseFee ? `₹${f.CourseFee}` : '';
        const cert = f.NameoftheCertificateIssued || `${courseName} Certification`;
        const res = db
          .prepare(
            `INSERT INTO courses (
              code, source_course_id, name, short_description, detailed_description,
              image_url, category, sector, course_type,
              duration_value, duration_unit, total_training_hours, level, eligibility,
              mode, fees, start_date, end_date, syllabus_json, certificate_info, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')`
          )
          .run(
            courseId,
            courseId,
            courseName,
            `${courseName} — ${sector} (${courseType}) skill certification program.`,
            `${courseName} (${courseId}) under ${sector} sector. Training Center: ${f.TCName || 'AITM'}. Certificate: ${cert}.`,
            '',
            sector,
            sector,
            courseType,
            2,
            'Months',
            120,
            'Foundation to Intermediate',
            '10th / 12th Pass or Equivalent',
            f.TCName && f.TCName.toLowerCase().includes('online') ? 'Online' : 'Hybrid',
            fees,
            startIso,
            endIso,
            JSON.stringify([]),
            cert
          );
        const newId = Number(res.lastInsertRowid);
        courseDbMap.set(key, {
          id: newId,
          courseId,
          courseName,
          durationDisplay: '2 Months',
        });
      }
    }

    // 2. Create or reuse every unique Batch second
    const uniqueBatches = new Map<string, NormalizedRecord>();
    for (const rec of normalized) {
      const bid = rec.fields.BatchID || '';
      const cid = rec.fields.CourseId || '';
      const cname = rec.fields.CourseName || '';
      if (!bid || !cid || !cname) continue;
      if (!uniqueBatches.has(bid)) uniqueBatches.set(bid, rec);
    }

    for (const [batchId, rec] of uniqueBatches.entries()) {
      const f = rec.fields;
      const cKey = `${f.CourseId.toUpperCase()}|${f.CourseName.toLowerCase()}`;
      const courseEntry = courseDbMap.get(cKey);
      if (!courseEntry) continue;

      const existingBatch = findExistingBatch(batchId);
      if (existingBatch) {
        batchesReused++;
        const curB = db.prepare('SELECT * FROM batches WHERE id = ?').get(existingBatch.id) as Record<string, string>;
        db.prepare(
          `UPDATE batches SET
            start_date = ?, end_date = ?, trainer_id = ?, trainer_name = ?,
            skilling_category = ?, course_type = ?, sector_covered = ?, course_fee = ?,
            fee_paid_by = ?, tc_id = ?, tc_name = ?, tc_centre = ?, tc_district = ?, tc_pincode = ?,
            assessment_mode = ?, assessment_from_date = ?, assessment_to_date = ?,
            certificate_name = ?, placement_type = ?, updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          keepNonEmpty(curB.start_date, f.BatchStartDate),
          keepNonEmpty(curB.end_date, f.BatchEndDate),
          keepNonEmpty(curB.trainer_id, f.TrainerID),
          keepNonEmpty(curB.trainer_name, f.TrainerName),
          keepNonEmpty(curB.skilling_category, f.SkillingCategory),
          keepNonEmpty(curB.course_type, f.CourseType),
          keepNonEmpty(curB.sector_covered, f.SectorCovered),
          keepNonEmpty(curB.course_fee, f.CourseFee),
          keepNonEmpty(curB.fee_paid_by, f.FeePaidBy),
          keepNonEmpty(curB.tc_id, f.TCID),
          keepNonEmpty(curB.tc_name, f.TCName),
          keepNonEmpty(curB.tc_centre, f.TCCentre),
          keepNonEmpty(curB.tc_district, f.TCDistrict),
          keepNonEmpty(curB.tc_pincode, f.TCPINCode),
          keepNonEmpty(curB.assessment_mode, f.AssessmentthroughMode),
          keepNonEmpty(curB.assessment_from_date, f.AssessmentFromDate),
          keepNonEmpty(curB.assessment_to_date, f.AssessmentToDate),
          keepNonEmpty(curB.certificate_name, f.NameoftheCertificateIssued),
          keepNonEmpty(curB.placement_type, f.PlacementType),
          existingBatch.id
        );
        batchDbMap.set(batchId, {
          id: existingBatch.id,
          batchId,
          courseDbId: courseEntry.id,
          courseId: courseEntry.courseId,
          courseName: courseEntry.courseName,
          startDate: keepNonEmpty(curB.start_date, f.BatchStartDate),
          endDate: keepNonEmpty(curB.end_date, f.BatchEndDate),
        });
      } else {
        batchesCreated++;
        const bRes = db
          .prepare(
            `INSERT INTO batches (
              batch_code, course_id, batch_name, start_date, end_date,
              trainer_id, trainer_name, skilling_category, course_type, sector_covered,
              course_fee, fee_paid_by, tc_id, tc_name, tc_centre, tc_district, tc_pincode,
              assessment_mode, assessment_from_date, assessment_to_date,
              certificate_name, placement_type, extra_fields_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`
          )
          .run(
            batchId,
            courseEntry.id,
            `Batch ${batchId}`,
            f.BatchStartDate || '',
            f.BatchEndDate || '',
            f.TrainerID || '',
            f.TrainerName || '',
            f.SkillingCategory || '',
            f.CourseType || '',
            f.SectorCovered || '',
            f.CourseFee || '',
            f.FeePaidBy || '',
            f.TCID || '',
            f.TCName || '',
            f.TCCentre || '',
            f.TCDistrict || '',
            f.TCPINCode || '',
            f.AssessmentthroughMode || '',
            f.AssessmentFromDate || '',
            f.AssessmentToDate || '',
            f.NameoftheCertificateIssued || '',
            f.PlacementType || ''
          );
        batchDbMap.set(batchId, {
          id: Number(bRes.lastInsertRowid),
          batchId,
          courseDbId: courseEntry.id,
          courseId: courseEntry.courseId,
          courseName: courseEntry.courseName,
          startDate: f.BatchStartDate || '',
          endDate: f.BatchEndDate || '',
        });
      }
    }

    // 3. Upsert every student profile & enrollment
    for (const rec of normalized) {
      const f = rec.fields;
      const candidateId = f.CandidateID || '';
      const fullName = f.FullName || '';
      const rawEmail = f.EmailID || '';
      const courseId = f.CourseId || '';
      const courseName = f.CourseName || '';
      const batchId = f.BatchID || '';

      if (!candidateId || !fullName || !courseId || !courseName || !batchId) {
        failures.push({
          rowNumber: rec.rowNumber,
          candidateId,
          fullName,
          courseName,
          batchId,
          reason: 'Missing required identifier (CandidateID, FullName, CourseId, CourseName, or BatchID).',
        });
        continue;
      }

      const cKey = `${courseId.toUpperCase()}|${courseName.toLowerCase()}`;
      const courseEntry = courseDbMap.get(cKey);
      const batchEntry = batchDbMap.get(batchId);
      if (!courseEntry || !batchEntry) {
        failures.push({
          rowNumber: rec.rowNumber,
          candidateId,
          fullName,
          courseName,
          batchId,
          reason: 'Unable to resolve Course or Batch target.',
        });
        continue;
      }

      const lookup = findExistingStudentByCandidateOrEmail(candidateId, rawEmail);
      let studentUserId: number;
      let studentEnrollmentNumber: string;

      if (lookup.user && lookup.matchType !== 'EMAIL_COLLISION') {
        studentUserId = lookup.user.id;
        if (!createdNewUserIdsInRun.has(studentUserId) && !matchedExistingUserIdsInRun.has(studentUserId)) {
          existingStudentsMatched++;
          matchedExistingUserIdsInRun.add(studentUserId);
        }

        const existingProf = db
          .prepare('SELECT * FROM student_profiles WHERE user_id = ?')
          .get(studentUserId) as Record<string, string> | undefined;

        if (existingProf) {
          studentEnrollmentNumber = existingProf.enrollment_number || nextEnrollmentNumber();
          const mergedProfileExtra = mergeExtraJson(existingProf.source_extra_fields, rec.profileExtra);
          db.prepare(
            `UPDATE student_profiles SET
              candidate_id = ?, salutation = ?, mobile = ?, dob = ?, gender = ?,
              qualification = ?, city = ?, state = ?,
              marital_status = ?, fathers_name = ?, mothers_name = ?, guardians_name = ?,
              religion = ?, category = ?, disability = ?, domicile_state = ?, domicile_district = ?,
              id_type = ?, country_code = ?, permanent_address = ?, permanent_district = ?,
              permanent_pincode = ?, permanent_tehsil = ?, comm_same_as_permanent = ?,
              comm_state = ?, comm_district = ?, comm_pincode = ?, comm_city = ?, comm_tehsil = ?,
              source_extra_fields = ?, updated_at = datetime('now')
             WHERE user_id = ?`
          ).run(
            keepNonEmpty(existingProf.candidate_id, candidateId),
            keepNonEmpty(existingProf.salutation, f.Salutation),
            keepNonEmpty(existingProf.mobile, f.MobileNo),
            keepNonEmpty(existingProf.dob, f.DateofBirth),
            keepNonEmpty(existingProf.gender, f.Gender),
            keepNonEmpty(existingProf.qualification, f.EducationLevel),
            keepNonEmpty(existingProf.city, f.PermanentAddressCity || f.CommunicationAddressCity),
            keepNonEmpty(existingProf.state, f.PermanentAddressState || f.DomicileState),
            keepNonEmpty(existingProf.marital_status, f.MaritalStatus),
            keepNonEmpty(existingProf.fathers_name, f.FathersName),
            keepNonEmpty(existingProf.mothers_name, f.MothersName),
            keepNonEmpty(existingProf.guardians_name, f.GuardiansName),
            keepNonEmpty(existingProf.religion, f.Religion),
            keepNonEmpty(existingProf.category, f.Category),
            keepNonEmpty(existingProf.disability, f.Disability),
            keepNonEmpty(existingProf.domicile_state, f.DomicileState),
            keepNonEmpty(existingProf.domicile_district, f.DomicileDistrict),
            keepNonEmpty(existingProf.id_type, f.IDType),
            keepNonEmpty(existingProf.country_code, f.CountryCode),
            keepNonEmpty(existingProf.permanent_address, f.PermanentAddressAddress),
            keepNonEmpty(existingProf.permanent_district, f.PermanentAddressDistrict),
            keepNonEmpty(existingProf.permanent_pincode, f.PermanentAddressPINCode),
            keepNonEmpty(existingProf.permanent_tehsil, f.PermanentAddressTehsil),
            keepNonEmpty(existingProf.comm_same_as_permanent, f.CommunicationSameasPermanentAddress),
            keepNonEmpty(existingProf.comm_state, f.CommunicationAddressState),
            keepNonEmpty(existingProf.comm_district, f.CommunicationAddressDistrict),
            keepNonEmpty(existingProf.comm_pincode, f.CommunicationAddressPINCode),
            keepNonEmpty(existingProf.comm_city, f.CommunicationAddressCity),
            keepNonEmpty(existingProf.comm_tehsil, f.CommunicationAddressTehsil),
            mergedProfileExtra,
            studentUserId
          );
        } else {
          studentEnrollmentNumber = nextEnrollmentNumber();
          db.prepare(
            `INSERT INTO student_profiles (
              user_id, enrollment_number, candidate_id, salutation, mobile, dob, gender,
              qualification, city, state, marital_status, fathers_name, mothers_name, guardians_name,
              religion, category, disability, domicile_state, domicile_district, id_type, country_code,
              permanent_address, permanent_district, permanent_pincode, permanent_tehsil,
              comm_same_as_permanent, comm_state, comm_district, comm_pincode, comm_city, comm_tehsil,
              source_extra_fields
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            studentUserId,
            studentEnrollmentNumber,
            candidateId,
            f.Salutation || '',
            f.MobileNo || '',
            f.DateofBirth || '',
            f.Gender || '',
            f.EducationLevel || '',
            f.PermanentAddressCity || f.CommunicationAddressCity || '',
            f.PermanentAddressState || f.DomicileState || '',
            f.MaritalStatus || '',
            f.FathersName || '',
            f.MothersName || '',
            f.GuardiansName || '',
            f.Religion || '',
            f.Category || '',
            f.Disability || '',
            f.DomicileState || '',
            f.DomicileDistrict || '',
            f.IDType || '',
            f.CountryCode || '',
            f.PermanentAddressAddress || '',
            f.PermanentAddressDistrict || '',
            f.PermanentAddressPINCode || '',
            f.PermanentAddressTehsil || '',
            f.CommunicationSameasPermanentAddress || '',
            f.CommunicationAddressState || '',
            f.CommunicationAddressDistrict || '',
            f.CommunicationAddressPINCode || '',
            f.CommunicationAddressCity || '',
            f.CommunicationAddressTehsil || '',
            JSON.stringify(rec.profileExtra)
          );
        }
      } else {
        // Create brand-new student account
        studentEnrollmentNumber = nextEnrollmentNumber();
        const username = generateUniqueStudentUsername(fullName);
        let loginEmail = rawEmail.trim();
        if (!loginEmail || lookup.matchType === 'EMAIL_COLLISION') {
          loginEmail = `${candidateId.toLowerCase()}@aitm-student.local`;
        }
        // Double check email uniqueness in users table
        const emailExists = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(loginEmail);
        if (emailExists) {
          loginEmail = `${candidateId.toLowerCase()}-${crypto.randomBytes(2).toString('hex')}@aitm-student.local`;
        }

        const passwordHash = hashPassword(studentEnrollmentNumber);
        const uRes = db
          .prepare(
            `INSERT INTO users (username, email, password_hash, role, full_name, is_active, must_change_password)
             VALUES (?, ?, ?, 'STUDENT', ?, 1, 1)`
          )
          .run(username, loginEmail, passwordHash, fullName);
        studentUserId = Number(uRes.lastInsertRowid);
        newStudentProfilesCreated++;
        createdNewUserIdsInRun.add(studentUserId);

        const profileExtraObj = { ...rec.profileExtra };
        if (rawEmail && loginEmail.toLowerCase() !== rawEmail.toLowerCase()) {
          profileExtraObj.OriginalSourceEmailID = rawEmail;
        }

        db.prepare(
          `INSERT INTO student_profiles (
            user_id, enrollment_number, candidate_id, salutation, mobile, dob, gender,
            qualification, city, state, marital_status, fathers_name, mothers_name, guardians_name,
            religion, category, disability, domicile_state, domicile_district, id_type, country_code,
            permanent_address, permanent_district, permanent_pincode, permanent_tehsil,
            comm_same_as_permanent, comm_state, comm_district, comm_pincode, comm_city, comm_tehsil,
            source_extra_fields
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          studentUserId,
          studentEnrollmentNumber,
          candidateId,
          f.Salutation || '',
          f.MobileNo || '',
          f.DateofBirth || '',
          f.Gender || '',
          f.EducationLevel || '',
          f.PermanentAddressCity || f.CommunicationAddressCity || '',
          f.PermanentAddressState || f.DomicileState || '',
          f.MaritalStatus || '',
          f.FathersName || '',
          f.MothersName || '',
          f.GuardiansName || '',
          f.Religion || '',
          f.Category || '',
          f.Disability || '',
          f.DomicileState || '',
          f.DomicileDistrict || '',
          f.IDType || '',
          f.CountryCode || '',
          f.PermanentAddressAddress || '',
          f.PermanentAddressDistrict || '',
          f.PermanentAddressPINCode || '',
          f.PermanentAddressTehsil || '',
          f.CommunicationSameasPermanentAddress || '',
          f.CommunicationAddressState || '',
          f.CommunicationAddressDistrict || '',
          f.CommunicationAddressPINCode || '',
          f.CommunicationAddressCity || '',
          f.CommunicationAddressTehsil || '',
          JSON.stringify(profileExtraObj)
        );
      }

      // Create or update enrollment in exact matching (course_id, batch_id)
      const existingEnrollment = db
        .prepare('SELECT * FROM enrollments WHERE student_user_id = ? AND course_id = ?')
        .get(studentUserId, courseEntry.id) as Record<string, unknown> | undefined;

      const enrollmentExtraObj: Record<string, string> = { ...rec.enrollmentExtra };
      if (f.BatchStartDate) enrollmentExtraObj.BatchStartDate = f.BatchStartDate;
      if (f.BatchEndDate) enrollmentExtraObj.BatchEndDate = f.BatchEndDate;
      if (f.CourseId) enrollmentExtraObj.CourseId = f.CourseId;

      if (existingEnrollment) {
        const mergedEnrExtra = mergeExtraJson(String(existingEnrollment.source_extra_fields || '{}'), enrollmentExtraObj);
        db.prepare(
          `UPDATE enrollments SET
            batch_id = ?, batch_name = ?, batch_code_snapshot = ?,
            candidate_id_snapshot = ?, sdms_enrolment_number = ?, scheme_name = ?,
            candidate_course_fee = ?, fee_paid_by = ?, tc_id = ?, tc_name = ?,
            assessment_mode = ?, assessment_from_date = ?, assessment_to_date = ?,
            certificate_name = ?, placement_type = ?,
            enrollment_type = ?, payment_status = ?,
            source_extra_fields = ?, updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          batchEntry.id,
          `Batch ${batchId}`,
          batchId,
          keepNonEmpty(String(existingEnrollment.candidate_id_snapshot || ''), candidateId),
          keepNonEmpty(String(existingEnrollment.sdms_enrolment_number || ''), f.SDMSEnrolmentNumber),
          keepNonEmpty(String(existingEnrollment.scheme_name || ''), f.Schemes),
          keepNonEmpty(String(existingEnrollment.candidate_course_fee || ''), f.CandidateCourseFee || f.CourseFee),
          keepNonEmpty(String(existingEnrollment.fee_paid_by || ''), f.FeePaidBy),
          keepNonEmpty(String(existingEnrollment.tc_id || ''), f.TCID),
          keepNonEmpty(String(existingEnrollment.tc_name || ''), f.TCName),
          keepNonEmpty(String(existingEnrollment.assessment_mode || ''), f.AssessmentthroughMode),
          keepNonEmpty(String(existingEnrollment.assessment_from_date || ''), f.AssessmentFromDate),
          keepNonEmpty(String(existingEnrollment.assessment_to_date || ''), f.AssessmentToDate),
          keepNonEmpty(String(existingEnrollment.certificate_name || ''), f.NameoftheCertificateIssued),
          keepNonEmpty(String(existingEnrollment.placement_type || ''), f.PlacementType),
          keepNonEmpty(String(existingEnrollment.enrollment_type || ''), f.CourseType || 'Fee Based'),
          keepNonEmpty(String(existingEnrollment.payment_status || ''), f.FeePaidBy || 'Self-Paid'),
          mergedEnrExtra,
          existingEnrollment.id
        );
        updatedEnrollments++;
      } else {
        // Generate unique enrollment_number for this course enrollment
        let rowEnrollmentNumber = studentEnrollmentNumber;
        const enrNumInUse = db
          .prepare('SELECT id FROM enrollments WHERE enrollment_number = ?')
          .get(rowEnrollmentNumber);
        if (enrNumInUse) {
          rowEnrollmentNumber = nextEnrollmentNumber();
        }

        const enrollDateIso = f.BatchStartDate ? parseDdMmYyyyToIso(f.BatchStartDate) : new Date().toISOString().slice(0, 10);

        db.prepare(
          `INSERT INTO enrollments (
            student_user_id, course_id, batch_id, enrollment_number,
            candidate_id_snapshot, batch_code_snapshot,
            student_name_snapshot, student_email_snapshot, student_mobile_snapshot,
            course_name_snapshot, course_duration_snapshot,
            enrollment_date, status, progress_percent, batch_name,
            enrollment_type, payment_status,
            sdms_enrolment_number, scheme_name, candidate_course_fee, fee_paid_by,
            tc_id, tc_name, assessment_mode, assessment_from_date, assessment_to_date,
            certificate_name, placement_type, source_extra_fields
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          studentUserId,
          courseEntry.id,
          batchEntry.id,
          rowEnrollmentNumber,
          candidateId,
          batchId,
          fullName,
          rawEmail || `${candidateId.toLowerCase()}@aitm-student.local`,
          f.MobileNo || '',
          courseEntry.courseName,
          courseEntry.durationDisplay,
          enrollDateIso,
          `Batch ${batchId}`,
          f.CourseType || 'Fee Based',
          f.FeePaidBy || 'Self-Paid',
          f.SDMSEnrolmentNumber || '',
          f.Schemes || '',
          f.CandidateCourseFee || f.CourseFee || '',
          f.FeePaidBy || '',
          f.TCID || '',
          f.TCName || '',
          f.AssessmentthroughMode || '',
          f.AssessmentFromDate || '',
          f.AssessmentToDate || '',
          f.NameoftheCertificateIssued || '',
          f.PlacementType || '',
          JSON.stringify(enrollmentExtraObj)
        );
        newEnrollmentsCreated++;
        newlyEnrolledUserIdsInRun.add(studentUserId);
      }

      courseImportCount.set(courseEntry.id, (courseImportCount.get(courseEntry.id) || 0) + 1);
      batchImportCount.set(batchEntry.id, (batchImportCount.get(batchEntry.id) || 0) + 1);
    }

    logActivity({
      actorUserId: actor.id && actor.id > 0 ? actor.id : null,
      actorName: actor.full_name,
      actorRole: actor.role,
      action: 'EXCEL_STUDENT_IMPORT',
      entityType: 'enrollment',
      entityId: parsed.fileName,
      details: `Imported ${parsed.fileName} (${normalized.length} rows): ${newStudentProfilesCreated} new students, ${existingStudentsMatched} existing matched, ${newEnrollmentsCreated} new enrollments, ${updatedEnrollments} updated, ${failures.length} failed.`,
    });
  });

  runTx();

  const courseCounts = Array.from(courseDbMap.values()).map((c) => {
    const dbTotal = (
      db.prepare('SELECT COUNT(*) as c FROM enrollments WHERE course_id = ?').get(c.id) as { c: number }
    ).c;
    return {
      courseDbId: c.id,
      courseId: c.courseId,
      courseName: c.courseName,
      importedRows: courseImportCount.get(c.id) || 0,
      totalEnrolledInDb: dbTotal,
    };
  });

  const batchCounts = Array.from(batchDbMap.values()).map((b) => {
    const dbTotal = (
      db.prepare('SELECT COUNT(*) as c FROM enrollments WHERE batch_id = ?').get(b.id) as { c: number }
    ).c;
    return {
      batchDbId: b.id,
      batchId: b.batchId,
      courseId: b.courseId,
      courseName: b.courseName,
      startDate: b.startDate,
      endDate: b.endDate,
      importedRows: batchImportCount.get(b.id) || 0,
      totalEnrolledInDb: dbTotal,
    };
  });

  return {
    totalRowsRead: normalized.length,
    existingStudentsMatched,
    newStudentProfilesCreated,
    newEnrollmentsCreated,
    updatedEnrollments,
    duplicateRecordsDetected: preview.duplicateCandidateIds.length,
    failedImports: failures.length,
    coursesCreated,
    coursesReused,
    batchesCreated,
    batchesReused,
    courseCounts,
    batchCounts,
    duplicates: preview.duplicateCandidateIds,
    failures,
    enrolledUserIds: Array.from(newlyEnrolledUserIdsInRun),
  };
}

import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {
  db,
  logActivity,
  PRIVATE_UPLOAD_DIR,
  PUBLIC_UPLOAD_DIR,
} from './db.ts';
import {
  buildEnrollmentWelcomeEmail,
  buildStudentCredentialsEmail,
  getEmailProviderStatus,
  getEnrolledStudentsEmailOverview,
  getSmtpConfig,
  resendLoggedEmail,
  runBulkStudentCredentialsCampaign,
  sendCredentialsEmailToStudent,
  sendLoggedEmail,
} from './mailer.ts';
import {
  commitStudentImport,
  parseExcelWorkbook,
  previewStudentImport,
  type ParsedWorkbookResult,
} from './excelImport.ts';
import { broadcastEvent } from './realtime.ts';
import {
  createSession,
  generateUniqueStudentUsername,
  hashPassword,
  hashResetToken,
  hashToken,
  rateLimit,
  requireAdmin,
  requireAuth,
  requireStudent,
  requireSuperAdmin,
  resolveConfinedPath,
  revokeAllUserSessions,
  revokeSession,
  sanitizeUrl,
  verifyPassword,
} from './security.ts';

const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.ico']);
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

const ALLOWED_RESOURCE_EXT = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.zip',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.mov',
  '.txt',
]);

const ALLOWED_RESOURCE_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'text/plain',
  'application/octet-stream',
]);

const publicImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PUBLIC_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXT.has(ext) || !ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      cb(new Error('Only valid image files (PNG, JPG, WEBP, GIF, SVG, ICO) up to 5MB are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const privateMaterialUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PRIVATE_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_RESOURCE_EXT.has(ext) || !ALLOWED_RESOURCE_MIME.has(file.mimetype)) {
      cb(
        new Error(
          'Unsupported file type. Allowed: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, ZIP, Images, and Videos (max 50MB).'
        )
      );
      return;
    }
    cb(null, true);
  },
});

const ALLOWED_IMPORT_EXT = new Set(['.xlsx', '.csv']);
const ALLOWED_IMPORT_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/octet-stream',
]);

const excelImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMPORT_EXT.has(ext) || !ALLOWED_IMPORT_MIME.has(file.mimetype)) {
      cb(new Error('Only Excel (.xlsx) or CSV (.csv) files up to 15MB are allowed for student import.'));
      return;
    }
    cb(null, true);
  },
});

const EXCEL_PREVIEW_CACHE = new Map<
  string,
  { parsed: ParsedWorkbookResult; adminUserId: number; createdAt: number }
>();

function pruneExcelPreviewCache(): void {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [k, entry] of EXCEL_PREVIEW_CACHE.entries()) {
    if (entry.createdAt < cutoff) {
      EXCEL_PREVIEW_CACHE.delete(k);
    }
  }
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatDuration(value: number, unit: string): string {
  const v = Number(value) || 1;
  const normalizedUnit = v === 1 ? unit.replace(/s$/, '') : unit;
  return `${v} ${normalizedUnit}`;
}

function formatSettingsRow(row: Record<string, unknown>) {
  return {
    ...row,
    achievements: safeParseJson(String(row.achievements_json || '[]'), []),
    management: safeParseJson(String(row.management_json || '[]'), []),
    social_links: safeParseJson(String(row.social_links_json || '{}'), {}),
    certifications: safeParseJson(String(row.certifications_json || '[]'), []),
    affiliations: safeParseJson(String(row.affiliations_json || '[]'), []),
  };
}

function formatCourseRow(row: Record<string, unknown>) {
  return {
    ...row,
    duration_display: formatDuration(Number(row.duration_value), String(row.duration_unit || 'Months')),
    syllabus: safeParseJson<string[]>(String(row.syllabus_json || '[]'), []),
  };
}

function getPortalBaseUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function notifyCourseStudents(courseId: number | null, type: string, title: string, message: string, link: string) {
  let studentIds: number[] = [];
  if (courseId === null) {
    studentIds = (
      db.prepare("SELECT id FROM users WHERE role = 'STUDENT' AND is_active = 1").all() as Array<{ id: number }>
    ).map((r) => r.id);
  } else {
    studentIds = (
      db
        .prepare("SELECT DISTINCT student_user_id as id FROM enrollments WHERE course_id = ? AND status IN ('ACTIVE', 'COMPLETED')")
        .all(courseId) as Array<{ id: number }>
    ).map((r) => r.id);
  }
  const stmt = db.prepare(
    'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
  );
  const insertAll = db.transaction((ids: number[]) => {
    for (const uid of ids) {
      stmt.run(uid, type, title, message, link);
    }
  });
  if (studentIds.length > 0) {
    insertAll(studentIds);
    broadcastEvent('notifications:new', { courseId, type });
  }
}

interface EnrollmentTransactionResult {
  enrollmentId: number;
  enrollmentNumber: string;
  employeeCode: string;
  studentUserId: number;
  username: string;
  isNewAccount: boolean;
  temporaryPassword: string | null;
  studentName: string;
  studentEmail: string;
  courseName: string;
  enrollmentType: string;
  paymentStatus: string;
  status: string;
}

export const createEnrollmentAtomic = db.transaction(
  (params: {
    fullName: string;
    email: string;
    mobile: string;
    dob: string;
    gender: string;
    qualification: string;
    city: string;
    state: string;
    employeeCode?: string;
    courseId: number;
    batchName?: string;
    enrollmentType?: string;
    paymentStatus?: string;
    status?: 'ACTIVE' | 'COMPLETED' | 'DROPPED' | 'SUSPENDED';
    applicationId?: number | null;
    adminUserId: number;
    adminName: string;
    adminRole: string;
  }): EnrollmentTransactionResult => {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanEmployeeCode = String(params.employeeCode || '').trim();
    const cleanEnrollmentType = String(params.enrollmentType || 'Regular').trim() || 'Regular';
    const cleanPaymentStatus = String(params.paymentStatus || 'Pending').trim() || 'Pending';
    const cleanStatus = ['ACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED'].includes(String(params.status || 'ACTIVE'))
      ? (String(params.status || 'ACTIVE') as 'ACTIVE' | 'COMPLETED' | 'DROPPED' | 'SUSPENDED')
      : 'ACTIVE';

    const course = db
      .prepare('SELECT id, name, duration_value, duration_unit, is_deleted FROM courses WHERE id = ?')
      .get(params.courseId) as
      | { id: number; name: string; duration_value: number; duration_unit: string; is_deleted: number }
      | undefined;

    if (!course || course.is_deleted) {
      throw new Error('Selected course was not found or has been archived.');
    }

    // Check existing student user by email (case-insensitive)
    const existingUser = db
      .prepare('SELECT id, username, email, role, full_name FROM users WHERE LOWER(email) = ?')
      .get(cleanEmail) as
      | { id: number; username: string; email: string; role: string; full_name: string }
      | undefined;

    if (existingUser && existingUser.role !== 'STUDENT') {
      throw new Error('This email address belongs to an administrator account and cannot be enrolled as a student.');
    }

    if (existingUser) {
      const dupEnroll = db
        .prepare('SELECT id, enrollment_number FROM enrollments WHERE student_user_id = ? AND course_id = ?')
        .get(existingUser.id, course.id) as { id: number; enrollment_number: string } | undefined;
      if (dupEnroll) {
        throw new Error(
          `Student is already enrolled in ${course.name} under enrollment number ${dupEnroll.enrollment_number}.`
        );
      }
    }

    // Atomically increment persistent monotonic sequence (never reset on delete!)
    db.prepare('UPDATE enrollment_sequences SET last_number = last_number + 1 WHERE id = 1').run();
    const seq = db.prepare('SELECT prefix, last_number FROM enrollment_sequences WHERE id = 1').get() as {
      prefix: string;
      last_number: number;
    };
    const enrollmentNumber = `${seq.prefix}${seq.last_number}`;

    let studentUserId: number;
    let username: string;
    let isNewAccount = false;
    let temporaryPassword: string | null = null;
    let resolvedEmployeeCode = cleanEmployeeCode;

    if (!existingUser) {
      isNewAccount = true;
      username = generateUniqueStudentUsername(params.fullName);
      temporaryPassword = enrollmentNumber; // Initial temporary password = Enrollment Number
      const passwordHash = hashPassword(temporaryPassword);

      const uRes = db
        .prepare(
          `INSERT INTO users (username, email, password_hash, role, full_name, is_active, must_change_password)
           VALUES (?, ?, ?, 'STUDENT', ?, 1, 1)`
        )
        .run(username, cleanEmail, passwordHash, params.fullName.trim());

      studentUserId = Number(uRes.lastInsertRowid);

      db.prepare(
        `INSERT INTO student_profiles (
          user_id, enrollment_number, employee_code, mobile, dob, gender, qualification, city, state, account_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`
      ).run(
        studentUserId,
        enrollmentNumber,
        cleanEmployeeCode,
        params.mobile.trim(),
        params.dob.trim(),
        params.gender.trim(),
        params.qualification.trim(),
        params.city.trim(),
        params.state.trim()
      );
    } else {
      studentUserId = existingUser.id;
      username = existingUser.username;
      const existingProfile = db
        .prepare('SELECT employee_code FROM student_profiles WHERE user_id = ?')
        .get(studentUserId) as { employee_code: string } | undefined;
      if (cleanEmployeeCode && (!existingProfile || !existingProfile.employee_code)) {
        if (existingProfile) {
          db.prepare(
            `UPDATE student_profiles SET employee_code = ?, updated_at = datetime('now') WHERE user_id = ?`
          ).run(cleanEmployeeCode, studentUserId);
        } else {
          db.prepare(
            `INSERT INTO student_profiles (user_id, enrollment_number, employee_code, account_status)
             VALUES (?, ?, ?, 'ACTIVE')`
          ).run(studentUserId, enrollmentNumber, cleanEmployeeCode);
        }
      } else if (!cleanEmployeeCode && existingProfile?.employee_code) {
        resolvedEmployeeCode = existingProfile.employee_code;
      }
    }

    const durationDisplay = formatDuration(course.duration_value, course.duration_unit);
    const enrollRes = db
      .prepare(
        `INSERT INTO enrollments (
          student_user_id, course_id, enrollment_number, employee_code_snapshot,
          student_name_snapshot, student_email_snapshot, student_mobile_snapshot,
          course_name_snapshot, course_duration_snapshot,
          enrollment_date, status, progress_percent, batch_name,
          enrollment_type, payment_status, application_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, 0, ?, ?, ?, ?)`
      )
      .run(
        studentUserId,
        course.id,
        enrollmentNumber,
        resolvedEmployeeCode,
        params.fullName.trim(),
        cleanEmail,
        params.mobile.trim(),
        course.name,
        durationDisplay,
        cleanStatus,
        (params.batchName || 'Batch 2026').trim(),
        cleanEnrollmentType,
        cleanPaymentStatus,
        params.applicationId ?? null
      );

    const enrollmentId = Number(enrollRes.lastInsertRowid);

    if (params.applicationId) {
      db.prepare(
        `UPDATE applications
         SET status = 'APPROVED', reviewed_by = ?, reviewed_at = datetime('now'),
             enrollment_id = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(params.adminUserId, enrollmentId, params.applicationId);
    }

    db.prepare(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES (?, 'ENROLLMENT', ?, ?, '/student/dashboard')`
    ).run(
      studentUserId,
      `Enrolled in ${course.name}`,
      `Your ${cleanEnrollmentType} enrollment (${enrollmentNumber}) in ${course.name} is active. Access course modules and materials from your Student Dashboard.`
    );

    logActivity({
      actorUserId: params.adminUserId,
      actorName: params.adminName,
      actorRole: params.adminRole,
      action: 'STUDENT_ENROLLED',
      entityType: 'enrollment',
      entityId: enrollmentId,
      details: `${params.fullName.trim()}${resolvedEmployeeCode ? ` [Emp ${resolvedEmployeeCode}]` : ''} enrolled in ${course.name} (${enrollmentNumber}, ${cleanEnrollmentType}, ${cleanPaymentStatus})`,
    });

    return {
      enrollmentId,
      enrollmentNumber,
      employeeCode: resolvedEmployeeCode,
      studentUserId,
      username,
      isNewAccount,
      temporaryPassword,
      studentName: params.fullName.trim(),
      studentEmail: cleanEmail,
      courseName: course.name,
      enrollmentType: cleanEnrollmentType,
      paymentStatus: cleanPaymentStatus,
      status: cleanStatus,
    };
  }
);

export function createApiRouter(): express.Router {
  const router = express.Router();

  // =========================================================================
  // 1. PUBLIC WEBSITE ROUTES
  // =========================================================================

  router.get('/public/settings', (_req, res) => {
    const row = db.prepare('SELECT * FROM institute_settings WHERE id = 1').get() as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Institute settings not initialized.' });
      return;
    }
    res.json({ settings: formatSettingsRow(row) });
  });

  router.get('/public/courses', (req, res) => {
    const category = String(req.query.category || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    let sql = `SELECT * FROM courses WHERE status = 'PUBLISHED' AND is_deleted = 0`;
    const args: unknown[] = [];

    if (category && category !== 'All') {
      sql += ' AND category = ?';
      args.push(category);
    }
    if (search) {
      sql += ' AND (LOWER(name) LIKE ? OR LOWER(short_description) LIKE ? OR LOWER(code) LIKE ? OR LOWER(category) LIKE ?)';
      const pat = `%${search}%`;
      args.push(pat, pat, pat, pat);
    }
    sql += ' ORDER BY created_at DESC';

    const rows = db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
    res.json({ courses: rows.map(formatCourseRow) });
  });

  router.get('/public/courses/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid course ID.' });
      return;
    }
    const row = db
      .prepare("SELECT * FROM courses WHERE id = ? AND status = 'PUBLISHED' AND is_deleted = 0")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    const modules = db
      .prepare('SELECT id, title, description, sort_order FROM course_modules WHERE course_id = ? ORDER BY sort_order ASC, id ASC')
      .all(id);
    res.json({ course: formatCourseRow(row), modules });
  });

  router.post(
    '/public/applications',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'public_apply' }),
    (req, res) => {
      const {
        full_name,
        email,
        mobile,
        dob,
        gender,
        qualification,
        city,
        state,
        course_id,
        additional_info,
      } = req.body || {};

      const fullName = String(full_name || '').trim();
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanMobile = String(mobile || '').trim();
      const cleanDob = String(dob || '').trim();
      const cleanGender = String(gender || '').trim();
      const cleanQualification = String(qualification || '').trim();
      const cleanCity = String(city || '').trim();
      const cleanState = String(state || '').trim();
      const courseId = Number(course_id);

      if (
        !fullName ||
        !cleanEmail ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
        !cleanMobile ||
        cleanMobile.replace(/\D/g, '').length < 10 ||
        !cleanDob ||
        !cleanGender ||
        !cleanQualification ||
        !cleanCity ||
        !cleanState ||
        !Number.isInteger(courseId)
      ) {
        res.status(400).json({ error: 'Please complete all required application fields with valid details.' });
        return;
      }

      const course = db
        .prepare("SELECT id, name FROM courses WHERE id = ? AND status = 'PUBLISHED' AND is_deleted = 0")
        .get(courseId) as { id: number; name: string } | undefined;

      if (!course) {
        res.status(400).json({ error: 'Selected course is not currently open for applications.' });
        return;
      }

      const duplicatePending = db
        .prepare("SELECT application_code FROM applications WHERE email = ? AND course_id = ? AND status = 'PENDING'")
        .get(cleanEmail, courseId) as { application_code: string } | undefined;

      if (duplicatePending) {
        res.status(409).json({
          error: `An active pending application (${duplicatePending.application_code}) already exists for this email and course.`,
        });
        return;
      }

      const year = new Date().getFullYear();
      const totalApps = (db.prepare('SELECT COUNT(*) as c FROM applications').get() as { c: number }).c;
      const appCode = `APP-${year}-${String(totalApps + 1).padStart(4, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      const insert = db
        .prepare(
          `INSERT INTO applications (
            application_code, full_name, email, mobile, dob, gender,
            qualification, city, state, course_id, additional_info, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`
        )
        .run(
          appCode,
          fullName,
          cleanEmail,
          cleanMobile,
          cleanDob,
          cleanGender,
          cleanQualification,
          cleanCity,
          cleanState,
          courseId,
          String(additional_info || '').trim()
        );

      logActivity({
        actorName: fullName,
        actorRole: 'APPLICANT',
        action: 'APPLICATION_SUBMITTED',
        entityType: 'application',
        entityId: Number(insert.lastInsertRowid),
        details: `${fullName} applied for ${course.name} (${appCode})`,
      });

      broadcastEvent('applications:changed');
      broadcastEvent('stats:updated');

      res.status(201).json({
        application: {
          id: Number(insert.lastInsertRowid),
          application_code: appCode,
          course_name: course.name,
          status: 'PENDING',
        },
        message:
          'Your application has been submitted successfully. Our Admissions team will review your details and notify you by email upon approval.',
      });
    }
  );

  router.post(
    '/public/contact',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'public_contact' }),
    (req, res) => {
      const fullName = String(req.body?.full_name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const phone = String(req.body?.phone || '').trim();
      const subject = String(req.body?.subject || '').trim();
      const message = String(req.body?.message || '').trim();

      if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) {
        res.status(400).json({ error: 'Please provide your name, a valid email address, and your message.' });
        return;
      }

      const result = db
        .prepare(
          `INSERT INTO contact_inquiries (full_name, email, phone, subject, message)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(fullName, email, phone, subject || 'General Inquiry', message);

      broadcastEvent('inquiries:changed');

      res.status(201).json({
        id: Number(result.lastInsertRowid),
        message: 'Thank you for contacting AITM. Our counseling team will respond shortly.',
      });
    }
  );

  // =========================================================================
  // 2. AUTHENTICATION ROUTES
  // =========================================================================

  router.get('/auth/admin/status', (_req, res) => {
    const count = (
      db.prepare("SELECT COUNT(*) as c FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')").get() as {
        c: number;
      }
    ).c;
    const envManaged = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
    res.json({ needsSetup: count === 0, envManaged });
  });

  router.post(
    '/auth/admin/setup',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 15, keyPrefix: 'admin_setup' }),
    (req, res) => {
      const fullName = String(req.body?.full_name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Valid administrator name and email address are required.' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }

      try {
        const created = db.transaction(() => {
          const existing = (
            db.prepare("SELECT COUNT(*) as c FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')").get() as {
              c: number;
            }
          ).c;
          if (existing > 0) {
            throw new Error('ALREADY_CONFIGURED');
          }
          const username =
            email.split('@')[0].replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'superadmin';
          const passwordHash = hashPassword(password);
          const uRes = db
            .prepare(
              `INSERT INTO users (username, email, password_hash, role, full_name, is_active, must_change_password)
               VALUES (?, ?, ?, 'SUPER_ADMIN', ?, 1, 0)`
            )
            .run(username, email, passwordHash, fullName);
          const userId = Number(uRes.lastInsertRowid);
          db.prepare(
            `INSERT INTO admin_users (user_id, designation, department, permissions_json)
             VALUES (?, 'Super Administrator', 'Institute Governance', '["ALL"]')`
          ).run(userId);
          return {
            id: userId,
            username,
            email,
            role: 'SUPER_ADMIN' as const,
            full_name: fullName,
            is_active: 1,
            must_change_password: 0,
          };
        })();

        const session = createSession(created);
        logActivity({
          actorUserId: created.id,
          actorName: created.full_name,
          actorRole: created.role,
          action: 'SUPER_ADMIN_INITIALIZED',
          entityType: 'user',
          entityId: created.id,
          details: 'Initial Super Administrator account configured.',
        });

        res.status(201).json({ token: session.token, expiresAt: session.expiresAt, user: created });
      } catch (err) {
        if (err instanceof Error && err.message === 'ALREADY_CONFIGURED') {
          res.status(409).json({ error: 'An administrator account has already been configured. Please sign in.' });
          return;
        }
        res.status(500).json({ error: 'Unable to initialize Super Admin account.' });
      }
    }
  );

  router.post(
    '/auth/admin/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 25, keyPrefix: 'admin_login' }),
    (req, res) => {
      const identifier = String(req.body?.identifier || req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!identifier || !password) {
        res.status(400).json({ error: 'Email or username and password are required.' });
        return;
      }

      const user = db
        .prepare(
          `SELECT id, username, email, password_hash, role, full_name, is_active, must_change_password
           FROM users
           WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND role IN ('ADMIN', 'SUPER_ADMIN')`
        )
        .get(identifier, identifier) as
        | {
            id: number;
            username: string;
            email: string;
            password_hash: string;
            role: 'ADMIN' | 'SUPER_ADMIN';
            full_name: string;
            is_active: number;
            must_change_password: number;
          }
        | undefined;

      if (!user || !verifyPassword(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid administrator credentials.' });
        return;
      }
      if (!user.is_active) {
        res.status(403).json({ error: 'This administrator account is inactive.' });
        return;
      }

      const safeUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
      };
      const session = createSession(safeUser);
      res.json({ token: session.token, expiresAt: session.expiresAt, user: safeUser });
    }
  );

  router.post(
    '/auth/student/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'student_login' }),
    (req, res) => {
      const identifier = String(req.body?.identifier || '').trim();
      const password = String(req.body?.password || '');

      if (!identifier || !password) {
        res.status(400).json({ error: 'Username, Email, Enrollment Number, Candidate ID, or Employee Code and password are required.' });
        return;
      }

      const lowerId = identifier.toLowerCase();
      const upperId = identifier.toUpperCase();

      const user = db
        .prepare(
          `SELECT DISTINCT u.id, u.username, u.email, u.password_hash, u.role, u.full_name, u.is_active, u.must_change_password
           FROM users u
           LEFT JOIN student_profiles sp ON sp.user_id = u.id
           LEFT JOIN enrollments e ON e.student_user_id = u.id
           WHERE u.role = 'STUDENT'
             AND (
               LOWER(u.username) = ?
               OR LOWER(u.email) = ?
               OR UPPER(sp.enrollment_number) = ?
               OR UPPER(e.enrollment_number) = ?
               OR (sp.employee_code != '' AND UPPER(sp.employee_code) = ?)
               OR (e.employee_code_snapshot != '' AND UPPER(e.employee_code_snapshot) = ?)
               OR (sp.candidate_id != '' AND UPPER(sp.candidate_id) = ?)
               OR (e.candidate_id_snapshot != '' AND UPPER(e.candidate_id_snapshot) = ?)
             )`
        )
        .get(lowerId, lowerId, upperId, upperId, upperId, upperId, upperId, upperId) as
        | {
            id: number;
            username: string;
            email: string;
            password_hash: string;
            role: 'STUDENT';
            full_name: string;
            is_active: number;
            must_change_password: number;
          }
        | undefined;

      if (!user || !verifyPassword(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid credentials. Check your identifier and password.' });
        return;
      }

      if (!user.is_active) {
        res.status(403).json({ error: 'Your student account is currently suspended. Contact AITM administration.' });
        return;
      }

      const profile = db
        .prepare('SELECT enrollment_number, employee_code, candidate_id, account_status FROM student_profiles WHERE user_id = ?')
        .get(user.id) as { enrollment_number: string; employee_code: string; candidate_id: string; account_status: string } | undefined;

      const safeUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
        enrollment_number: profile?.enrollment_number || '',
        employee_code: profile?.employee_code || '',
        candidate_id: profile?.candidate_id || '',
      };

      const session = createSession(safeUser);
      res.json({ token: session.token, expiresAt: session.expiresAt, user: safeUser });
    }
  );

  router.post('/auth/logout', requireAuth, (req, res) => {
    if (req.sessionTokenHash) {
      revokeSession(req.sessionTokenHash);
    }
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    const u = req.authUser!;
    let enrollment_number = '';
    let employee_code = '';
    if (u.role === 'STUDENT') {
      const p = db
        .prepare('SELECT enrollment_number, employee_code FROM student_profiles WHERE user_id = ?')
        .get(u.id) as { enrollment_number: string; employee_code: string } | undefined;
      enrollment_number = p?.enrollment_number || '';
      employee_code = p?.employee_code || '';
    }
    res.json({ user: { ...u, enrollment_number, employee_code } });
  });

  router.post('/auth/change-password', requireAuth, (req, res) => {
    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }
    if (currentPassword === newPassword) {
      res.status(400).json({ error: 'New password must be different from your current password.' });
      return;
    }

    const row = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.authUser!.id) as { password_hash: string } | undefined;

    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const newHash = hashPassword(newPassword);
    db.prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(newHash, req.authUser!.id);

    logActivity({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      actorRole: req.authUser!.role,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: req.authUser!.id,
      details: 'User updated account password.',
    });

    res.json({ ok: true, message: 'Password updated successfully.' });
  });

  router.post(
    '/auth/forgot-password',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'forgot_pw' }),
    async (req, res) => {
      const identifier = String(req.body?.identifier || '').trim();
      if (!identifier) {
        res.status(400).json({ error: 'Please enter your email, username, or enrollment number.' });
        return;
      }

      const user = db
        .prepare(
          `SELECT u.id, u.email, u.full_name, COALESCE(sp.enrollment_number, '') as enrollment_number
           FROM users u
           LEFT JOIN student_profiles sp ON sp.user_id = u.id
           WHERE LOWER(u.email) = ?
              OR LOWER(u.username) = ?
              OR UPPER(sp.enrollment_number) = ?
              OR UPPER(sp.candidate_id) = ?
              OR UPPER(sp.employee_code) = ?`
        )
        .get(
          identifier.toLowerCase(),
          identifier.toLowerCase(),
          identifier.toUpperCase(),
          identifier.toUpperCase(),
          identifier.toUpperCase()
        ) as
        | { id: number; email: string; full_name: string; enrollment_number: string }
        | undefined;

      if (user) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashResetToken(rawToken);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        db.prepare(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
        ).run(user.id, tokenHash, expiresAt);

        const portalUrl = getPortalBaseUrl(req);
        const resetUrl = `${portalUrl}/forgot-password?token=${rawToken}`;
        await sendLoggedEmail({
          recipientEmail: user.email,
          recipientName: user.full_name,
          subject: 'AITM Portal – Password Reset Instructions',
          body: `Dear ${user.full_name},\n\nA password reset was requested for your AITM Portal account${user.enrollment_number ? ` (Roll No: ${user.enrollment_number})` : ''}.\n\nUse the secure link below within 60 minutes to set a new password:\n${resetUrl}\n\nReset Token: ${rawToken}\n\nIf you did not request this reset, you can safely ignore this message.\n\nRegards,\nAbhinav Institute of Technology & Management (AITM)`,
          eventType: 'PASSWORD_RESET',
          studentUserId: user.id,
          redactSecret: rawToken,
        });
        broadcastEvent('emails:changed');
      }

      // Generic message to avoid account enumeration
      res.json({
        ok: true,
        message:
          'If an account matches the details provided, password reset instructions have been sent via email. If you need assistance, contact AITM Administration.',
      });
    }
  );

  router.get(
    '/auth/reset-password/verify',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'verify_reset_pw' }),
    (req, res) => {
      const token = String(req.query.token || '').trim();
      if (!token) {
        res.status(400).json({ valid: false, error: 'Missing activation or reset token.' });
        return;
      }

      const tokenHash = hashResetToken(token);
      const record = db
        .prepare(
          `SELECT t.id, t.user_id, t.expires_at, t.used_at, u.full_name, u.email, COALESCE(sp.enrollment_number, '') as roll_number
           FROM password_reset_tokens t
           JOIN users u ON u.id = t.user_id
           LEFT JOIN student_profiles sp ON sp.user_id = u.id
           WHERE t.token_hash = ?`
        )
        .get(tokenHash) as
        | {
            id: number;
            user_id: number;
            expires_at: string;
            used_at: string | null;
            full_name: string;
            email: string;
            roll_number: string;
          }
        | undefined;

      if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
        res.json({ valid: false, error: 'This password setup link is invalid or has expired. Please request a new link below.' });
        return;
      }

      const parts = record.email.split('@');
      const maskedEmail =
        parts.length === 2
          ? `${parts[0].slice(0, 2)}${'*'.repeat(Math.max(2, parts[0].length - 2))}@${parts[1]}`
          : record.email;

      res.json({
        valid: true,
        fullName: record.full_name,
        rollNumber: record.roll_number,
        emailMasked: maskedEmail,
      });
    }
  );

  router.post(
    '/auth/reset-password',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 15, keyPrefix: 'reset_pw' }),
    (req, res) => {
      const token = String(req.body?.token || '').trim();
      const newPassword = String(req.body?.new_password || '');

      if (!token || newPassword.length < 8) {
        res.status(400).json({ error: 'Valid reset token and a new password (min 8 characters) are required.' });
        return;
      }

      const tokenHash = hashResetToken(token);
      const record = db
        .prepare(
          `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?`
        )
        .get(tokenHash) as
        | { id: number; user_id: number; expires_at: string; used_at: string | null }
        | undefined;

      if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
        res.status(400).json({ error: 'Reset token is invalid or has expired.' });
        return;
      }

      db.transaction(() => {
        db.prepare(
          `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`
        ).run(hashPassword(newPassword), record.user_id);
        db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`).run(record.id);
        revokeAllUserSessions(record.user_id);
      })();

      res.json({ ok: true, message: 'Password reset successful. You may now sign in with your new password.' });
    }
  );

  // =========================================================================
  // 3. ADMIN PANEL ROUTES
  // =========================================================================

  router.get('/admin/overview', requireAdmin, (_req, res) => {
    const totalCourses = (
      db.prepare('SELECT COUNT(*) as c FROM courses WHERE is_deleted = 0').get() as { c: number }
    ).c;
    const totalEnrollments = (db.prepare('SELECT COUNT(*) as c FROM enrollments').get() as { c: number }).c;
    const activeStudents = (
      db.prepare("SELECT COUNT(DISTINCT student_user_id) as c FROM enrollments WHERE status = 'ACTIVE'").get() as {
        c: number;
      }
    ).c;
    const completedStudents = (
      db.prepare("SELECT COUNT(DISTINCT student_user_id) as c FROM enrollments WHERE status = 'COMPLETED'").get() as {
        c: number;
      }
    ).c;
    const pendingApplications = (
      db.prepare("SELECT COUNT(*) as c FROM applications WHERE status = 'PENDING'").get() as { c: number }
    ).c;
    const totalMaterials = (
      db.prepare('SELECT COUNT(*) as c FROM learning_resources').get() as { c: number }
    ).c;
    const totalUniqueStudents = (
      db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'STUDENT'").get() as { c: number }
    ).c;

    const courseWise = db
      .prepare(
        `SELECT c.id, c.code, c.name,
                COUNT(e.id) as total_students,
                SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_students,
                SUM(CASE WHEN e.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_students
         FROM courses c
         LEFT JOIN enrollments e ON e.course_id = c.id
         WHERE c.is_deleted = 0
         GROUP BY c.id
         ORDER BY total_students DESC, c.created_at DESC`
      )
      .all();

    const monthlyRegistrations = db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as enrollments
         FROM enrollments
         GROUP BY strftime('%Y-%m', created_at)
         ORDER BY month ASC
         LIMIT 12`
      )
      .all();

    const statusBreakdown = db
      .prepare(
        `SELECT status, COUNT(*) as count
         FROM enrollments
         GROUP BY status`
      )
      .all();

    const recentEnrollments = db
      .prepare(
        `SELECT e.id, e.enrollment_number, e.student_name_snapshot as student_name,
                e.student_email_snapshot as email, e.course_name_snapshot as course_name,
                e.enrollment_date, e.status, e.progress_percent
         FROM enrollments e
         ORDER BY e.created_at DESC
         LIMIT 8`
      )
      .all();

    const recentApplications = db
      .prepare(
        `SELECT a.id, a.application_code, a.full_name, a.email, a.mobile, a.status, a.created_at,
                c.name as course_name
         FROM applications a
         JOIN courses c ON c.id = a.course_id
         ORDER BY a.created_at DESC
         LIMIT 8`
      )
      .all();

    const recentActivities = db
      .prepare(
        `SELECT id, actor_name, actor_role, action, entity_type, details, created_at
         FROM activity_logs
         ORDER BY created_at DESC
         LIMIT 12`
      )
      .all();

    res.json({
      stats: {
        totalCourses,
        totalEnrollments,
        totalUniqueStudents,
        activeStudents,
        completedStudents,
        pendingApplications,
        totalMaterials,
      },
      charts: {
        courseWise,
        monthlyRegistrations,
        statusBreakdown,
      },
      recentEnrollments,
      recentApplications,
      recentActivities,
    });
  });

  // Website Management & Institute Profile
  router.put('/admin/settings', requireAdmin, (req, res) => {
    const b = req.body || {};
    const existing = db.prepare('SELECT * FROM institute_settings WHERE id = 1').get() as Record<string, unknown>;
    if (!existing) {
      res.status(404).json({ error: 'Institute settings not found.' });
      return;
    }

    const website_title = String(b.website_title ?? existing.website_title).trim();
    const institute_name = String(b.institute_name ?? existing.institute_name).trim();
    const short_name = String(b.short_name ?? existing.short_name).trim();
    const tagline = String(b.tagline ?? existing.tagline).trim();
    const logo_url = b.logo_url !== undefined ? sanitizeUrl(b.logo_url) : String(existing.logo_url || '');
    const favicon_url = b.favicon_url !== undefined ? sanitizeUrl(b.favicon_url) : String(existing.favicon_url || '');
    const hero_heading = String(b.hero_heading ?? existing.hero_heading).trim();
    const hero_description = String(b.hero_description ?? existing.hero_description).trim();
    const hero_banner_url =
      b.hero_banner_url !== undefined ? sanitizeUrl(b.hero_banner_url) : String(existing.hero_banner_url || '');
    const about_image_url =
      b.about_image_url !== undefined ? sanitizeUrl(b.about_image_url) : String(existing.about_image_url || '');
    const about_us = String(b.about_us ?? existing.about_us).trim();
    const vision = String(b.vision ?? existing.vision).trim();
    const mission = String(b.mission ?? existing.mission).trim();
    const achievements_json =
      b.achievements !== undefined ? JSON.stringify(b.achievements) : String(existing.achievements_json || '[]');
    const chairman_name = String(b.chairman_name ?? existing.chairman_name).trim();
    const chairman_designation = String(b.chairman_designation ?? existing.chairman_designation).trim();
    const chairman_message = String(b.chairman_message ?? existing.chairman_message).trim();
    const chairman_image_url =
      b.chairman_image_url !== undefined
        ? sanitizeUrl(b.chairman_image_url)
        : String(existing.chairman_image_url || '');
    const management_json =
      b.management !== undefined ? JSON.stringify(b.management) : String(existing.management_json || '[]');
    const address = String(b.address ?? existing.address).trim();
    const phone = String(b.phone ?? existing.phone).trim();
    const alt_phone = String(b.alt_phone ?? existing.alt_phone).trim();
    const email = String(b.email ?? existing.email).trim();
    const website_url =
      b.website_url !== undefined ? sanitizeUrl(b.website_url) : String(existing.website_url || '');
    const map_embed_url =
      b.map_embed_url !== undefined ? sanitizeUrl(b.map_embed_url) : String(existing.map_embed_url || '');
    const footer_text = String(b.footer_text ?? existing.footer_text).trim();
    const copyright_text = String(b.copyright_text ?? existing.copyright_text).trim();
    const social_links_json =
      b.social_links !== undefined ? JSON.stringify(b.social_links) : String(existing.social_links_json || '{}');
    const certifications_json =
      b.certifications !== undefined
        ? JSON.stringify(b.certifications)
        : String(existing.certifications_json || '[]');
    const affiliations_json =
      b.affiliations !== undefined ? JSON.stringify(b.affiliations) : String(existing.affiliations_json || '[]');

    db.prepare(
      `UPDATE institute_settings SET
        website_title = ?, institute_name = ?, short_name = ?, tagline = ?,
        logo_url = ?, favicon_url = ?, hero_heading = ?, hero_description = ?,
        hero_banner_url = ?, about_image_url = ?, about_us = ?, vision = ?, mission = ?,
        achievements_json = ?, chairman_name = ?, chairman_designation = ?, chairman_message = ?,
        chairman_image_url = ?, management_json = ?, address = ?, phone = ?, alt_phone = ?,
        email = ?, website_url = ?, map_embed_url = ?, footer_text = ?, copyright_text = ?,
        social_links_json = ?, certifications_json = ?, affiliations_json = ?,
        updated_at = datetime('now')
       WHERE id = 1`
    ).run(
      website_title,
      institute_name,
      short_name,
      tagline,
      logo_url,
      favicon_url,
      hero_heading,
      hero_description,
      hero_banner_url,
      about_image_url,
      about_us,
      vision,
      mission,
      achievements_json,
      chairman_name,
      chairman_designation,
      chairman_message,
      chairman_image_url,
      management_json,
      address,
      phone,
      alt_phone,
      email,
      website_url,
      map_embed_url,
      footer_text,
      copyright_text,
      social_links_json,
      certifications_json,
      affiliations_json
    );

    logActivity({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      actorRole: req.authUser!.role,
      action: 'SETTINGS_UPDATED',
      entityType: 'institute_settings',
      entityId: 1,
      details: 'Updated public website & institute profile configuration.',
    });

    broadcastEvent('settings:updated');

    const updated = db.prepare('SELECT * FROM institute_settings WHERE id = 1').get() as Record<string, unknown>;
    res.json({ settings: formatSettingsRow(updated) });
  });

  // Public branding/course image upload
  router.post('/admin/upload/public', requireAdmin, (req, res) => {
    publicImageUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'File upload failed.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No image file provided.' });
        return;
      }
      res.status(201).json({
        url: `/uploads/public/${req.file.filename}`,
        fileName: req.file.originalname,
        size: req.file.size,
      });
    });
  });

  // Course Management
  router.get('/admin/courses', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as total_students,
                (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'ACTIVE') as active_students,
                (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'COMPLETED') as completed_students,
                (SELECT COUNT(*) FROM batches b WHERE b.course_id = c.id) as batch_count,
                (SELECT COUNT(*) FROM learning_resources r WHERE r.course_id = c.id) as resource_count,
                (SELECT COUNT(*) FROM course_modules m WHERE m.course_id = c.id) as module_count
         FROM courses c
         WHERE c.is_deleted = 0
         ORDER BY c.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    const allBatches = db
      .prepare(
        `SELECT b.*,
                (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) as student_count
         FROM batches b
         ORDER BY b.id ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const batchesByCourse = new Map<number, Array<Record<string, unknown>>>();
    for (const b of allBatches) {
      const cid = Number(b.course_id);
      const list = batchesByCourse.get(cid) || [];
      list.push(b);
      batchesByCourse.set(cid, list);
    }

    res.json({
      courses: rows.map((row) => ({
        ...formatCourseRow(row),
        batches: batchesByCourse.get(Number(row.id)) || [],
      })),
    });
  });

  router.get('/admin/batches', requireAdmin, (req, res) => {
    const courseId = Number(req.query.courseId || 0);
    let sql = `
      SELECT b.*, c.name as course_name, c.code as course_code, c.source_course_id,
             (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) as student_count
      FROM batches b
      JOIN courses c ON c.id = b.course_id
      WHERE c.is_deleted = 0
    `;
    const args: unknown[] = [];
    if (courseId > 0) {
      sql += ' AND b.course_id = ?';
      args.push(courseId);
    }
    sql += ' ORDER BY c.name ASC, b.batch_code ASC';
    res.json({ batches: db.prepare(sql).all(...args) });
  });

  router.post('/admin/courses', requireAdmin, (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const code = String(b.code || '').trim().toUpperCase();
    const short_description = String(b.short_description || '').trim();
    const detailed_description = String(b.detailed_description || short_description).trim();
    const image_url = sanitizeUrl(b.image_url);
    const category = String(b.category || 'General').trim();
    const duration_value = Math.max(1, Number(b.duration_value || 1));
    const duration_unit = ['Days', 'Weeks', 'Months', 'Years'].includes(String(b.duration_unit))
      ? String(b.duration_unit)
      : 'Months';
    const total_training_hours = Math.max(0, Number(b.total_training_hours || 0));
    const level = String(b.level || 'Intermediate').trim();
    const eligibility = String(b.eligibility || 'Open to eligible candidates').trim();
    const mode = ['Online', 'Offline', 'Hybrid'].includes(String(b.mode)) ? String(b.mode) : 'Hybrid';
    const fees = String(b.fees || '').trim();
    const start_date = String(b.start_date || '').trim();
    const end_date = String(b.end_date || '').trim();
    const syllabus = Array.isArray(b.syllabus)
      ? b.syllabus.map((s: unknown) => String(s).trim()).filter(Boolean)
      : [];
    const certificate_info = String(b.certificate_info || '').trim();
    const status = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(String(b.status))
      ? String(b.status)
      : 'PUBLISHED';

    if (!name || !code || !short_description) {
      res.status(400).json({ error: 'Course Name, Course Code, and Short Description are required.' });
      return;
    }

    try {
      const insert = db
        .prepare(
          `INSERT INTO courses (
            code, name, short_description, detailed_description, image_url, category,
            duration_value, duration_unit, total_training_hours, level, eligibility,
            mode, fees, start_date, end_date, syllabus_json, certificate_info, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          code,
          name,
          short_description,
          detailed_description,
          image_url,
          category,
          duration_value,
          duration_unit,
          total_training_hours,
          level,
          eligibility,
          mode,
          fees,
          start_date,
          end_date,
          JSON.stringify(syllabus),
          certificate_info,
          status
        );

      const courseId = Number(insert.lastInsertRowid);

      // Automatically create a starter module from syllabus if provided
      if (syllabus.length > 0) {
        const modStmt = db.prepare(
          'INSERT INTO course_modules (course_id, title, description, sort_order) VALUES (?, ?, ?, ?)'
        );
        syllabus.forEach((item: string, idx: number) => {
          modStmt.run(courseId, item, '', idx + 1);
        });
      }

      logActivity({
        actorUserId: req.authUser!.id,
        actorName: req.authUser!.full_name,
        actorRole: req.authUser!.role,
        action: 'COURSE_CREATED',
        entityType: 'course',
        entityId: courseId,
        details: `Created course ${name} (${code})`,
      });

      broadcastEvent('courses:changed');
      broadcastEvent('stats:updated');

      const created = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as Record<string, unknown>;
      res.status(201).json({ course: formatCourseRow(created) });
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        res.status(409).json({ error: `Course code "${code}" already exists.` });
        return;
      }
      res.status(500).json({ error: 'Failed to create course.' });
    }
  });

  router.put('/admin/courses/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid course ID.' });
      return;
    }
    const existing = db
      .prepare('SELECT * FROM courses WHERE id = ? AND is_deleted = 0')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    const b = req.body || {};
    const name = String(b.name ?? existing.name).trim();
    const code = String(b.code ?? existing.code).trim().toUpperCase();
    const short_description = String(b.short_description ?? existing.short_description).trim();
    const detailed_description = String(b.detailed_description ?? existing.detailed_description).trim();
    const image_url = b.image_url !== undefined ? sanitizeUrl(b.image_url) : String(existing.image_url || '');
    const category = String(b.category ?? existing.category).trim();
    const duration_value = Math.max(1, Number(b.duration_value ?? existing.duration_value));
    const duration_unit = ['Days', 'Weeks', 'Months', 'Years'].includes(String(b.duration_unit ?? existing.duration_unit))
      ? String(b.duration_unit ?? existing.duration_unit)
      : String(existing.duration_unit);
    const total_training_hours = Math.max(0, Number(b.total_training_hours ?? existing.total_training_hours));
    const level = String(b.level ?? existing.level).trim();
    const eligibility = String(b.eligibility ?? existing.eligibility).trim();
    const mode = ['Online', 'Offline', 'Hybrid'].includes(String(b.mode ?? existing.mode))
      ? String(b.mode ?? existing.mode)
      : String(existing.mode);
    const fees = String(b.fees ?? existing.fees).trim();
    const start_date = String(b.start_date ?? existing.start_date).trim();
    const end_date = String(b.end_date ?? existing.end_date).trim();
    const syllabus_json =
      b.syllabus !== undefined
        ? JSON.stringify(
            Array.isArray(b.syllabus)
              ? b.syllabus.map((s: unknown) => String(s).trim()).filter(Boolean)
              : []
          )
        : String(existing.syllabus_json || '[]');
    const certificate_info = String(b.certificate_info ?? existing.certificate_info).trim();
    const status = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(String(b.status ?? existing.status))
      ? String(b.status ?? existing.status)
      : String(existing.status);

    try {
      db.prepare(
        `UPDATE courses SET
          code = ?, name = ?, short_description = ?, detailed_description = ?, image_url = ?,
          category = ?, duration_value = ?, duration_unit = ?, total_training_hours = ?,
          level = ?, eligibility = ?, mode = ?, fees = ?, start_date = ?, end_date = ?,
          syllabus_json = ?, certificate_info = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        code,
        name,
        short_description,
        detailed_description,
        image_url,
        category,
        duration_value,
        duration_unit,
        total_training_hours,
        level,
        eligibility,
        mode,
        fees,
        start_date,
        end_date,
        syllabus_json,
        certificate_info,
        status,
        id
      );

      // Keep active enrollment course snapshots aligned with latest updated course title & duration
      const newDurationDisplay = formatDuration(duration_value, duration_unit);
      db.prepare(
        `UPDATE enrollments
         SET course_name_snapshot = ?, course_duration_snapshot = ?, updated_at = datetime('now')
         WHERE course_id = ? AND status = 'ACTIVE'`
      ).run(name, newDurationDisplay, id);

      notifyCourseStudents(
        id,
        'COURSE_UPDATE',
        `Course Updated: ${name}`,
        `Course information for ${name} has been updated by AITM Administration.`,
        '/student/dashboard'
      );

      logActivity({
        actorUserId: req.authUser!.id,
        actorName: req.authUser!.full_name,
        actorRole: req.authUser!.role,
        action: 'COURSE_UPDATED',
        entityType: 'course',
        entityId: id,
        details: `Updated course ${name} (${code})`,
      });

      broadcastEvent('courses:changed');
      broadcastEvent('enrollments:changed');
      broadcastEvent('stats:updated');

      const updated = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as Record<string, unknown>;
      res.json({ course: formatCourseRow(updated) });
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        res.status(409).json({ error: `Course code "${code}" is already in use.` });
        return;
      }
      res.status(500).json({ error: 'Failed to update course.' });
    }
  });

  // Safe delete: preserves historical enrollments and student accounts intact
  router.delete('/admin/courses/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid course ID.' });
      return;
    }
    const existing = db
      .prepare('SELECT id, name, code FROM courses WHERE id = ? AND is_deleted = 0')
      .get(id) as { id: number; name: string; code: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    const enrollmentCount = (
      db.prepare('SELECT COUNT(*) as c FROM enrollments WHERE course_id = ?').get(id) as { c: number }
    ).c;

    db.prepare(
      `UPDATE courses SET is_deleted = 1, status = 'ARCHIVED', updated_at = datetime('now') WHERE id = ?`
    ).run(id);

    logActivity({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      actorRole: req.authUser!.role,
      action: 'COURSE_ARCHIVED',
      entityType: 'course',
      entityId: id,
      details: `Removed course ${existing.name} from public catalog (${enrollmentCount} historical enrollment records safely preserved).`,
    });

    broadcastEvent('courses:changed');
    broadcastEvent('stats:updated');

    res.json({
      ok: true,
      preservedEnrollments: enrollmentCount,
      message: `Course removed from catalog. ${enrollmentCount} historical enrollment record(s) safely preserved.`,
    });
  });

  router.get('/admin/courses/:id/students', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid course ID.' });
      return;
    }
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    const batchIdFilter = Number(req.query.batchId || 0);
    const batchCodeFilter = String(req.query.batchCode || '').trim();

    const batches = db
      .prepare(
        `SELECT b.*,
                (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) as student_count
         FROM batches b
         WHERE b.course_id = ?
         ORDER BY b.id ASC`
      )
      .all(id) as Array<Record<string, unknown>>;

    let sql = `
      SELECT e.id as enrollment_id, e.enrollment_number,
             COALESCE(NULLIF(e.employee_code_snapshot, ''), sp.employee_code, '') as employee_code,
             COALESCE(NULLIF(e.candidate_id_snapshot, ''), sp.candidate_id, '') as candidate_id,
             e.batch_id, e.batch_code_snapshot, e.batch_name,
             e.sdms_enrolment_number, e.scheme_name, e.candidate_course_fee, e.fee_paid_by,
             e.tc_id, e.tc_name, e.assessment_mode, e.assessment_from_date, e.assessment_to_date,
             e.certificate_name, e.placement_type, e.source_extra_fields as enrollment_extra_fields,
             e.enrollment_date, e.status as course_status,
             e.enrollment_type, e.payment_status, e.progress_percent,
             u.id as student_user_id, u.full_name as student_name, u.username,
             COALESCE(NULLIF(e.student_email_snapshot, ''), u.email) as email, u.is_active,
             sp.salutation, sp.mobile, sp.country_code, sp.dob, sp.gender, sp.marital_status,
             sp.fathers_name, sp.mothers_name, sp.guardians_name,
             sp.religion, sp.category, sp.disability, sp.domicile_state, sp.domicile_district, sp.id_type,
             sp.qualification, sp.city, sp.state,
             sp.permanent_address, sp.permanent_district, sp.permanent_pincode, sp.permanent_tehsil,
             sp.comm_same_as_permanent, sp.comm_state, sp.comm_district, sp.comm_pincode, sp.comm_city, sp.comm_tehsil,
             sp.source_extra_fields as profile_extra_fields, sp.account_status
      FROM enrollments e
      JOIN users u ON u.id = e.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE e.course_id = ?
    `;
    const args: unknown[] = [id];
    if (batchIdFilter > 0) {
      sql += ' AND e.batch_id = ?';
      args.push(batchIdFilter);
    } else if (batchCodeFilter) {
      sql += ' AND e.batch_code_snapshot = ?';
      args.push(batchCodeFilter);
    }
    sql += ' ORDER BY e.id ASC';

    const students = (db.prepare(sql).all(...args) as Array<Record<string, unknown>>).map(
      (row): Record<string, unknown> => ({
        ...row,
        profile_extra_fields: safeParseJson(String(row.profile_extra_fields || '{}'), {}),
        enrollment_extra_fields: safeParseJson(String(row.enrollment_extra_fields || '{}'), {}),
      })
    );

    const totalAll = (
      db.prepare('SELECT COUNT(*) as c FROM enrollments WHERE course_id = ?').get(id) as { c: number }
    ).c;
    const total = students.length;
    const active = students.filter((s) => s.course_status === 'ACTIVE').length;
    const completed = students.filter((s) => s.course_status === 'COMPLETED').length;

    res.json({
      course: formatCourseRow(course),
      batches,
      counts: { total, totalAll, active, completed },
      students,
    });
  });

  // Applications Management
  router.get('/admin/applications', requireAdmin, (req, res) => {
    const status = String(req.query.status || '').trim();
    const courseId = Number(req.query.courseId || 0);
    const search = String(req.query.search || '').trim().toLowerCase();

    let sql = `
      SELECT a.*, c.name as course_name, c.code as course_code,
             e.enrollment_number
      FROM applications a
      JOIN courses c ON c.id = a.course_id
      LEFT JOIN enrollments e ON e.id = a.enrollment_id
      WHERE 1=1
    `;
    const args: unknown[] = [];
    if (status && status !== 'ALL') {
      sql += ' AND a.status = ?';
      args.push(status);
    }
    if (courseId > 0) {
      sql += ' AND a.course_id = ?';
      args.push(courseId);
    }
    if (search) {
      sql += ' AND (LOWER(a.full_name) LIKE ? OR LOWER(a.email) LIKE ? OR LOWER(a.application_code) LIKE ? OR LOWER(a.mobile) LIKE ?)';
      const pat = `%${search}%`;
      args.push(pat, pat, pat, pat);
    }
    sql += ' ORDER BY a.created_at DESC';

    res.json({ applications: db.prepare(sql).all(...args) });
  });

  router.put('/admin/applications/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid application ID.' });
      return;
    }
    const appRow = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as
      | { id: number; status: string; full_name: string; application_code: string }
      | undefined;
    if (!appRow) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }

    const adminNotes = req.body?.admin_notes !== undefined ? String(req.body.admin_notes).trim() : undefined;
    const requestedStatus = req.body?.status ? String(req.body.status).toUpperCase() : undefined;

    if (requestedStatus === 'REJECTED') {
      if (appRow.status === 'APPROVED') {
        res.status(400).json({ error: 'Approved applications cannot be rejected.' });
        return;
      }
      db.prepare(
        `UPDATE applications
         SET status = 'REJECTED', admin_notes = COALESCE(?, admin_notes),
             reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`
      ).run(adminNotes ?? null, req.authUser!.id, id);

      logActivity({
        actorUserId: req.authUser!.id,
        actorName: req.authUser!.full_name,
        actorRole: req.authUser!.role,
        action: 'APPLICATION_REJECTED',
        entityType: 'application',
        entityId: id,
        details: `Rejected application ${appRow.application_code} (${appRow.full_name})`,
      });
    } else if (adminNotes !== undefined) {
      db.prepare(
        `UPDATE applications SET admin_notes = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(adminNotes, id);
    }

    broadcastEvent('applications:changed');
    broadcastEvent('stats:updated');

    const updated = db
      .prepare(
        `SELECT a.*, c.name as course_name FROM applications a JOIN courses c ON c.id = a.course_id WHERE a.id = ?`
      )
      .get(id);
    res.json({ application: updated });
  });

  router.post('/admin/applications/:id/approve', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid application ID.' });
      return;
    }

    const appRow = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as
      | {
          id: number;
          application_code: string;
          full_name: string;
          email: string;
          mobile: string;
          dob: string;
          gender: string;
          qualification: string;
          city: string;
          state: string;
          course_id: number;
          status: string;
        }
      | undefined;

    if (!appRow) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    if (appRow.status !== 'PENDING') {
      res.status(409).json({ error: `Application has already been ${appRow.status.toLowerCase()}.` });
      return;
    }

    const batchName = String(req.body?.batch_name || 'Batch 2026').trim();
    const adminNotes = req.body?.admin_notes !== undefined ? String(req.body.admin_notes).trim() : null;

    let result: EnrollmentTransactionResult;
    try {
      if (adminNotes !== null) {
        db.prepare('UPDATE applications SET admin_notes = ? WHERE id = ?').run(adminNotes, id);
      }
      result = createEnrollmentAtomic({
        fullName: appRow.full_name,
        email: appRow.email,
        mobile: appRow.mobile,
        dob: appRow.dob,
        gender: appRow.gender,
        qualification: appRow.qualification,
        city: appRow.city,
        state: appRow.state,
        courseId: appRow.course_id,
        batchName,
        applicationId: appRow.id,
        adminUserId: req.authUser!.id,
        adminName: req.authUser!.full_name,
        adminRole: req.authUser!.role,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to approve application.' });
      return;
    }

    // Automatic idempotent Welcome Email (secure activation link — never sends plain-text password)
    const portalBaseUrl = getPortalBaseUrl(req);
    const mailContent = buildEnrollmentWelcomeEmail({
      studentUserId: result.studentUserId,
      studentName: result.studentName,
      registeredEmail: result.studentEmail,
      courseName: result.courseName,
      enrollmentNumber: result.enrollmentNumber,
      username: result.username,
      portalBaseUrl,
    });

    const emailResult = await sendLoggedEmail({
      recipientEmail: result.studentEmail,
      recipientName: result.studentName,
      subject: mailContent.subject,
      body: mailContent.body,
      htmlBody: mailContent.htmlBody,
      eventType: 'ENROLLMENT_WELCOME',
      relatedEnrollmentId: result.enrollmentId,
      studentUserId: result.studentUserId,
      idempotencyKey: `enrollment_welcome_${result.enrollmentId}`,
      redactSecret: mailContent.rawToken,
    });

    broadcastEvent('applications:changed');
    broadcastEvent('enrollments:changed');
    broadcastEvent('students:changed');
    broadcastEvent('emails:changed');
    broadcastEvent('stats:updated');

    res.status(201).json({
      enrollment: {
        id: result.enrollmentId,
        enrollment_number: result.enrollmentNumber,
        student_user_id: result.studentUserId,
        student_name: result.studentName,
        student_email: result.studentEmail,
        course_name: result.courseName,
      },
      credentials: {
        username: result.username,
        isNewAccount: result.isNewAccount,
        temporaryPassword: result.temporaryPassword,
      },
      email: emailResult,
    });
  });

  // Students Management
  router.get('/admin/students', requireAdmin, (req, res) => {
    const courseId = Number(req.query.courseId || 0);
    const search = String(req.query.search || '').trim().toLowerCase();

    let sql = `
      SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.must_change_password, u.created_at,
             sp.enrollment_number, sp.employee_code, sp.candidate_id, sp.mobile, sp.dob, sp.gender, sp.qualification, sp.city, sp.state, sp.account_status,
             (SELECT COUNT(*) FROM enrollments e WHERE e.student_user_id = u.id) as course_count,
             (SELECT GROUP_CONCAT(e.course_name_snapshot || CASE WHEN e.batch_code_snapshot != '' THEN ' (Batch ' || e.batch_code_snapshot || ')' ELSE '' END, ', ') FROM enrollments e WHERE e.student_user_id = u.id) as enrolled_courses
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE u.role = 'STUDENT'
    `;
    const args: unknown[] = [];

    if (courseId > 0) {
      sql += ' AND EXISTS (SELECT 1 FROM enrollments e WHERE e.student_user_id = u.id AND e.course_id = ?)';
      args.push(courseId);
    }
    if (search) {
      sql +=
        ' AND (LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(u.username) LIKE ? OR LOWER(COALESCE(sp.enrollment_number, "")) LIKE ? OR LOWER(COALESCE(sp.employee_code, "")) LIKE ? OR LOWER(COALESCE(sp.candidate_id, "")) LIKE ?)';
      const pat = `%${search}%`;
      args.push(pat, pat, pat, pat, pat, pat);
    }
    sql += ' ORDER BY u.id ASC';

    res.json({ students: db.prepare(sql).all(...args) });
  });

  router.get('/admin/students/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }
    const student = db
      .prepare(
        `SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.must_change_password, u.created_at,
                sp.enrollment_number, sp.employee_code, sp.mobile, sp.dob, sp.gender, sp.qualification, sp.city, sp.state, sp.account_status
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = ? AND u.role = 'STUDENT'`
      )
      .get(id);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const enrollments = db
      .prepare(
        `SELECT e.*, c.code as course_code
         FROM enrollments e
         LEFT JOIN courses c ON c.id = e.course_id
         WHERE e.student_user_id = ?
         ORDER BY e.created_at DESC`
      )
      .all(id);
    res.json({ student, enrollments });
  });

  router.put('/admin/students/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }
    const existing = db
      .prepare("SELECT id, full_name, is_active FROM users WHERE id = ? AND role = 'STUDENT'")
      .get(id) as { id: number; full_name: string; is_active: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const b = req.body || {};
    const isActive = b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active;
    const accountStatus = isActive ? String(b.account_status || 'ACTIVE') : 'SUSPENDED';

    db.transaction(() => {
      db.prepare(
        `UPDATE users SET full_name = COALESCE(?, full_name), is_active = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(b.full_name ? String(b.full_name).trim() : null, isActive, id);

      db.prepare(
        `UPDATE student_profiles SET
          mobile = COALESCE(?, mobile),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          qualification = COALESCE(?, qualification),
          account_status = ?,
          updated_at = datetime('now')
         WHERE user_id = ?`
      ).run(
        b.mobile !== undefined ? String(b.mobile).trim() : null,
        b.city !== undefined ? String(b.city).trim() : null,
        b.state !== undefined ? String(b.state).trim() : null,
        b.qualification !== undefined ? String(b.qualification).trim() : null,
        ['ACTIVE', 'SUSPENDED', 'ALUMNI'].includes(accountStatus) ? accountStatus : 'ACTIVE',
        id
      );

      if (!isActive) {
        revokeAllUserSessions(id);
      }
    })();

    broadcastEvent('students:changed');
    res.json({ ok: true });
  });

  router.post('/admin/students/:id/reset-temp-password', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }
    const student = db
      .prepare(
        `SELECT u.id, u.full_name, u.username, sp.enrollment_number
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = ? AND u.role = 'STUDENT'`
      )
      .get(id) as { id: number; full_name: string; username: string; enrollment_number: string } | undefined;

    if (!student) {
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }

    const tempPassword = student.enrollment_number;
    db.transaction(() => {
      db.prepare(
        `UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?`
      ).run(hashPassword(tempPassword), student.id);
      revokeAllUserSessions(student.id);
    })();

    logActivity({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      actorRole: req.authUser!.role,
      action: 'STUDENT_TEMP_PASSWORD_RESET',
      entityType: 'user',
      entityId: student.id,
      details: `Reset temporary password for ${student.full_name} (${student.enrollment_number})`,
    });

    res.json({
      ok: true,
      username: student.username,
      temporaryPassword: tempPassword,
      message: `Password reset to temporary enrollment number (${tempPassword}). Student must change password on next login.`,
    });
  });

  // Enrollment Management
  router.get('/admin/enrollments', requireAdmin, (req, res) => {
    const courseId = Number(req.query.courseId || 0);
    const status = String(req.query.status || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    let sql = `
      SELECT e.*,
             COALESCE(NULLIF(e.employee_code_snapshot, ''), sp.employee_code, '') as employee_code,
             COALESCE(NULLIF(e.candidate_id_snapshot, ''), sp.candidate_id, '') as candidate_id,
             u.username, u.is_active as account_active, c.code as course_code
      FROM enrollments e
      JOIN users u ON u.id = e.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      LEFT JOIN courses c ON c.id = e.course_id
      WHERE 1=1
    `;
    const args: unknown[] = [];

    if (courseId > 0) {
      sql += ' AND e.course_id = ?';
      args.push(courseId);
    }
    if (status && status !== 'ALL') {
      sql += ' AND e.status = ?';
      args.push(status);
    }
    if (search) {
      sql +=
        ' AND (LOWER(e.student_name_snapshot) LIKE ? OR LOWER(e.enrollment_number) LIKE ? OR LOWER(e.student_email_snapshot) LIKE ? OR LOWER(e.course_name_snapshot) LIKE ? OR LOWER(COALESCE(e.employee_code_snapshot, sp.employee_code, "")) LIKE ? OR LOWER(COALESCE(e.candidate_id_snapshot, sp.candidate_id, "")) LIKE ? OR LOWER(COALESCE(e.batch_code_snapshot, e.batch_name, "")) LIKE ?)';
      const pat = `%${search}%`;
      args.push(pat, pat, pat, pat, pat, pat, pat);
    }
    sql += ' ORDER BY e.id ASC';

    res.json({ enrollments: db.prepare(sql).all(...args) });
  });

  // Excel Student Import — Step 1: Parse & Preview
  router.post(
    '/admin/import/excel/preview',
    requireAdmin,
    (req, res, next) => {
      excelImportUpload.single('file')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err instanceof Error ? err.message : 'File upload failed.' });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      try {
        if (!req.file || !req.file.buffer) {
          res.status(400).json({ error: 'Please select an Excel (.xlsx) or CSV (.csv) file to preview.' });
          return;
        }
        pruneExcelPreviewCache();
        const parsed = await parseExcelWorkbook(req.file.buffer, req.file.originalname);
        if (parsed.rows.length === 0) {
          res.status(400).json({ error: 'No student rows were found below the detected header row.' });
          return;
        }
        const preview = previewStudentImport(parsed);
        const previewId = crypto.randomUUID();
        EXCEL_PREVIEW_CACHE.set(previewId, {
          parsed,
          adminUserId: req.authUser!.id,
          createdAt: Date.now(),
        });
        res.json({ ...preview, previewId });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Unable to parse the uploaded Excel file.',
        });
      }
    }
  );

  // Excel Student Import — Step 2: Confirm & Commit to Database
  router.post('/admin/import/excel/commit', requireAdmin, async (req, res) => {
    const previewId = String(req.body?.previewId || '').trim();
    const sendWelcomeEmails = Boolean(req.body?.sendWelcomeEmails);
    if (!previewId) {
      res.status(400).json({ error: 'Missing previewId. Please upload and preview the Excel file first.' });
      return;
    }
    pruneExcelPreviewCache();
    const cached = EXCEL_PREVIEW_CACHE.get(previewId);
    if (!cached || cached.adminUserId !== req.authUser!.id) {
      res.status(410).json({ error: 'Import preview session expired or was not found. Please upload the file again.' });
      return;
    }

    try {
      const report = commitStudentImport(cached.parsed, {
        id: req.authUser!.id,
        full_name: req.authUser!.full_name,
        role: req.authUser!.role,
      });
      EXCEL_PREVIEW_CACHE.delete(previewId);

      let emailSummary: {
        attempted: number;
        sent: number;
        failed: number;
        skipped: number;
        invalid: number;
      } | null = null;

      if (sendWelcomeEmails && report.enrolledUserIds.length > 0) {
        const portalBaseUrl = getPortalBaseUrl(req);
        const overview = getEnrolledStudentsEmailOverview();
        const targetSet = new Set(report.enrolledUserIds);
        const targets = overview.students.filter((s) => targetSet.has(s.user_id));

        let sent = 0;
        let failed = 0;
        let skipped = 0;
        let invalid = 0;

        for (let i = 0; i < targets.length; i += 5) {
          const slice = targets.slice(i, i + 5);
          const outcomes = await Promise.all(
            slice.map((student) =>
              sendCredentialsEmailToStudent({
                student,
                portalBaseUrl,
                eventType: 'ENROLLMENT_WELCOME',
                idempotencyKey: `student_creds_${student.user_id}`,
                forceResend: false,
              })
            )
          );
          for (const o of outcomes) {
            if (o.status === 'SENT') sent++;
            else if (o.status === 'SKIPPED_ALREADY_SENT') skipped++;
            else if (o.status === 'INVALID_EMAIL') invalid++;
            else failed++;
          }
        }
        emailSummary = { attempted: targets.length, sent, failed, skipped, invalid };
        broadcastEvent('emails:changed');
      }

      broadcastEvent('courses:changed');
      broadcastEvent('enrollments:changed');
      broadcastEvent('students:changed');
      broadcastEvent('stats:updated');

      res.json({ report, emailSummary });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to commit student import.',
      });
    }
  });

  router.post('/admin/enrollments', requireAdmin, async (req, res) => {
    const b = req.body || {};
    const fullName = String(b.full_name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const mobile = String(b.mobile || '').trim();
    const employeeCode = String(b.employee_code || '').trim();
    const enrollmentType = String(b.enrollment_type || 'Regular').trim();
    const paymentStatus = String(b.payment_status || 'Pending').trim();
    const sendEmail = b.send_email !== false;
    const courseId = Number(b.course_id);

    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(courseId)) {
      res.status(400).json({ error: 'Student Name, valid Email, and Course are required.' });
      return;
    }

    let result: EnrollmentTransactionResult;
    try {
      result = createEnrollmentAtomic({
        fullName,
        email,
        mobile,
        dob: String(b.dob || ''),
        gender: String(b.gender || ''),
        qualification: String(b.qualification || ''),
        city: String(b.city || ''),
        state: String(b.state || ''),
        employeeCode,
        courseId,
        batchName: String(b.batch_name || 'Batch 2026'),
        enrollmentType,
        paymentStatus,
        status: 'ACTIVE',
        applicationId: null,
        adminUserId: req.authUser!.id,
        adminName: req.authUser!.full_name,
        adminRole: req.authUser!.role,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to create enrollment.' });
      return;
    }

    let emailResult: { status: string; message: string } = {
      status: 'SKIPPED',
      message: 'Email dispatch disabled for this enrollment.',
    };

    if (sendEmail) {
      const portalBaseUrl = getPortalBaseUrl(req);
      const mailContent = buildEnrollmentWelcomeEmail({
        studentUserId: result.studentUserId,
        studentName: result.studentName,
        registeredEmail: result.studentEmail,
        courseName: result.courseName,
        enrollmentNumber: result.enrollmentNumber,
        username: result.username,
        portalBaseUrl,
      });

      emailResult = await sendLoggedEmail({
        recipientEmail: result.studentEmail,
        recipientName: result.studentName,
        subject: mailContent.subject,
        body: mailContent.body,
        htmlBody: mailContent.htmlBody,
        eventType: 'ENROLLMENT_WELCOME',
        relatedEnrollmentId: result.enrollmentId,
        studentUserId: result.studentUserId,
        idempotencyKey: `enrollment_welcome_${result.enrollmentId}`,
        redactSecret: mailContent.rawToken,
      });
      broadcastEvent('emails:changed');
    }

    broadcastEvent('enrollments:changed');
    broadcastEvent('students:changed');
    broadcastEvent('stats:updated');

    res.status(201).json({
      enrollment: result,
      email: emailResult,
    });
  });

  // Bulk Student Enrollment (sends welcome/activation emails automatically when send_email is true)
  router.post('/admin/enrollments/bulk', requireAdmin, async (req, res) => {
    const b = req.body || {};
    const courseId = Number(b.course_id);
    const enrollmentType = String(b.enrollment_type || 'Demo').trim() || 'Demo';
    const paymentStatus = String(b.payment_status || 'Free / No Payment').trim() || 'Free / No Payment';
    const sendEmail = Boolean(b.send_email);
    const status = ['ACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED'].includes(String(b.status || 'ACTIVE'))
      ? (String(b.status || 'ACTIVE') as 'ACTIVE' | 'COMPLETED' | 'DROPPED' | 'SUSPENDED')
      : 'ACTIVE';
    const batchName = String(b.batch_name || `${enrollmentType} Batch`).trim();
    const students = Array.isArray(b.students) ? b.students : [];

    if (!Number.isInteger(courseId) || courseId <= 0) {
      res.status(400).json({ error: 'Valid course_id is required.' });
      return;
    }
    if (students.length === 0) {
      res.status(400).json({ error: 'At least one student record is required.' });
      return;
    }
    if (students.length > 500) {
      res.status(400).json({ error: 'Maximum 500 students per bulk request.' });
      return;
    }

    const course = db
      .prepare('SELECT id, name, is_deleted FROM courses WHERE id = ?')
      .get(courseId) as { id: number; name: string; is_deleted: number } | undefined;
    if (!course || course.is_deleted) {
      res.status(404).json({ error: 'Selected course was not found or has been archived.' });
      return;
    }

    const enrolled: EnrollmentTransactionResult[] = [];
    const existing: Array<{ employee_code: string; full_name: string; email: string; reason: string }> = [];
    const failed: Array<{ employee_code: string; full_name: string; email: string; reason: string }> = [];

    for (const raw of students) {
      const rec = (raw || {}) as Record<string, unknown>;
      const employeeCode = String(rec.employee_code || '').trim();
      const fullName = String(rec.full_name || '').trim();
      const email = String(rec.email || '').trim().toLowerCase();
      const mobile = String(rec.mobile || '').trim();

      if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        failed.push({
          employee_code: employeeCode,
          full_name: fullName,
          email,
          reason: 'Invalid or missing student name or email address.',
        });
        continue;
      }

      try {
        const result = createEnrollmentAtomic({
          fullName,
          email,
          mobile,
          dob: '',
          gender: '',
          qualification: '',
          city: '',
          state: '',
          employeeCode,
          courseId,
          batchName,
          enrollmentType,
          paymentStatus,
          status,
          applicationId: null,
          adminUserId: req.authUser!.id,
          adminName: req.authUser!.full_name,
          adminRole: req.authUser!.role,
        });
        enrolled.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to enroll student.';
        if (msg.toLowerCase().includes('already enrolled')) {
          existing.push({ employee_code: employeeCode, full_name: fullName, email, reason: msg });
        } else {
          failed.push({ employee_code: employeeCode, full_name: fullName, email, reason: msg });
        }
      }
    }

    let emailSummary = { attempted: 0, sent: 0, failed: 0 };
    if (sendEmail && enrolled.length > 0) {
      const portalBaseUrl = getPortalBaseUrl(req);
      for (let i = 0; i < enrolled.length; i += 5) {
        const slice = enrolled.slice(i, i + 5);
        const outcomes = await Promise.all(
          slice.map(async (item) => {
            const mailContent = buildEnrollmentWelcomeEmail({
              studentUserId: item.studentUserId,
              studentName: item.studentName,
              registeredEmail: item.studentEmail,
              courseName: item.courseName,
              enrollmentNumber: item.enrollmentNumber,
              username: item.username,
              portalBaseUrl,
            });
            return sendLoggedEmail({
              recipientEmail: item.studentEmail,
              recipientName: item.studentName,
              subject: mailContent.subject,
              body: mailContent.body,
              htmlBody: mailContent.htmlBody,
              eventType: 'ENROLLMENT_WELCOME',
              relatedEnrollmentId: item.enrollmentId,
              studentUserId: item.studentUserId,
              idempotencyKey: `enrollment_welcome_${item.enrollmentId}`,
              redactSecret: mailContent.rawToken,
            });
          })
        );
        for (const out of outcomes) {
          emailSummary.attempted++;
          if (out.status === 'SENT') emailSummary.sent++;
          else emailSummary.failed++;
        }
      }
      broadcastEvent('emails:changed');
    }

    const totalInCourse = (
      db.prepare('SELECT COUNT(*) as c FROM enrollments WHERE course_id = ?').get(courseId) as { c: number }
    ).c;

    if (enrolled.length > 0) {
      broadcastEvent('enrollments:changed');
      broadcastEvent('students:changed');
      broadcastEvent('stats:updated');
    }

    res.status(201).json({
      course: { id: course.id, name: course.name },
      summary: {
        requested: students.length,
        enrolledCount: enrolled.length,
        existingCount: existing.length,
        failedCount: failed.length,
        totalInCourse,
        emailSummary,
      },
      enrolled,
      existing,
      failed,
    });
  });

  router.put('/admin/enrollments/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid enrollment ID.' });
      return;
    }
    const existing = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(id) as
      | { id: number; status: string; progress_percent: number; batch_name: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Enrollment not found.' });
      return;
    }

    const status = ['ACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED'].includes(String(req.body?.status))
      ? String(req.body.status)
      : existing.status;
    const progress =
      req.body?.progress_percent !== undefined
        ? Math.min(100, Math.max(0, Number(req.body.progress_percent)))
        : status === 'COMPLETED'
          ? 100
          : existing.progress_percent;
    const batchName =
      req.body?.batch_name !== undefined ? String(req.body.batch_name).trim() : existing.batch_name;

    db.prepare(
      `UPDATE enrollments SET status = ?, progress_percent = ?, batch_name = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(status, progress, batchName, id);

    broadcastEvent('enrollments:changed');
    broadcastEvent('stats:updated');
    res.json({ ok: true });
  });

  // Course Modules
  router.get('/admin/modules', requireAdmin, (req, res) => {
    const courseId = Number(req.query.courseId || 0);
    if (courseId > 0) {
      res.json({
        modules: db
          .prepare('SELECT * FROM course_modules WHERE course_id = ? ORDER BY sort_order ASC, id ASC')
          .all(courseId),
      });
      return;
    }
    res.json({
      modules: db
        .prepare(
          `SELECT m.*, c.name as course_name
           FROM course_modules m
           JOIN courses c ON c.id = m.course_id
           WHERE c.is_deleted = 0
           ORDER BY m.course_id ASC, m.sort_order ASC`
        )
        .all(),
    });
  });

  router.post('/admin/modules', requireAdmin, (req, res) => {
    const courseId = Number(req.body?.course_id);
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const sortOrder = Math.max(1, Number(req.body?.sort_order || 1));

    if (!Number.isInteger(courseId) || !title) {
      res.status(400).json({ error: 'Course and Module Title are required.' });
      return;
    }

    const insert = db
      .prepare('INSERT INTO course_modules (course_id, title, description, sort_order) VALUES (?, ?, ?, ?)')
      .run(courseId, title, description, sortOrder);

    broadcastEvent('modules:changed', { courseId });
    res.status(201).json({
      module: db.prepare('SELECT * FROM course_modules WHERE id = ?').get(Number(insert.lastInsertRowid)),
    });
  });

  router.put('/admin/modules/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid module ID.' });
      return;
    }
    const existing = db.prepare('SELECT * FROM course_modules WHERE id = ?').get(id) as
      | { id: number; course_id: number; title: string; description: string; sort_order: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Module not found.' });
      return;
    }
    const title = String(req.body?.title ?? existing.title).trim();
    const description = String(req.body?.description ?? existing.description).trim();
    const sortOrder = Math.max(1, Number(req.body?.sort_order ?? existing.sort_order));

    db.prepare(
      `UPDATE course_modules SET title = ?, description = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(title, description, sortOrder, id);

    broadcastEvent('modules:changed', { courseId: existing.course_id });
    res.json({ module: db.prepare('SELECT * FROM course_modules WHERE id = ?').get(id) });
  });

  router.delete('/admin/modules/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid module ID.' });
      return;
    }
    db.prepare('DELETE FROM course_modules WHERE id = ?').run(id);
    broadcastEvent('modules:changed');
    res.json({ ok: true });
  });

  // Learning Materials & Private Course Documents
  router.get('/admin/resources', requireAdmin, (req, res) => {
    const courseId = Number(req.query.courseId || 0);
    let sql = `
      SELECT r.id, r.course_id, r.module_id, r.title, r.description, r.resource_type,
             r.file_name, r.mime_type, r.file_size, r.external_url, r.created_at,
             c.name as course_name, m.title as module_title
      FROM learning_resources r
      JOIN courses c ON c.id = r.course_id
      LEFT JOIN course_modules m ON m.id = r.module_id
      WHERE c.is_deleted = 0
    `;
    const args: unknown[] = [];
    if (courseId > 0) {
      sql += ' AND r.course_id = ?';
      args.push(courseId);
    }
    sql += ' ORDER BY r.course_id ASC, COALESCE(m.sort_order, 999) ASC, r.created_at DESC';
    res.json({ resources: db.prepare(sql).all(...args) });
  });

  router.post('/admin/resources', requireAdmin, (req, res) => {
    privateMaterialUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed.' });
        return;
      }

      const courseId = Number(req.body?.course_id);
      const moduleId = req.body?.module_id ? Number(req.body.module_id) : null;
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const resourceType = ['DOCUMENT', 'VIDEO_LINK', 'STUDY_MATERIAL'].includes(String(req.body?.resource_type))
        ? String(req.body.resource_type)
        : req.file
          ? 'DOCUMENT'
          : 'VIDEO_LINK';
      const externalUrl = sanitizeUrl(req.body?.external_url);

      if (!Number.isInteger(courseId) || !title) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'Course and Material Title are required.' });
        return;
      }

      if (resourceType === 'DOCUMENT' && !req.file && !externalUrl) {
        res.status(400).json({ error: 'Please upload a valid file for this document.' });
        return;
      }
      if (resourceType === 'VIDEO_LINK' && !externalUrl && !req.file) {
        res.status(400).json({ error: 'Please provide a valid http/https video link or upload a video file.' });
        return;
      }

      const course = db
        .prepare('SELECT id, name FROM courses WHERE id = ? AND is_deleted = 0')
        .get(courseId) as { id: number; name: string } | undefined;
      if (!course) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(404).json({ error: 'Target course not found.' });
        return;
      }

      const insert = db
        .prepare(
          `INSERT INTO learning_resources (
            course_id, module_id, title, description, resource_type,
            file_name, stored_path, mime_type, file_size, external_url, uploaded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          courseId,
          moduleId && Number.isInteger(moduleId) ? moduleId : null,
          title,
          description,
          resourceType,
          req.file ? req.file.originalname : '',
          req.file ? req.file.filename : '',
          req.file ? req.file.mimetype : '',
          req.file ? req.file.size : 0,
          externalUrl,
          req.authUser!.id
        );

      const resId = Number(insert.lastInsertRowid);

      notifyCourseStudents(
        courseId,
        'NEW_DOCUMENT',
        `New Learning Material: ${title}`,
        `A new ${resourceType === 'VIDEO_LINK' ? 'video lecture' : 'document'} "${title}" was added to ${course.name}.`,
        '/student/dashboard'
      );

      logActivity({
        actorUserId: req.authUser!.id,
        actorName: req.authUser!.full_name,
        actorRole: req.authUser!.role,
        action: 'MATERIAL_UPLOADED',
        entityType: 'learning_resource',
        entityId: resId,
        details: `Added "${title}" to ${course.name}`,
      });

      broadcastEvent('resources:changed', { courseId });
      broadcastEvent('stats:updated');

      const created = db
        .prepare(
          `SELECT id, course_id, module_id, title, description, resource_type, file_name, mime_type, file_size, external_url, created_at
           FROM learning_resources WHERE id = ?`
        )
        .get(resId);
      res.status(201).json({ resource: created });
    });
  });

  router.put('/admin/resources/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid resource ID.' });
      return;
    }
    const existing = db.prepare('SELECT * FROM learning_resources WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Learning material not found.' });
      return;
    }

    const title = String(req.body?.title ?? existing.title).trim();
    const description = String(req.body?.description ?? existing.description).trim();
    const moduleId =
      req.body?.module_id !== undefined
        ? req.body.module_id
          ? Number(req.body.module_id)
          : null
        : existing.module_id;
    const externalUrl =
      req.body?.external_url !== undefined
        ? sanitizeUrl(req.body.external_url)
        : String(existing.external_url || '');

    db.prepare(
      `UPDATE learning_resources SET title = ?, description = ?, module_id = ?, external_url = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(title, description, moduleId, externalUrl, id);

    broadcastEvent('resources:changed', { courseId: existing.course_id });
    res.json({ ok: true });
  });

  router.delete('/admin/resources/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid resource ID.' });
      return;
    }
    const existing = db
      .prepare('SELECT id, course_id, title, stored_path FROM learning_resources WHERE id = ?')
      .get(id) as { id: number; course_id: number; title: string; stored_path: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Learning material not found.' });
      return;
    }

    db.prepare('DELETE FROM learning_resources WHERE id = ?').run(id);
    if (existing.stored_path) {
      const target = resolveConfinedPath(PRIVATE_UPLOAD_DIR, existing.stored_path);
      if (target && fs.existsSync(target)) {
        fs.unlink(target, () => {});
      }
    }

    broadcastEvent('resources:changed', { courseId: existing.course_id });
    broadcastEvent('stats:updated');
    res.json({ ok: true });
  });

  // Assignments Management
  router.get('/admin/assignments', requireAdmin, (req, res) => {
    const courseId = Number(req.query.courseId || 0);
    let sql = `
      SELECT a.*, c.name as course_name, m.title as module_title,
             (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) as submission_count
      FROM assignments a
      JOIN courses c ON c.id = a.course_id
      LEFT JOIN course_modules m ON m.id = a.module_id
      WHERE c.is_deleted = 0
    `;
    const args: unknown[] = [];
    if (courseId > 0) {
      sql += ' AND a.course_id = ?';
      args.push(courseId);
    }
    sql += ' ORDER BY a.created_at DESC';
    res.json({ assignments: db.prepare(sql).all(...args) });
  });

  router.post('/admin/assignments', requireAdmin, (req, res) => {
    const courseId = Number(req.body?.course_id);
    const moduleId = req.body?.module_id ? Number(req.body.module_id) : null;
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const dueDate = String(req.body?.due_date || '').trim();
    const maxScore = Math.max(1, Number(req.body?.max_score || 100));

    if (!Number.isInteger(courseId) || !title || !description) {
      res.status(400).json({ error: 'Course, Assignment Title, and Instructions are required.' });
      return;
    }

    const insert = db
      .prepare(
        `INSERT INTO assignments (course_id, module_id, title, description, due_date, max_score, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(courseId, moduleId, title, description, dueDate, maxScore, req.authUser!.id);

    notifyCourseStudents(
      courseId,
      'ASSIGNMENT',
      `New Assignment: ${title}`,
      `A new assignment "${title}" has been posted${dueDate ? ` (Due: ${dueDate})` : ''}.`,
      '/student/dashboard'
    );

    broadcastEvent('assignments:changed', { courseId });
    res.status(201).json({
      assignment: db.prepare('SELECT * FROM assignments WHERE id = ?').get(Number(insert.lastInsertRowid)),
    });
  });

  router.delete('/admin/assignments/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
    broadcastEvent('assignments:changed');
    res.json({ ok: true });
  });

  router.get('/admin/assignments/:id/submissions', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const rows = db
      .prepare(
        `SELECT s.*, u.full_name as student_name, u.username, sp.enrollment_number
         FROM assignment_submissions s
         JOIN users u ON u.id = s.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE s.assignment_id = ?
         ORDER BY s.submitted_at DESC`
      )
      .all(id);
    res.json({ submissions: rows });
  });

  router.put('/admin/submissions/:id/grade', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const score = Number(req.body?.score);
    const feedback = String(req.body?.feedback || '').trim();
    if (Number.isNaN(score) || score < 0) {
      res.status(400).json({ error: 'Valid numeric score is required.' });
      return;
    }
    db.prepare(
      `UPDATE assignment_submissions SET score = ?, feedback = ?, status = 'GRADED', graded_at = datetime('now') WHERE id = ?`
    ).run(score, feedback, id);
    broadcastEvent('assignments:changed');
    res.json({ ok: true });
  });

  // Announcements Management
  router.get('/admin/announcements', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT a.*, c.name as course_name
         FROM announcements a
         LEFT JOIN courses c ON c.id = a.course_id
         ORDER BY a.created_at DESC`
      )
      .all();
    res.json({ announcements: rows });
  });

  router.post('/admin/announcements', requireAdmin, (req, res) => {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const courseId = req.body?.course_id ? Number(req.body.course_id) : null;
    const priority = ['NORMAL', 'IMPORTANT', 'URGENT'].includes(String(req.body?.priority))
      ? String(req.body.priority)
      : 'NORMAL';
    const isPublished = req.body?.is_published === false ? 0 : 1;

    if (!title || !content) {
      res.status(400).json({ error: 'Announcement title and content are required.' });
      return;
    }

    const insert = db
      .prepare(
        `INSERT INTO announcements (title, content, course_id, priority, is_published, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(title, content, courseId, priority, isPublished, req.authUser!.id);

    if (isPublished) {
      notifyCourseStudents(courseId, 'ANNOUNCEMENT', title, content.slice(0, 180), '/student/dashboard');
    }

    logActivity({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      actorRole: req.authUser!.role,
      action: 'ANNOUNCEMENT_CREATED',
      entityType: 'announcement',
      entityId: Number(insert.lastInsertRowid),
      details: `Published announcement: ${title}`,
    });

    broadcastEvent('announcements:changed', { courseId });
    res.status(201).json({
      announcement: db.prepare('SELECT * FROM announcements WHERE id = ?').get(Number(insert.lastInsertRowid)),
    });
  });

  router.put('/admin/announcements/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    const title = String(req.body?.title ?? existing.title).trim();
    const content = String(req.body?.content ?? existing.content).trim();
    const courseId =
      req.body?.course_id !== undefined
        ? req.body.course_id
          ? Number(req.body.course_id)
          : null
        : existing.course_id;
    const priority = ['NORMAL', 'IMPORTANT', 'URGENT'].includes(String(req.body?.priority ?? existing.priority))
      ? String(req.body?.priority ?? existing.priority)
      : String(existing.priority);
    const isPublished =
      req.body?.is_published !== undefined ? (req.body.is_published ? 1 : 0) : Number(existing.is_published);

    db.prepare(
      `UPDATE announcements SET title = ?, content = ?, course_id = ?, priority = ?, is_published = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(title, content, courseId, priority, isPublished, id);

    broadcastEvent('announcements:changed', { courseId });
    res.json({ ok: true });
  });

  router.delete('/admin/announcements/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    broadcastEvent('announcements:changed');
    res.json({ ok: true });
  });

  // Meetings Management
  router.get('/admin/meetings', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT m.*, c.name as course_name
         FROM meetings m
         JOIN courses c ON c.id = m.course_id
         ORDER BY m.scheduled_at DESC`
      )
      .all();
    res.json({ meetings: rows });
  });

  router.post('/admin/meetings', requireAdmin, (req, res) => {
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const courseId = Number(req.body?.course_id);
    const batchName = String(req.body?.batch_name || 'All Batches').trim();
    const scheduledAt = String(req.body?.scheduled_at || '').trim();
    const durationMinutes = Math.max(10, Number(req.body?.duration_minutes || 60));
    const meetingUrl = sanitizeUrl(req.body?.meeting_url);
    const platform = String(req.body?.platform || 'Google Meet').trim();

    if (!title || !Number.isInteger(courseId) || !scheduledAt || !meetingUrl) {
      res.status(400).json({ error: 'Title, Course, Date/Time, and valid Meeting URL (https://) are required.' });
      return;
    }

    const insert = db
      .prepare(
        `INSERT INTO meetings (title, description, course_id, batch_name, scheduled_at, duration_minutes, meeting_url, platform, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(title, description, courseId, batchName, scheduledAt, durationMinutes, meetingUrl, platform, req.authUser!.id);

    notifyCourseStudents(
      courseId,
      'MEETING',
      `Live Session Scheduled: ${title}`,
      `${platform} session scheduled for ${scheduledAt} (${durationMinutes} min).`,
      '/student/dashboard'
    );

    logActivity({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      actorRole: req.authUser!.role,
      action: 'MEETING_SCHEDULED',
      entityType: 'meeting',
      entityId: Number(insert.lastInsertRowid),
      details: `Scheduled ${title} for course #${courseId}`,
    });

    broadcastEvent('meetings:changed', { courseId });
    res.status(201).json({
      meeting: db.prepare('SELECT * FROM meetings WHERE id = ?').get(Number(insert.lastInsertRowid)),
    });
  });

  router.put('/admin/meetings/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Meeting not found.' });
      return;
    }
    const title = String(req.body?.title ?? existing.title).trim();
    const description = String(req.body?.description ?? existing.description).trim();
    const batchName = String(req.body?.batch_name ?? existing.batch_name).trim();
    const scheduledAt = String(req.body?.scheduled_at ?? existing.scheduled_at).trim();
    const durationMinutes = Math.max(10, Number(req.body?.duration_minutes ?? existing.duration_minutes));
    const meetingUrl =
      req.body?.meeting_url !== undefined ? sanitizeUrl(req.body.meeting_url) : String(existing.meeting_url);
    const platform = String(req.body?.platform ?? existing.platform).trim();

    db.prepare(
      `UPDATE meetings SET title = ?, description = ?, batch_name = ?, scheduled_at = ?, duration_minutes = ?, meeting_url = ?, platform = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(title, description, batchName, scheduledAt, durationMinutes, meetingUrl, platform, id);

    broadcastEvent('meetings:changed');
    res.json({ ok: true });
  });

  router.delete('/admin/meetings/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
    broadcastEvent('meetings:changed');
    res.json({ ok: true });
  });

  // Email Management & Automated Student Login Credentials Email System
  router.get('/admin/emails', requireAdmin, (_req, res) => {
    const logs = db
      .prepare('SELECT * FROM email_logs ORDER BY id DESC LIMIT 300')
      .all();
    const smtp = getSmtpConfig();
    const providerStatus = getEmailProviderStatus();
    res.json({
      logs,
      providerStatus,
      smtpStatus: {
        configured: providerStatus.configured,
        provider: providerStatus.provider,
        host: providerStatus.host,
        port: providerStatus.port,
        from: smtp.from,
        details: providerStatus.details,
      },
    });
  });

  router.post('/admin/emails/:id/resend', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid email log ID.' });
      return;
    }
    try {
      const result = await resendLoggedEmail(id, getPortalBaseUrl(req));
      broadcastEvent('emails:changed');
      res.json({ result });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Unable to resend email.' });
    }
  });

  router.post('/admin/emails/test', requireAdmin, async (req, res) => {
    const to = String(req.body?.to || req.authUser!.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      res.status(400).json({ error: 'Valid recipient email address required.' });
      return;
    }
    const provider = getEmailProviderStatus();
    const ts = new Date().toISOString();
    const result = await sendLoggedEmail({
      recipientEmail: to,
      recipientName: req.authUser!.full_name,
      subject: 'AITM LMS – Email Delivery Verification Test',
      body: `This is a live delivery test from the Abhinav Institute of Technology & Management (AITM) LMS Admin Panel.\n\nActive Provider: ${provider.provider}\nTimestamp: ${ts}`,
      htmlBody: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;color:#0f172a;"><h2 style="margin:0 0 10px;color:#0f172a;">AITM LMS Email Delivery Verified</h2><p style="margin:0 0 12px;font-size:14px;color:#334155;">This is a live email verification test sent from the Abhinav Institute of Technology &amp; Management (AITM) LMS Admin Panel.</p><p style="margin:0;font-size:12px;color:#64748b;">Active Provider: <strong>${provider.provider}</strong> &bull; Timestamp: ${ts}</p></div>`,
      eventType: 'SMTP_TEST',
    });
    broadcastEvent('emails:changed');
    res.json({ result });
  });

  // Automated Student Login Credentials Email System — Overview of ALL Existing Enrolled Students
  router.get('/admin/credentials-email/summary', requireAdmin, (_req, res) => {
    const overview = getEnrolledStudentsEmailOverview();
    res.json(overview);
  });

  // Preview the branded AITM HTML + plain-text login email template without issuing a live token
  router.post('/admin/credentials-email/preview-template', requireAdmin, (req, res) => {
    const overview = getEnrolledStudentsEmailOverview();
    const requestedId = Number(req.body?.userId || 0);
    const sample =
      (requestedId > 0 ? overview.students.find((s) => s.user_id === requestedId) : undefined) ||
      overview.students[0];

    const portalBaseUrl = getPortalBaseUrl(req);
    const cleanBase = portalBaseUrl.replace(/\/+$/, '');
    const preview = buildStudentCredentialsEmail({
      studentName: sample?.full_name || 'Sample Enrolled Student',
      rollNumber: sample?.roll_number || 'AITM-2026-0001',
      registeredEmail: sample?.email || 'student@example.com',
      username: sample?.username || 'student.aitm',
      candidateId: sample?.candidate_id || 'CAN_00000000',
      courseSummary: sample?.enrolled_courses || 'Digital Mitra',
      portalBaseUrl: cleanBase,
      setupPasswordUrl: `${cleanBase}/forgot-password?token=SECURE_SINGLE_USE_ACTIVATION_LINK_PREVIEW&mode=activate`,
    });

    res.json({
      subject: preview.subject,
      html: preview.html,
      text: preview.text,
      student: sample
        ? {
            user_id: sample.user_id,
            full_name: sample.full_name,
            roll_number: sample.roll_number,
            email: sample.email,
            candidate_id: sample.candidate_id,
            enrolled_courses: sample.enrolled_courses,
          }
        : null,
    });
  });

  // Bulk Action: Send Login Emails to ALL Existing Enrolled Students (with duplicate prevention)
  router.post('/admin/credentials-email/send-all', requireAdmin, async (req, res) => {
    const campaignKey = typeof req.body?.campaignKey === 'string' ? req.body.campaignKey.trim() : undefined;
    try {
      const report = await runBulkStudentCredentialsCampaign({
        portalBaseUrl: getPortalBaseUrl(req),
        mode: 'ALL_EXISTING',
        campaignKey: campaignKey || undefined,
        actor: {
          id: req.authUser!.id,
          full_name: req.authUser!.full_name,
          role: req.authUser!.role,
        },
      });
      broadcastEvent('emails:changed');
      broadcastEvent('stats:updated');
      res.json({
        report,
        overview: getEnrolledStudentsEmailOverview(),
      });
    } catch (err) {
      res.status(409).json({
        error: err instanceof Error ? err.message : 'Unable to start bulk student login email campaign.',
      });
    }
  });

  // Bulk Action: Retry ONLY Failed Student Login Emails
  router.post('/admin/credentials-email/retry-failed', requireAdmin, async (req, res) => {
    try {
      const report = await runBulkStudentCredentialsCampaign({
        portalBaseUrl: getPortalBaseUrl(req),
        mode: 'RETRY_FAILED',
        actor: {
          id: req.authUser!.id,
          full_name: req.authUser!.full_name,
          role: req.authUser!.role,
        },
      });
      broadcastEvent('emails:changed');
      broadcastEvent('stats:updated');
      res.json({
        report,
        overview: getEnrolledStudentsEmailOverview(),
      });
    } catch (err) {
      res.status(409).json({
        error: err instanceof Error ? err.message : 'Unable to retry failed student login emails.',
      });
    }
  });

  // Single Student Action: Send or Resend Login Credentials Email to an Individual Enrolled Student
  router.post('/admin/credentials-email/send-student/:userId', requireAdmin, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: 'Invalid student user ID.' });
      return;
    }

    const forceResend = Boolean(req.body?.forceResend);
    const overview = getEnrolledStudentsEmailOverview();
    const student = overview.students.find((s) => s.user_id === userId);
    if (!student) {
      res.status(404).json({ error: 'Enrolled student not found.' });
      return;
    }

    const result = await sendCredentialsEmailToStudent({
      student,
      portalBaseUrl: getPortalBaseUrl(req),
      eventType: forceResend ? 'STUDENT_LOGIN_CREDENTIALS_RETRY' : 'STUDENT_LOGIN_CREDENTIALS',
      idempotencyKey: forceResend ? undefined : `student_creds_${student.user_id}`,
      forceResend,
    });

    logActivity({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      actorRole: req.authUser!.role,
      action: forceResend ? 'RESEND_STUDENT_LOGIN_EMAIL' : 'SEND_STUDENT_LOGIN_EMAIL',
      entityType: 'user',
      entityId: student.user_id,
      details: `${student.full_name} (${student.roll_number}, ${student.email}): ${result.status} — ${result.message}`,
    });

    broadcastEvent('emails:changed');
    res.json({
      result,
      overview: getEnrolledStudentsEmailOverview(),
    });
  });

  // Reports & Inquiries
  router.get('/admin/reports', requireAdmin, (_req, res) => {
    const courseSummary = db
      .prepare(
        `SELECT c.id, c.code, c.name, c.category, c.mode, c.status,
                COUNT(e.id) as total_enrolled,
                SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count,
                SUM(CASE WHEN e.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN e.status = 'DROPPED' THEN 1 ELSE 0 END) as dropped_count,
                (SELECT COUNT(*) FROM applications a WHERE a.course_id = c.id) as total_applications,
                (SELECT COUNT(*) FROM learning_resources r WHERE r.course_id = c.id) as total_resources
         FROM courses c
         LEFT JOIN enrollments e ON e.course_id = c.id
         WHERE c.is_deleted = 0
         GROUP BY c.id
         ORDER BY total_enrolled DESC`
      )
      .all();

    const applicationFunnel = db
      .prepare('SELECT status, COUNT(*) as count FROM applications GROUP BY status')
      .all();

    const emailDelivery = db
      .prepare('SELECT status, COUNT(*) as count FROM email_logs GROUP BY status')
      .all();

    const sequence = db.prepare('SELECT prefix, last_number FROM enrollment_sequences WHERE id = 1').get();

    res.json({
      courseSummary,
      applicationFunnel,
      emailDelivery,
      sequence,
    });
  });

  router.get('/admin/inquiries', requireAdmin, (_req, res) => {
    res.json({
      inquiries: db.prepare('SELECT * FROM contact_inquiries ORDER BY created_at DESC LIMIT 200').all(),
    });
  });

  router.put('/admin/inquiries/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const status = ['NEW', 'RESPONDED', 'ARCHIVED'].includes(String(req.body?.status))
      ? String(req.body.status)
      : 'RESPONDED';
    db.prepare('UPDATE contact_inquiries SET status = ? WHERE id = ?').run(status, id);
    broadcastEvent('inquiries:changed');
    res.json({ ok: true });
  });

  // Admin Users & Settings
  router.get('/admin/users', requireAdmin, (_req, res) => {
    const admins = db
      .prepare(
        `SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at,
                au.designation, au.department
         FROM users u
         LEFT JOIN admin_users au ON au.user_id = u.id
         WHERE u.role IN ('ADMIN', 'SUPER_ADMIN')
         ORDER BY u.created_at ASC`
      )
      .all();
    res.json({ admins });
  });

  router.post('/admin/users', requireSuperAdmin, (req, res) => {
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = req.body?.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN';
    const designation = String(req.body?.designation || 'Administrator').trim();
    const department = String(req.body?.department || 'Academic Operations').trim();

    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      res.status(400).json({ error: 'Name, valid email, and password (min 8 chars) are required.' });
      return;
    }

    const usernameBase = email.split('@')[0].replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'admin';
    let username = usernameBase;
    let idx = 2;
    while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      username = `${usernameBase}${idx}`;
      idx += 1;
    }

    try {
      const userId = db.transaction(() => {
        const uRes = db
          .prepare(
            `INSERT INTO users (username, email, password_hash, role, full_name, is_active, must_change_password)
             VALUES (?, ?, ?, ?, ?, 1, 0)`
          )
          .run(username, email, hashPassword(password), role, fullName);
        const uid = Number(uRes.lastInsertRowid);
        db.prepare(
          `INSERT INTO admin_users (user_id, designation, department) VALUES (?, ?, ?)`
        ).run(uid, designation, department);
        return uid;
      })();

      logActivity({
        actorUserId: req.authUser!.id,
        actorName: req.authUser!.full_name,
        actorRole: req.authUser!.role,
        action: 'ADMIN_USER_CREATED',
        entityType: 'user',
        entityId: userId,
        details: `Created ${role} account for ${fullName} (${email})`,
      });

      res.status(201).json({ id: userId, username, email, role, full_name: fullName });
    } catch {
      res.status(409).json({ error: 'An account with this email address already exists.' });
    }
  });

  router.put('/admin/users/:id/status', requireSuperAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.authUser!.id) {
      res.status(400).json({ error: 'You cannot deactivate your own active Super Admin account.' });
      return;
    }
    const isActive = req.body?.is_active ? 1 : 0;
    db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND role IN ('ADMIN', 'SUPER_ADMIN')").run(
      isActive,
      id
    );
    if (!isActive) revokeAllUserSessions(id);
    res.json({ ok: true });
  });

  // =========================================================================
  // 4. STUDENT PORTAL ROUTES (Strictly scoped to authenticated student)
  // =========================================================================

  router.get('/student/overview', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const profile = db
      .prepare(
        `SELECT u.id, u.username, u.email, u.full_name, u.must_change_password,
                sp.enrollment_number, sp.employee_code, sp.mobile, sp.dob, sp.gender, sp.qualification, sp.city, sp.state, sp.account_status
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = ?`
      )
      .get(uid);

    const enrollments = db
      .prepare(
        `SELECT e.*,
                COALESCE(NULLIF(e.employee_code_snapshot, ''), sp.employee_code, '') as employee_code,
                c.image_url, c.short_description, c.mode, c.level, c.category, c.code as course_code
         FROM enrollments e
         LEFT JOIN student_profiles sp ON sp.user_id = e.student_user_id
         LEFT JOIN courses c ON c.id = e.course_id
         WHERE e.student_user_id = ?
         ORDER BY e.created_at DESC`
      )
      .all(uid) as Array<Record<string, unknown>>;

    const courseIds = enrollments.map((e) => Number(e.course_id));

    let recentAnnouncements: unknown[] = [];
    let upcomingMeetings: unknown[] = [];
    let availableDocuments: unknown[] = [];

    if (courseIds.length > 0) {
      const placeholders = courseIds.map(() => '?').join(',');
      recentAnnouncements = db
        .prepare(
          `SELECT a.*, c.name as course_name
           FROM announcements a
           LEFT JOIN courses c ON c.id = a.course_id
           WHERE a.is_published = 1 AND (a.course_id IS NULL OR a.course_id IN (${placeholders}))
           ORDER BY a.created_at DESC
           LIMIT 5`
        )
        .all(...courseIds);

      upcomingMeetings = db
        .prepare(
          `SELECT m.*, c.name as course_name
           FROM meetings m
           JOIN courses c ON c.id = m.course_id
           WHERE m.course_id IN (${placeholders})
           ORDER BY m.scheduled_at ASC
           LIMIT 5`
        )
        .all(...courseIds);

      availableDocuments = db
        .prepare(
          `SELECT r.id, r.course_id, r.module_id, r.title, r.resource_type, r.file_name, r.mime_type, r.file_size, r.external_url, r.created_at,
                  c.name as course_name, m.title as module_title
           FROM learning_resources r
           JOIN courses c ON c.id = r.course_id
           LEFT JOIN course_modules m ON m.id = r.module_id
           WHERE r.course_id IN (${placeholders})
           ORDER BY r.created_at DESC
           LIMIT 8`
        )
        .all(...courseIds);
    } else {
      recentAnnouncements = db
        .prepare('SELECT * FROM announcements WHERE is_published = 1 AND course_id IS NULL ORDER BY created_at DESC LIMIT 5')
        .all();
    }

    const unreadNotifications = (
      db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(uid) as {
        c: number;
      }
    ).c;

    res.json({
      profile,
      enrollments,
      recentAnnouncements,
      upcomingMeetings,
      availableDocuments,
      unreadNotifications,
    });
  });

  router.get('/student/courses', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const rows = db
      .prepare(
        `SELECT e.id as enrollment_id, e.enrollment_number,
                COALESCE(NULLIF(e.employee_code_snapshot, ''), sp.employee_code, '') as employee_code,
                e.enrollment_type, e.payment_status,
                e.enrollment_date, e.status as enrollment_status,
                e.progress_percent, e.batch_name, e.course_name_snapshot, e.course_duration_snapshot,
                c.id as course_id, c.code, c.name, c.short_description, c.detailed_description, c.image_url,
                c.category, c.duration_value, c.duration_unit, c.total_training_hours, c.level, c.mode, c.certificate_info,
                (SELECT COUNT(*) FROM learning_resources r WHERE r.course_id = e.course_id) as resource_count,
                (SELECT COUNT(*) FROM course_modules m WHERE m.course_id = e.course_id) as module_count
         FROM enrollments e
         LEFT JOIN student_profiles sp ON sp.user_id = e.student_user_id
         LEFT JOIN courses c ON c.id = e.course_id
         WHERE e.student_user_id = ?
         ORDER BY e.created_at DESC`
      )
      .all(uid);
    res.json({ courses: rows });
  });

  router.get('/student/courses/:id', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId)) {
      res.status(400).json({ error: 'Invalid course ID.' });
      return;
    }

    const enrollment = db
      .prepare('SELECT * FROM enrollments WHERE student_user_id = ? AND course_id = ?')
      .get(uid, courseId);

    if (!enrollment) {
      res.status(403).json({ error: 'Access denied. You are not enrolled in this course.' });
      return;
    }

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as Record<string, unknown>;
    const modules = db
      .prepare('SELECT * FROM course_modules WHERE course_id = ? ORDER BY sort_order ASC, id ASC')
      .all(courseId);
    const resources = db
      .prepare(
        `SELECT id, course_id, module_id, title, description, resource_type, file_name, mime_type, file_size, external_url, created_at
         FROM learning_resources
         WHERE course_id = ?
         ORDER BY created_at ASC`
      )
      .all(courseId);
    const assignments = db
      .prepare(
        `SELECT a.*, s.id as submission_id, s.submission_text, s.file_name as submission_file,
                s.score, s.feedback, s.status as submission_status, s.submitted_at
         FROM assignments a
         LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_user_id = ?
         WHERE a.course_id = ?
         ORDER BY a.created_at DESC`
      )
      .all(uid, courseId);
    const meetings = db
      .prepare('SELECT * FROM meetings WHERE course_id = ? ORDER BY scheduled_at ASC')
      .all(courseId);
    const announcements = db
      .prepare(
        'SELECT * FROM announcements WHERE is_published = 1 AND (course_id = ? OR course_id IS NULL) ORDER BY created_at DESC'
      )
      .all(courseId);

    res.json({
      enrollment,
      course: course ? formatCourseRow(course) : null,
      modules,
      resources,
      assignments,
      meetings,
      announcements,
    });
  });

  router.get('/student/materials', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const rows = db
      .prepare(
        `SELECT r.id, r.course_id, r.module_id, r.title, r.description, r.resource_type,
                r.file_name, r.mime_type, r.file_size, r.external_url, r.created_at,
                c.name as course_name, m.title as module_title, COALESCE(m.sort_order, 999) as module_order
         FROM learning_resources r
         JOIN enrollments e ON e.course_id = r.course_id AND e.student_user_id = ?
         JOIN courses c ON c.id = r.course_id
         LEFT JOIN course_modules m ON m.id = r.module_id
         ORDER BY c.name ASC, module_order ASC, r.created_at DESC`
      )
      .all(uid);
    res.json({ materials: rows });
  });

  router.get('/student/assignments', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const rows = db
      .prepare(
        `SELECT a.*, c.name as course_name, m.title as module_title,
                s.id as submission_id, s.submission_text, s.file_name as submission_file,
                s.score, s.feedback, s.status as submission_status, s.submitted_at
         FROM assignments a
         JOIN enrollments e ON e.course_id = a.course_id AND e.student_user_id = ?
         JOIN courses c ON c.id = a.course_id
         LEFT JOIN course_modules m ON m.id = a.module_id
         LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_user_id = ?
         ORDER BY a.created_at DESC`
      )
      .all(uid, uid);
    res.json({ assignments: rows });
  });

  router.post('/student/assignments/:id/submit', requireStudent, (req, res) => {
    privateMaterialUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'File upload failed.' });
        return;
      }
      const assignmentId = Number(req.params.id);
      const uid = req.authUser!.id;
      const assignment = db
        .prepare('SELECT id, course_id, title FROM assignments WHERE id = ?')
        .get(assignmentId) as { id: number; course_id: number; title: string } | undefined;

      if (!assignment) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(404).json({ error: 'Assignment not found.' });
        return;
      }

      const enrolled = db
        .prepare('SELECT id FROM enrollments WHERE student_user_id = ? AND course_id = ?')
        .get(uid, assignment.course_id);
      if (!enrolled) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(403).json({ error: 'Access denied. You are not enrolled in this course.' });
        return;
      }

      const submissionText = String(req.body?.submission_text || '').trim();
      if (!submissionText && !req.file) {
        res.status(400).json({ error: 'Please enter a response or attach a submission file.' });
        return;
      }

      db.prepare(
        `INSERT INTO assignment_submissions (assignment_id, student_user_id, submission_text, file_name, stored_path, status, submitted_at)
         VALUES (?, ?, ?, ?, ?, 'SUBMITTED', datetime('now'))
         ON CONFLICT(assignment_id, student_user_id) DO UPDATE SET
           submission_text = excluded.submission_text,
           file_name = CASE WHEN excluded.file_name != '' THEN excluded.file_name ELSE assignment_submissions.file_name END,
           stored_path = CASE WHEN excluded.stored_path != '' THEN excluded.stored_path ELSE assignment_submissions.stored_path END,
           status = 'SUBMITTED',
           submitted_at = datetime('now')`
      ).run(
        assignmentId,
        uid,
        submissionText,
        req.file ? req.file.originalname : '',
        req.file ? req.file.filename : ''
      );

      broadcastEvent('assignments:changed', { courseId: assignment.course_id });
      res.status(201).json({ ok: true, message: 'Assignment submitted successfully.' });
    });
  });

  router.get('/student/meetings', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const rows = db
      .prepare(
        `SELECT m.*, c.name as course_name
         FROM meetings m
         JOIN enrollments e ON e.course_id = m.course_id AND e.student_user_id = ?
         JOIN courses c ON c.id = m.course_id
         ORDER BY m.scheduled_at ASC`
      )
      .all(uid);
    res.json({ meetings: rows });
  });

  router.get('/student/announcements', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const rows = db
      .prepare(
        `SELECT DISTINCT a.*, c.name as course_name
         FROM announcements a
         LEFT JOIN courses c ON c.id = a.course_id
         WHERE a.is_published = 1
           AND (
             a.course_id IS NULL
             OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_user_id = ? AND e.course_id = a.course_id)
           )
         ORDER BY a.created_at DESC`
      )
      .all(uid);
    res.json({ announcements: rows });
  });

  router.get('/student/notifications', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const rows = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(uid);
    res.json({ notifications: rows });
  });

  router.put('/student/notifications/read-all', requireStudent, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  router.put('/student/notifications/:id/read', requireStudent, (req, res) => {
    const id = Number(req.params.id);
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.authUser!.id);
    res.json({ ok: true });
  });

  router.get('/student/profile', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const profile = db
      .prepare(
        `SELECT u.id, u.username, u.email, u.full_name, u.created_at,
                sp.enrollment_number, sp.employee_code, sp.mobile, sp.dob, sp.gender, sp.qualification, sp.city, sp.state, sp.account_status
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = ?`
      )
      .get(uid);
    res.json({ profile });
  });

  router.put('/student/profile', requireStudent, (req, res) => {
    const uid = req.authUser!.id;
    const b = req.body || {};
    db.prepare(
      `UPDATE student_profiles SET
        mobile = COALESCE(?, mobile),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        qualification = COALESCE(?, qualification),
        updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(
      b.mobile !== undefined ? String(b.mobile).trim() : null,
      b.city !== undefined ? String(b.city).trim() : null,
      b.state !== undefined ? String(b.state).trim() : null,
      b.qualification !== undefined ? String(b.qualification).trim() : null,
      uid
    );
    res.json({ ok: true, message: 'Profile updated successfully.' });
  });

  // =========================================================================
  // 5. AUTHORIZED PRIVATE DOCUMENT STREAMING (Strict Course Enrollment Check)
  // =========================================================================

  router.get('/resources/:id/file', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid resource ID.' });
      return;
    }

    const resource = db
      .prepare('SELECT id, course_id, file_name, stored_path, mime_type FROM learning_resources WHERE id = ?')
      .get(id) as
      | { id: number; course_id: number; file_name: string; stored_path: string; mime_type: string }
      | undefined;

    if (!resource || !resource.stored_path) {
      res.status(404).json({ error: 'Private document not found.' });
      return;
    }

    // Strict Authorization: Students must be enrolled in resource.course_id
    if (req.authUser!.role === 'STUDENT') {
      const enrolled = db
        .prepare('SELECT id FROM enrollments WHERE student_user_id = ? AND course_id = ?')
        .get(req.authUser!.id, resource.course_id);
      if (!enrolled) {
        res.status(403).json({
          error: 'Forbidden: You do not have permission to access documents from a course you are not enrolled in.',
        });
        return;
      }
    }

    const confinedPath = resolveConfinedPath(PRIVATE_UPLOAD_DIR, resource.stored_path);
    if (!confinedPath || !fs.existsSync(confinedPath)) {
      res.status(404).json({ error: 'Document file is unavailable on storage.' });
      return;
    }

    const download = req.query.download === '1';
    const safeFileName = (resource.file_name || 'document').replace(/["\r\n]/g, '_');

    res.setHeader('Content-Type', resource.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${safeFileName}"`
    );

    fs.createReadStream(confinedPath).pipe(res);
  });

  router.get('/submissions/:id/file', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid submission ID.' });
      return;
    }
    const sub = db
      .prepare('SELECT id, student_user_id, file_name, stored_path FROM assignment_submissions WHERE id = ?')
      .get(id) as { id: number; student_user_id: number; file_name: string; stored_path: string } | undefined;

    if (!sub || !sub.stored_path) {
      res.status(404).json({ error: 'Submission file not found.' });
      return;
    }
    if (req.authUser!.role === 'STUDENT' && sub.student_user_id !== req.authUser!.id) {
      res.status(403).json({ error: 'Forbidden: Cannot access another student submission.' });
      return;
    }

    const confinedPath = resolveConfinedPath(PRIVATE_UPLOAD_DIR, sub.stored_path);
    if (!confinedPath || !fs.existsSync(confinedPath)) {
      res.status(404).json({ error: 'File unavailable.' });
      return;
    }

    const safeFileName = (sub.file_name || 'submission').replace(/["\r\n]/g, '_');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    fs.createReadStream(confinedPath).pipe(res);
  });

  return router;
}

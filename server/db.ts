import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const ROOT_DIR = process.cwd();
export const DATA_DIR = path.resolve(ROOT_DIR, 'data');
export const PUBLIC_UPLOAD_DIR = path.resolve(ROOT_DIR, 'uploads', 'public');
export const PRIVATE_UPLOAD_DIR = path.resolve(ROOT_DIR, 'uploads', 'private');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });

const DB_PATH = path.resolve(DATA_DIR, 'aitm.sqlite');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function buildSimplePdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const textCommands = [
    'BT',
    '/F1 18 Tf',
    '50 750 Td',
    `(${esc(title)}) Tj`,
    '/F1 11 Tf',
    '0 -28 Td',
    ...lines.flatMap((line) => [`(${esc(line)}) Tj`, '0 -18 Td']),
    'ET',
  ].join('\n');

  const objects: string[] = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push(
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj'
  );
  objects.push(
    `4 0 obj << /Length ${Buffer.byteLength(textCommands, 'utf8')} >> stream\n${textCommands}\nendstream endobj`
  );
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += obj + '\n';
  }
  const xrefStart = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, 'utf8');
}

function hashPasswordRaw(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
      (r) => r.version
    )
  );

  const migrations: Array<{ version: number; name: string; sql: string }> = [
    {
      version: 1,
      name: 'initial_aitm_lms_schema',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'STUDENT')),
          full_name TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          must_change_password INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS admin_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          designation TEXT NOT NULL DEFAULT 'Administrator',
          department TEXT NOT NULL DEFAULT 'Administration',
          permissions_json TEXT NOT NULL DEFAULT '["ALL"]',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token_hash TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS institute_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          website_title TEXT NOT NULL,
          institute_name TEXT NOT NULL,
          short_name TEXT NOT NULL,
          tagline TEXT NOT NULL,
          logo_url TEXT NOT NULL DEFAULT '',
          favicon_url TEXT NOT NULL DEFAULT '',
          hero_heading TEXT NOT NULL,
          hero_description TEXT NOT NULL,
          hero_banner_url TEXT NOT NULL DEFAULT '',
          about_image_url TEXT NOT NULL DEFAULT '',
          about_us TEXT NOT NULL,
          vision TEXT NOT NULL,
          mission TEXT NOT NULL,
          achievements_json TEXT NOT NULL DEFAULT '[]',
          chairman_name TEXT NOT NULL DEFAULT '',
          chairman_designation TEXT NOT NULL DEFAULT '',
          chairman_message TEXT NOT NULL DEFAULT '',
          chairman_image_url TEXT NOT NULL DEFAULT '',
          management_json TEXT NOT NULL DEFAULT '[]',
          address TEXT NOT NULL,
          phone TEXT NOT NULL,
          alt_phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL,
          website_url TEXT NOT NULL,
          map_embed_url TEXT NOT NULL DEFAULT '',
          footer_text TEXT NOT NULL,
          copyright_text TEXT NOT NULL,
          social_links_json TEXT NOT NULL DEFAULT '{}',
          certifications_json TEXT NOT NULL DEFAULT '[]',
          affiliations_json TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS courses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          short_description TEXT NOT NULL,
          detailed_description TEXT NOT NULL,
          image_url TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL,
          duration_value INTEGER NOT NULL DEFAULT 1,
          duration_unit TEXT NOT NULL CHECK (duration_unit IN ('Days', 'Weeks', 'Months', 'Years')),
          total_training_hours INTEGER NOT NULL DEFAULT 0,
          level TEXT NOT NULL DEFAULT 'Intermediate',
          eligibility TEXT NOT NULL DEFAULT 'Open to eligible learners',
          mode TEXT NOT NULL CHECK (mode IN ('Online', 'Offline', 'Hybrid')),
          fees TEXT NOT NULL DEFAULT '',
          start_date TEXT NOT NULL DEFAULT '',
          end_date TEXT NOT NULL DEFAULT '',
          syllabus_json TEXT NOT NULL DEFAULT '[]',
          certificate_info TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
          is_deleted INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status, is_deleted);

        CREATE TABLE IF NOT EXISTS enrollment_sequences (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          prefix TEXT NOT NULL DEFAULT 'AITM',
          last_number INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS student_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          enrollment_number TEXT NOT NULL UNIQUE,
          mobile TEXT NOT NULL DEFAULT '',
          dob TEXT NOT NULL DEFAULT '',
          gender TEXT NOT NULL DEFAULT '',
          qualification TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          state TEXT NOT NULL DEFAULT '',
          avatar_url TEXT NOT NULL DEFAULT '',
          account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'ALUMNI')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS applications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          application_code TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL,
          mobile TEXT NOT NULL,
          dob TEXT NOT NULL,
          gender TEXT NOT NULL,
          qualification TEXT NOT NULL,
          city TEXT NOT NULL,
          state TEXT NOT NULL,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
          additional_info TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
          admin_notes TEXT NOT NULL DEFAULT '',
          reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          reviewed_at TEXT,
          enrollment_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status, course_id);

        CREATE TABLE IF NOT EXISTS enrollments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
          enrollment_number TEXT NOT NULL UNIQUE,
          student_name_snapshot TEXT NOT NULL,
          student_email_snapshot TEXT NOT NULL,
          student_mobile_snapshot TEXT NOT NULL DEFAULT '',
          course_name_snapshot TEXT NOT NULL,
          course_duration_snapshot TEXT NOT NULL,
          enrollment_date TEXT NOT NULL DEFAULT (date('now')),
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED')),
          progress_percent INTEGER NOT NULL DEFAULT 0,
          batch_name TEXT NOT NULL DEFAULT 'Batch 2026',
          application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(student_user_id, course_id)
        );
        CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id, status);
        CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_user_id);

        CREATE TABLE IF NOT EXISTS course_modules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_modules_course ON course_modules(course_id, sort_order);

        CREATE TABLE IF NOT EXISTS learning_resources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          module_id INTEGER REFERENCES course_modules(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          resource_type TEXT NOT NULL CHECK (resource_type IN ('DOCUMENT', 'VIDEO_LINK', 'STUDY_MATERIAL')),
          file_name TEXT NOT NULL DEFAULT '',
          stored_path TEXT NOT NULL DEFAULT '',
          mime_type TEXT NOT NULL DEFAULT '',
          file_size INTEGER NOT NULL DEFAULT 0,
          external_url TEXT NOT NULL DEFAULT '',
          uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_resources_course ON learning_resources(course_id, module_id);

        CREATE TABLE IF NOT EXISTS assignments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          module_id INTEGER REFERENCES course_modules(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          due_date TEXT NOT NULL DEFAULT '',
          max_score INTEGER NOT NULL DEFAULT 100,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);

        CREATE TABLE IF NOT EXISTS assignment_submissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
          student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          submission_text TEXT NOT NULL DEFAULT '',
          file_name TEXT NOT NULL DEFAULT '',
          stored_path TEXT NOT NULL DEFAULT '',
          score INTEGER,
          feedback TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'GRADED')),
          submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
          graded_at TEXT,
          UNIQUE(assignment_id, student_user_id)
        );

        CREATE TABLE IF NOT EXISTS announcements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
          priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'IMPORTANT', 'URGENT')),
          is_published INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_announcements_course ON announcements(course_id, is_published);

        CREATE TABLE IF NOT EXISTS meetings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          batch_name TEXT NOT NULL DEFAULT 'All Batches',
          scheduled_at TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL DEFAULT 60,
          meeting_url TEXT NOT NULL,
          platform TEXT NOT NULL DEFAULT 'Google Meet',
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_meetings_course ON meetings(course_id, scheduled_at);

        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          link TEXT NOT NULL DEFAULT '',
          is_read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

        CREATE TABLE IF NOT EXISTS email_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recipient_email TEXT NOT NULL,
          recipient_name TEXT NOT NULL DEFAULT '',
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          event_type TEXT NOT NULL,
          related_enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL,
          idempotency_key TEXT UNIQUE,
          status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED', 'NOT_CONFIGURED')),
          provider_response TEXT NOT NULL DEFAULT '',
          error_message TEXT NOT NULL DEFAULT '',
          sent_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_email_logs_event ON email_logs(event_type, status);

        CREATE TABLE IF NOT EXISTS activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          actor_name TEXT NOT NULL DEFAULT 'System',
          actor_role TEXT NOT NULL DEFAULT 'SYSTEM',
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL DEFAULT '',
          details TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS contact_inquiries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL DEFAULT '',
          subject TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'RESPONDED', 'ARCHIVED')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `,
    },
    {
      version: 2,
      name: 'add_employee_code_demo_payment_fields',
      sql: `
        ALTER TABLE student_profiles ADD COLUMN employee_code TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_student_profiles_emp_code ON student_profiles(employee_code);
        ALTER TABLE enrollments ADD COLUMN employee_code_snapshot TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN enrollment_type TEXT NOT NULL DEFAULT 'Regular';
        ALTER TABLE enrollments ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'Pending';
      `,
    },
    {
      version: 3,
      name: 'add_batches_candidate_id_and_extra_fields',
      sql: `
        CREATE TABLE IF NOT EXISTS batches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_code TEXT NOT NULL UNIQUE,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          batch_name TEXT NOT NULL DEFAULT '',
          start_date TEXT NOT NULL DEFAULT '',
          end_date TEXT NOT NULL DEFAULT '',
          trainer_id TEXT NOT NULL DEFAULT '',
          trainer_name TEXT NOT NULL DEFAULT '',
          skilling_category TEXT NOT NULL DEFAULT '',
          course_type TEXT NOT NULL DEFAULT '',
          sector_covered TEXT NOT NULL DEFAULT '',
          course_fee TEXT NOT NULL DEFAULT '',
          fee_paid_by TEXT NOT NULL DEFAULT '',
          tc_id TEXT NOT NULL DEFAULT '',
          tc_name TEXT NOT NULL DEFAULT '',
          tc_centre TEXT NOT NULL DEFAULT '',
          tc_district TEXT NOT NULL DEFAULT '',
          tc_pincode TEXT NOT NULL DEFAULT '',
          assessment_mode TEXT NOT NULL DEFAULT '',
          assessment_from_date TEXT NOT NULL DEFAULT '',
          assessment_to_date TEXT NOT NULL DEFAULT '',
          certificate_name TEXT NOT NULL DEFAULT '',
          placement_type TEXT NOT NULL DEFAULT '',
          extra_fields_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_batches_course ON batches(course_id);

        ALTER TABLE courses ADD COLUMN source_course_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE courses ADD COLUMN sector TEXT NOT NULL DEFAULT '';
        ALTER TABLE courses ADD COLUMN course_type TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_courses_source_id ON courses(source_course_id);

        ALTER TABLE student_profiles ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN salutation TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN marital_status TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN fathers_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN mothers_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN guardians_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN religion TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN category TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN disability TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN domicile_state TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN domicile_district TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN id_type TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN country_code TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN permanent_address TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN permanent_district TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN permanent_pincode TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN permanent_tehsil TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN comm_same_as_permanent TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN comm_state TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN comm_district TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN comm_pincode TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN comm_city TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN comm_tehsil TEXT NOT NULL DEFAULT '';
        ALTER TABLE student_profiles ADD COLUMN source_extra_fields TEXT NOT NULL DEFAULT '{}';
        CREATE INDEX IF NOT EXISTS idx_student_profiles_candidate_id ON student_profiles(candidate_id);

        ALTER TABLE enrollments ADD COLUMN batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL;
        ALTER TABLE enrollments ADD COLUMN batch_code_snapshot TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN candidate_id_snapshot TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN sdms_enrolment_number TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN scheme_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN candidate_course_fee TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN fee_paid_by TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN tc_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN tc_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN assessment_mode TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN assessment_from_date TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN assessment_to_date TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN certificate_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN placement_type TEXT NOT NULL DEFAULT '';
        ALTER TABLE enrollments ADD COLUMN source_extra_fields TEXT NOT NULL DEFAULT '{}';
        CREATE INDEX IF NOT EXISTS idx_enrollments_batch ON enrollments(batch_id);
        CREATE INDEX IF NOT EXISTS idx_enrollments_candidate ON enrollments(candidate_id_snapshot);
      `,
    },
    {
      version: 4,
      name: 'add_email_campaigns_and_delivery_tracking',
      sql: `
        ALTER TABLE email_logs ADD COLUMN html_body TEXT NOT NULL DEFAULT '';
        ALTER TABLE email_logs ADD COLUMN provider TEXT NOT NULL DEFAULT '';
        ALTER TABLE email_logs ADD COLUMN student_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE email_logs ADD COLUMN campaign_id TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_email_logs_student ON email_logs(student_user_id, event_type, status);
        CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON email_logs(campaign_id);

        CREATE TABLE IF NOT EXISTS email_campaigns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          initiator_name TEXT NOT NULL DEFAULT 'Administrator',
          total_enrolled INTEGER NOT NULL DEFAULT 0,
          valid_emails INTEGER NOT NULL DEFAULT 0,
          invalid_emails INTEGER NOT NULL DEFAULT 0,
          sent_count INTEGER NOT NULL DEFAULT 0,
          failed_count INTEGER NOT NULL DEFAULT 0,
          skipped_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'COMPLETED',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          completed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `,
    },
  ];

  const applyMigration = db.transaction((m: { version: number; name: string; sql: string }) => {
    db.exec(m.sql);
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
  });

  for (const m of migrations) {
    if (!applied.has(m.version)) {
      applyMigration(m);
    }
  }
}

export function seedInitialData(): void {
  // 1. Enrollment sequence singleton
  db.prepare(`
    INSERT OR IGNORE INTO enrollment_sequences (id, prefix, last_number)
    VALUES (1, 'AITM', 0)
  `).run();

  // 2. Official AITM Institute Settings (verified from abhinavinst.com & official filings; fully editable in Admin)
  const existingSettings = db.prepare('SELECT id FROM institute_settings WHERE id = 1').get();
  if (!existingSettings) {
    const achievements = [
      {
        label: 'ISO 9001:2015',
        detail: 'Certified Quality Management System for vocational and technical education delivery.',
      },
      {
        label: 'NSDC & Sector Skill Councils',
        detail: 'Aligned training partner supporting Skill India, NAPS, NATS, and PMKVY programs.',
      },
      {
        label: 'Multi-State Training Network',
        detail: 'Active industry-integrated delivery across Maharashtra, Gujarat, and Delhi NCR.',
      },
      {
        label: 'Industry-Aligned Sectors',
        detail: 'Programs spanning IT/ITES, Manufacturing, Healthcare, Retail, Hospitality, and BFSI.',
      },
    ];

    const management = [
      {
        name: 'Rajesh Ravindra Pratap Singh',
        designation: 'Director, Abhinav Institute of Technology & Management Foundation',
        bio: 'Oversees institutional governance, industry partnerships, and national skill development initiatives across partner regions.',
      },
      {
        name: 'Harish Ramkripal Mishra',
        designation: 'Director, Abhinav Institute of Technology & Management Foundation',
        bio: 'Leads operational compliance, apprenticeship frameworks (NAPS/NATS), and quality assurance across AITM training programs.',
      },
    ];

    const certifications = [
      {
        title: 'ISO 9001:2015 Certified Organization',
        issuer: 'International Organization for Standardization',
        description: 'Recognized for standardized academic governance, trainee assessment, and institutional quality processes.',
      },
      {
        title: 'Government-Recognized Training Partner',
        issuer: 'Skill Development & Apprenticeship Ecosystem',
        description: 'Authorized delivery aligned with national skill missions, NAPS, NATS, and industry certification frameworks.',
      },
    ];

    const affiliations = [
      {
        name: 'National Skill Development Corporation (NSDC)',
        role: 'Skill Training Ecosystem Alignment',
      },
      {
        name: 'Sector Skill Councils (SSCs)',
        role: 'Curriculum & Assessment Alignment',
      },
      {
        name: 'National Apprenticeship Promotion Scheme (NAPS)',
        role: 'Apprenticeship & On-the-Job Training Partner',
      },
      {
        name: 'National Apprenticeship Training Scheme (NATS)',
        role: 'Graduate & Diploma Apprenticeship Facilitation',
      },
      {
        name: 'Work-Integrated Vocational Programs (B.Voc / D.Voc)',
        role: 'Learn & Earn Industry-Integrated Higher Education',
      },
    ];

    const socialLinks = {
      website: 'https://www.abhinavinst.com/',
      linkedin: 'https://www.linkedin.com/',
      facebook: '',
      instagram: '',
      youtube: '',
    };

    db.prepare(`
      INSERT INTO institute_settings (
        id, website_title, institute_name, short_name, tagline,
        logo_url, favicon_url, hero_heading, hero_description,
        hero_banner_url, about_image_url, about_us, vision, mission,
        achievements_json, chairman_name, chairman_designation, chairman_message,
        chairman_image_url, management_json, address, phone, alt_phone, email,
        website_url, map_embed_url, footer_text, copyright_text,
        social_links_json, certifications_json, affiliations_json
      ) VALUES (
        1, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `).run(
      'AITM — Abhinav Institute of Technology & Management',
      'Abhinav Institute of Technology & Management',
      'AITM',
      'Industry-Aligned Skill Development, Apprenticeships & Technology Education',
      '',
      '',
      'Building Industry-Ready Careers Through Practical Technology & Skill Training',
      'Abhinav Institute of Technology & Management (AITM) is an ISO 9001:2015 certified training institute affiliated with NSDC and Sector Skill Councils, bridging industry demand and skilled talent across India.',
      '/src/assets/images/aitm_hero_campus_1795502502674.jpg',
      '/src/assets/images/aitm_about_lab_1795502500758.jpg',
      'Abhinav Institute of Technology & Management (AITM) is a government-recognized skill development and training organization dedicated to bridging the gap between modern industry requirements and skilled human capital. Operating across Maharashtra, Gujarat, Delhi NCR, and partner hubs, AITM delivers structured technology courses, National Apprenticeship schemes (NAPS & NATS), PMKVY initiatives, and Work-Integrated B.Voc / D.Voc programs across IT/ITES, Manufacturing, Healthcare, Retail, Hospitality, and BFSI sectors.',
      'To be the most trusted partner in skill development, creating a skilled workforce that meets global standards and transforming energetic youth into resourceful assets contributing to India\'s growth.',
      'To deliver quality skill training, structured apprenticeship programs, and practical employment pathways that continuously upgrade industrial capabilities and equip organizations with dependable, job-ready talent.',
      JSON.stringify(achievements),
      'AITM Leadership & Governance',
      'Board of Directors — Abhinav Institute of Technology & Management Foundation',
      'At Abhinav Institute of Technology & Management, every program is built around accountability to our learners and corporate partners. By combining structured classroom instruction with hands-on industrial practice, we prepare trainees for durable careers across India\'s growing technology and manufacturing sectors.',
      '',
      JSON.stringify(management),
      'Premises 1, Manjula Arcade, 3rd Floor, Gopal Krishna Gokhale Marg, Near Cosmos Bank, Naupada, Thane West, Maharashtra – 400602, India',
      '022 49690327',
      '+91-9322948376',
      'aitm.connect@abhinavinst.com',
      'https://www.abhinavinst.com/',
      'https://www.openstreetmap.org/export/embed.html?bbox=72.9680%2C19.1840%2C72.9780%2C19.1920&layer=mapnik&marker=19.1880%2C72.9730',
      'ISO 9001:2015 Certified Training & Skill Development Institute headquartered in Thane West, Maharashtra.',
      '© 2026 Abhinav Institute of Technology & Management (AITM). All rights reserved.',
      JSON.stringify(socialLinks),
      JSON.stringify(certifications),
      JSON.stringify(affiliations)
    );
  }

  // 3. Seed initial database-driven courses only if courses table is empty
  const courseCount = (db.prepare('SELECT COUNT(*) as c FROM courses').get() as { c: number }).c;
  if (courseCount === 0) {
    const insertCourse = db.prepare(`
      INSERT INTO courses (
        code, name, short_description, detailed_description, image_url, category,
        duration_value, duration_unit, total_training_hours, level, eligibility,
        mode, fees, start_date, end_date, syllabus_json, certificate_info, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')
    `);

    const c1 = insertCourse.run(
      'AITM-FSD-101',
      'Full Stack Web Development',
      'Hands-on engineering program covering modern HTML/CSS, TypeScript, React, Node.js, REST APIs, and relational databases.',
      'Designed for aspiring software developers and IT graduates, this structured program guides learners from core web foundations through full-stack application architecture, SQL database modeling, authentication, and production deployment.',
      '/src/assets/images/course_fullstack_1795502501357.jpg',
      'IT & Software Development',
      3,
      'Months',
      240,
      'Intermediate',
      '12th Pass / Diploma / Graduate in any stream with basic computer literacy',
      'Hybrid',
      '₹18,500',
      '2026-12-01',
      '2027-02-28',
      JSON.stringify([
        'Module 1: Web Architecture, HTML5 & Modern CSS Layouts',
        'Module 2: JavaScript, TypeScript & React Application Engineering',
        'Module 3: Backend APIs with Node.js, Express & SQL Databases',
        'Module 4: Security, Testing & Production Capstone Deployment',
      ]),
      'AITM Verified Industry Certificate (ISO 9001:2015 Aligned)',
    );

    const c2 = insertCourse.run(
      'AITM-NAPS-201',
      'Industrial Apprenticeship & Vocational Certification (NAPS / NATS)',
      'Work-integrated Learn & Earn program combining classroom instruction with on-the-job industrial apprenticeship training.',
      'Aligned with National Apprenticeship Promotion Scheme (NAPS) and National Apprenticeship Training Scheme (NATS) standards, this program prepares ITI, diploma, and graduate candidates for manufacturing, quality assurance, and industrial operations.',
      '/src/assets/images/course_industrial_apprenticeship_1795502501753.jpg',
      'Apprenticeship & Industrial',
      6,
      'Months',
      480,
      'Foundation to Intermediate',
      'ITI / 12th Pass / Polytechnic Diploma / Engineering Graduate',
      'Offline',
      'Sponsored / Stipend-Aligned',
      '2026-12-15',
      '2027-06-15',
      JSON.stringify([
        'Module 1: Industrial Safety, 5S & Quality Management Systems',
        'Module 2: Precision Measurement, Calibration & Shop-Floor Operations',
        'Module 3: Supervised On-the-Job Apprenticeship Assessment',
      ]),
      'NSDC / Sector Skill Council & AITM Joint Apprenticeship Completion Certificate',
    );

    const c3 = insertCourse.run(
      'AITM-BDA-301',
      'Business Management & Data Analytics',
      'Applied analytics training covering Excel modeling, SQL querying, Power BI reporting, and business operations decision-making.',
      'Equip yourself with practical analytical and management tools demanded across BFSI, Retail, and Corporate Operations. Learners build interactive KPI dashboards, clean real business datasets, and present executive reports.',
      '/src/assets/images/course_data_analytics_1795502501934.jpg',
      'Management & Analytics',
      4,
      'Months',
      300,
      'Intermediate',
      'Graduates or Final-Year Students in Commerce, Management, Science, or IT',
      'Hybrid',
      '₹22,000',
      '2027-01-05',
      '2027-05-05',
      JSON.stringify([
        'Module 1: Business Operations & Spreadsheet Modeling',
        'Module 2: Relational Data Extraction with SQL',
        'Module 3: Executive Dashboarding & Data Storytelling',
        'Module 4: Applied Industry Case Study & Presentation',
      ]),
      'AITM Certified Business & Data Analytics Credential',
    );

    // Create starter modules and real private PDF syllabus resources for Course 1 so LMS works immediately
    const c1Id = Number(c1.lastInsertRowid);
    const c2Id = Number(c2.lastInsertRowid);
    const c3Id = Number(c3.lastInsertRowid);

    const insertMod = db.prepare(
      'INSERT INTO course_modules (course_id, title, description, sort_order) VALUES (?, ?, ?, ?)'
    );
    const m1 = Number(
      insertMod.run(c1Id, 'Module 1 - Introduction & Course Orientation', 'Program roadmap, tooling setup, and assessment rubric.', 1)
        .lastInsertRowid
    );
    const m2 = Number(
      insertMod.run(c1Id, 'Module 2 - HTML, CSS & Responsive Interfaces', 'Semantic markup, modern CSS layout systems, and accessibility.', 2)
        .lastInsertRowid
    );
    const m3 = Number(
      insertMod.run(c1Id, 'Module 3 - JavaScript, APIs & Databases', 'Interactive frontend engineering and relational SQL backend services.', 3)
        .lastInsertRowid
    );
    const m4 = Number(
      insertMod.run(c2Id, 'Module 1 - Industrial Safety & Quality Standards', 'ISO 9001:2015 shop-floor compliance and workplace safety.', 1)
        .lastInsertRowid
    );
    const m5 = Number(
      insertMod.run(c3Id, 'Module 1 - Foundations of Business Analytics', 'Structured KPI frameworks and analytical problem solving.', 1)
        .lastInsertRowid
    );

    const writeSamplePdf = (storedName: string, title: string, lines: string[]) => {
      const target = path.join(PRIVATE_UPLOAD_DIR, storedName);
      const buf = buildSimplePdf(title, lines);
      fs.writeFileSync(target, buf);
      return buf.length;
    };

    const insertRes = db.prepare(`
      INSERT INTO learning_resources (
        course_id, module_id, title, description, resource_type,
        file_name, stored_path, mime_type, file_size, external_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const f1Size = writeSamplePdf('seed_fsd_intro.pdf', 'AITM - Full Stack Web Development Orientation', [
      'Abhinav Institute of Technology & Management (AITM)',
      'Course Code: AITM-FSD-101 | Duration: 3 Months (240 Hours)',
      '1. Development Environment Setup (Git, Node.js, VS Code)',
      '2. Weekly Practical Lab Schedule and Evaluation Criteria',
      '3. Capstone Project Submission Guidelines',
    ]);
    insertRes.run(
      c1Id,
      m1,
      'Course Orientation & Syllabus Handbook',
      'Complete handbook covering schedule, milestones, and lab guidelines.',
      'DOCUMENT',
      'AITM-FSD-Orientation-Handbook.pdf',
      'seed_fsd_intro.pdf',
      'application/pdf',
      f1Size,
      ''
    );

    const f2Size = writeSamplePdf('seed_fsd_html_css.pdf', 'AITM - Module 2: HTML5 & Modern CSS Notes', [
      'Module 2 Study Guide - Responsive Web Architecture',
      'Topics: Semantic Document Structure, Flexbox, CSS Grid, WCAG Contrast.',
      'Lab Exercise: Build an accessible multi-section institutional page.',
    ]);
    insertRes.run(
      c1Id,
      m2,
      'HTML5 & Modern CSS Reference Notes',
      'Structured study guide and practical exercises for Module 2.',
      'DOCUMENT',
      'Module2-HTML-CSS-Notes.pdf',
      'seed_fsd_html_css.pdf',
      'application/pdf',
      f2Size,
      ''
    );

    const f3Size = writeSamplePdf('seed_naps_safety.pdf', 'AITM - NAPS/NATS Industrial Safety Manual', [
      'Abhinav Institute of Technology & Management (AITM)',
      'Course Code: AITM-NAPS-201 | ISO 9001:2015 Aligned Training',
      'Standard Operating Procedures for Workshop Safety & 5S Compliance.',
    ]);
    insertRes.run(
      c2Id,
      m4,
      'Workshop Safety & 5S Compliance Guide',
      'Mandatory safety and quality handbook for NAPS/NATS apprentices.',
      'DOCUMENT',
      'AITM-NAPS-Safety-Manual.pdf',
      'seed_naps_safety.pdf',
      'application/pdf',
      f3Size,
      ''
    );

    const f4Size = writeSamplePdf('seed_bda_intro.pdf', 'AITM - Business Analytics Starter Workbook', [
      'Abhinav Institute of Technology & Management (AITM)',
      'Course Code: AITM-BDA-301 | Business Management & Data Analytics',
      'Foundations of KPI design, SQL reporting, and management dashboards.',
    ]);
    insertRes.run(
      c3Id,
      m5,
      'Business Analytics Foundations Guide',
      'Introductory analytical methods and case study rubric.',
      'DOCUMENT',
      'AITM-BDA-Foundations.pdf',
      'seed_bda_intro.pdf',
      'application/pdf',
      f4Size,
      ''
    );

    // Seed a starter assignment for Course 1
    db.prepare(`
      INSERT INTO assignments (course_id, module_id, title, description, due_date, max_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      c1Id,
      m2,
      'Practical Exercise 1: Semantic Institutional Layout',
      'Design and submit a responsive HTML5 + CSS page demonstrating semantic landmarks, clean typography, and mobile responsiveness.',
      '2026-12-20',
      100
    );

    // Seed a general institutional announcement
    db.prepare(`
      INSERT INTO announcements (title, content, course_id, priority, is_published)
      VALUES (?, ?, NULL, 'IMPORTANT', 1)
    `).run(
      'Welcome to the AITM Digital Learning Portal',
      'All enrolled trainees can access module study materials, submit assignments, view upcoming live sessions, and track program progress directly from their Student Dashboard.',
    );
  }

  // 4. Optional environment-configured Super Admin (never hardcoded!)
  const envAdminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const envAdminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (envAdminEmail && envAdminPassword) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(envAdminEmail) as
      | { id: number }
      | undefined;
    const hashed = hashPasswordRaw(envAdminPassword);
    if (!existing) {
      const username = envAdminEmail.split('@')[0].replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'superadmin';
      const u = db
        .prepare(
          `INSERT INTO users (username, email, password_hash, role, full_name, is_active, must_change_password)
           VALUES (?, ?, ?, 'SUPER_ADMIN', 'AITM Super Administrator', 1, 0)`
        )
        .run(username, envAdminEmail, hashed);
      db.prepare(
        `INSERT OR IGNORE INTO admin_users (user_id, designation, department, permissions_json)
         VALUES (?, 'Super Administrator', 'Institute Governance', '["ALL"]')`
      ).run(Number(u.lastInsertRowid));
    } else {
      db.prepare(
        `UPDATE users SET password_hash = ?, role = 'SUPER_ADMIN', is_active = 1, updated_at = datetime('now') WHERE id = ?`
      ).run(hashed, existing.id);
    }
  }
}

export function logActivity(params: {
  actorUserId?: number | null;
  actorName?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string | number;
  details?: string;
}): void {
  db.prepare(`
    INSERT INTO activity_logs (actor_user_id, actor_name, actor_role, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.actorUserId ?? null,
    params.actorName ?? 'System',
    params.actorRole ?? 'SYSTEM',
    params.action,
    params.entityType,
    String(params.entityId ?? ''),
    params.details ?? ''
  );
}

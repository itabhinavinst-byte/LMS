export interface AchievementItem {
  label: string;
  detail: string;
}

export interface ManagementMember {
  name: string;
  designation: string;
  bio: string;
  image_url?: string;
}

export interface CertificationItem {
  title: string;
  issuer: string;
  description: string;
}

export interface AffiliationItem {
  name: string;
  role: string;
}

export interface SocialLinks {
  website?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
}

export interface InstituteSettings {
  id: number;
  website_title: string;
  institute_name: string;
  short_name: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  hero_heading: string;
  hero_description: string;
  hero_banner_url: string;
  about_image_url: string;
  about_us: string;
  vision: string;
  mission: string;
  achievements: AchievementItem[];
  chairman_name: string;
  chairman_designation: string;
  chairman_message: string;
  chairman_image_url: string;
  management: ManagementMember[];
  address: string;
  phone: string;
  alt_phone: string;
  email: string;
  website_url: string;
  map_embed_url: string;
  footer_text: string;
  copyright_text: string;
  social_links: SocialLinks;
  certifications: CertificationItem[];
  affiliations: AffiliationItem[];
  updated_at?: string;
}

export interface BatchRecord {
  id: number;
  batch_code: string;
  course_id: number;
  batch_name: string;
  start_date: string;
  end_date: string;
  trainer_id: string;
  trainer_name: string;
  skilling_category?: string;
  course_type?: string;
  sector_covered?: string;
  course_fee?: string;
  fee_paid_by?: string;
  tc_id?: string;
  tc_name?: string;
  tc_centre?: string;
  tc_district?: string;
  tc_pincode?: string;
  assessment_mode?: string;
  assessment_from_date?: string;
  assessment_to_date?: string;
  certificate_name?: string;
  placement_type?: string;
  student_count?: number;
}

export interface Course {
  id: number;
  code: string;
  source_course_id?: string;
  name: string;
  short_description: string;
  detailed_description: string;
  image_url: string;
  category: string;
  sector?: string;
  course_type?: string;
  duration_value: number;
  duration_unit: 'Days' | 'Weeks' | 'Months' | 'Years';
  duration_display: string;
  total_training_hours: number;
  level: string;
  eligibility: string;
  mode: 'Online' | 'Offline' | 'Hybrid';
  fees: string;
  start_date: string;
  end_date: string;
  syllabus: string[];
  certificate_info: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  total_students?: number;
  active_students?: number;
  completed_students?: number;
  batch_count?: number;
  batches?: BatchRecord[];
  resource_count?: number;
  module_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CourseModule {
  id: number;
  course_id: number;
  course_name?: string;
  title: string;
  description: string;
  sort_order: number;
}

export interface LearningResource {
  id: number;
  course_id: number;
  course_name?: string;
  module_id: number | null;
  module_title?: string | null;
  title: string;
  description: string;
  resource_type: 'DOCUMENT' | 'VIDEO_LINK' | 'STUDY_MATERIAL';
  file_name: string;
  mime_type: string;
  file_size: number;
  external_url: string;
  created_at: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STUDENT';
  full_name: string;
  is_active: number;
  must_change_password: number;
  enrollment_number?: string;
  employee_code?: string;
  candidate_id?: string;
}

export interface ApplicationRecord {
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
  course_name: string;
  course_code?: string;
  additional_info: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_notes: string;
  enrollment_id?: number | null;
  enrollment_number?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface EnrollmentRecord {
  id: number;
  student_user_id: number;
  course_id: number;
  batch_id?: number | null;
  batch_code_snapshot?: string;
  candidate_id?: string;
  candidate_id_snapshot?: string;
  enrollment_number: string;
  employee_code?: string;
  employee_code_snapshot?: string;
  enrollment_type?: string;
  payment_status?: string;
  sdms_enrolment_number?: string;
  student_name_snapshot: string;
  student_email_snapshot: string;
  student_mobile_snapshot: string;
  course_name_snapshot: string;
  course_duration_snapshot: string;
  enrollment_date: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DROPPED' | 'SUSPENDED';
  progress_percent: number;
  batch_name: string;
  username?: string;
  course_code?: string;
  account_active?: number;
  image_url?: string;
  short_description?: string;
  mode?: string;
  level?: string;
  category?: string;
}

export interface AnnouncementRecord {
  id: number;
  title: string;
  content: string;
  course_id: number | null;
  course_name?: string | null;
  priority: 'NORMAL' | 'IMPORTANT' | 'URGENT';
  is_published: number;
  created_at: string;
}

export interface MeetingRecord {
  id: number;
  title: string;
  description: string;
  course_id: number;
  course_name?: string;
  batch_name: string;
  scheduled_at: string;
  duration_minutes: number;
  meeting_url: string;
  platform: string;
  created_at: string;
}

export interface AssignmentRecord {
  id: number;
  course_id: number;
  course_name?: string;
  module_id: number | null;
  module_title?: string | null;
  title: string;
  description: string;
  due_date: string;
  max_score: number;
  submission_count?: number;
  submission_id?: number | null;
  submission_text?: string | null;
  submission_file?: string | null;
  score?: number | null;
  feedback?: string | null;
  submission_status?: 'SUBMITTED' | 'GRADED' | null;
  submitted_at?: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  is_read: number;
  created_at: string;
}

export interface EmailLogRecord {
  id: number;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body: string;
  html_body?: string;
  provider?: string;
  event_type: string;
  related_enrollment_id: number | null;
  student_user_id?: number | null;
  campaign_id?: string;
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED';
  provider_response: string;
  error_message: string;
  sent_at: string | null;
  created_at: string;
}

export interface EmailProviderStatus {
  configured: boolean;
  provider: 'RESEND' | 'SENDGRID' | 'SMTP' | 'NONE';
  from: string;
  host: string;
  port: number;
  details: string;
}

export interface EnrolledStudentEmailRow {
  user_id: number;
  full_name: string;
  email: string;
  username: string;
  roll_number: string;
  candidate_id: string;
  employee_code: string;
  is_active: number;
  must_change_password: number;
  course_count: number;
  enrolled_courses: string;
  batches: string;
  email_valid: boolean;
  email_warning: string;
  delivery_status: 'SENT' | 'PENDING' | 'FAILED' | 'INVALID_EMAIL';
  last_log_id: number | null;
  last_provider: string;
  last_sent_at: string | null;
  last_error: string;
  attempts: number;
}

export interface CredentialsEmailOverview {
  providerStatus: EmailProviderStatus;
  summary: {
    totalEnrolledStudents: number;
    validEmailCount: number;
    invalidEmailCount: number;
    sentCount: number;
    failedCount: number;
    pendingCount: number;
  };
  bulkInProgress: boolean;
  recentCampaigns: Array<{
    id: number;
    campaign_key: string;
    name: string;
    initiator_name: string;
    total_enrolled: number;
    valid_emails: number;
    invalid_emails: number;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    status: string;
    created_at: string;
  }>;
  students: EnrolledStudentEmailRow[];
}

export interface BulkCampaignReport {
  campaignKey: string;
  provider: 'RESEND' | 'SENDGRID' | 'SMTP' | 'NONE';
  providerConfigured: boolean;
  totalEnrolledStudents: number;
  validEmailCount: number;
  invalidEmailCount: number;
  sentCount: number;
  failedCount: number;
  skippedAlreadySentCount: number;
  pendingCount: number;
  message: string;
  results: Array<{
    userId: number;
    fullName: string;
    rollNumber: string;
    email: string;
    status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'SKIPPED_ALREADY_SENT' | 'INVALID_EMAIL';
    message: string;
  }>;
}


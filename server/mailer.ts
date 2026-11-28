import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { db, logActivity } from './db.ts';
import { hashResetToken } from './security.ts';

export type EmailProviderType = 'RESEND' | 'SENDGRID' | 'SMTP' | 'NONE';

export interface EmailSendResult {
  logId: number;
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED';
  provider: EmailProviderType;
  message: string;
  deduplicated?: boolean;
}

export interface EmailProviderStatus {
  configured: boolean;
  provider: EmailProviderType;
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
  recentCampaigns: Array<Record<string, unknown>>;
  students: EnrolledStudentEmailRow[];
}

export interface BulkCampaignReport {
  campaignKey: string;
  provider: EmailProviderType;
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

const STRICT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
let bulkDispatchInProgress = false;

export function isBulkDispatchRunning(): boolean {
  return bulkDispatchInProgress;
}

export function validateStudentEmail(rawEmail: string): { valid: boolean; warning: string } {
  const email = (rawEmail || '').trim();
  if (!email) {
    return { valid: false, warning: 'Missing email address' };
  }
  if (!STRICT_EMAIL_REGEX.test(email)) {
    return { valid: false, warning: 'Invalid email format' };
  }
  if (email.toLowerCase().endsWith('.local') || email.toLowerCase().endsWith('.invalid')) {
    return { valid: false, warning: 'Placeholder local email cannot receive external mail' };
  }
  if (/@(gmil|gmial|gmal|gmai|yaho|outlok)\./i.test(email)) {
    return { valid: true, warning: 'Possible domain typo (verify with student if bounce occurs)' };
  }
  return { valid: true, warning: '' };
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHttpUrl(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

export function getSmtpConfig() {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || '587');
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const from =
    (process.env.EMAIL_FROM || '').trim() ||
    (process.env.SMTP_FROM || '').trim() ||
    'Abhinav Institute of Technology & Management <aitm.connect@abhinavinst.com>';
  const isConfigured = Boolean(host && user && pass);
  return { host, port, secure, user, pass, from, isConfigured };
}

export function getEmailProviderStatus(): EmailProviderStatus {
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const sendgridKey = (process.env.SENDGRID_API_KEY || '').trim();
  const smtp = getSmtpConfig();

  if (resendKey) {
    return {
      configured: true,
      provider: 'RESEND',
      from: smtp.from,
      host: 'api.resend.com',
      port: 443,
      details: 'Resend Transactional Email API configured',
    };
  }
  if (sendgridKey) {
    return {
      configured: true,
      provider: 'SENDGRID',
      from: smtp.from,
      host: 'api.sendgrid.com',
      port: 443,
      details: 'SendGrid Email API configured',
    };
  }
  if (smtp.isConfigured) {
    return {
      configured: true,
      provider: 'SMTP',
      from: smtp.from,
      host: smtp.host,
      port: smtp.port,
      details: `SMTP configured (${smtp.host}:${smtp.port})`,
    };
  }
  return {
    configured: false,
    provider: 'NONE',
    from: smtp.from,
    host: 'Not configured',
    port: smtp.port,
    details:
      'No email provider configured. Set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS in server environment secrets.',
  };
}

function parseFromHeader(fromHeader: string): { name: string; email: string } {
  const match = fromHeader.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { name: 'Abhinav Institute of Technology & Management', email: fromHeader.trim() };
}

async function deliverEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{
  ok: boolean;
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED';
  provider: EmailProviderType;
  response: string;
  error: string;
}> {
  const providerInfo = getEmailProviderStatus();

  if (!providerInfo.configured || providerInfo.provider === 'NONE') {
    return {
      ok: false,
      status: 'NOT_CONFIGURED',
      provider: 'NONE',
      response: '',
      error:
        'Email provider is not configured on the server. Set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST + SMTP_USER + SMTP_PASS in environment secrets.',
    };
  }

  // 1. Resend API
  if (providerInfo.provider === 'RESEND') {
    try {
      const apiKey = (process.env.RESEND_API_KEY || '').trim();
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: providerInfo.from,
          to: [params.to],
          subject: params.subject,
          text: params.text,
          ...(params.html ? { html: params.html } : {}),
        }),
      });
      const rawText = await resp.text();
      if (!resp.ok) {
        return {
          ok: false,
          status: 'FAILED',
          provider: 'RESEND',
          response: '',
          error: `Resend API error (${resp.status}): ${rawText.slice(0, 240)}`,
        };
      }
      return {
        ok: true,
        status: 'SENT',
        provider: 'RESEND',
        response: rawText.slice(0, 240) || 'Accepted by Resend API',
        error: '',
      };
    } catch (err) {
      return {
        ok: false,
        status: 'FAILED',
        provider: 'RESEND',
        response: '',
        error: err instanceof Error ? err.message : 'Unknown Resend delivery error',
      };
    }
  }

  // 2. SendGrid API
  if (providerInfo.provider === 'SENDGRID') {
    try {
      const apiKey = (process.env.SENDGRID_API_KEY || '').trim();
      const fromParsed = parseFromHeader(providerInfo.from);
      const content: Array<{ type: string; value: string }> = [{ type: 'text/plain', value: params.text }];
      if (params.html) {
        content.push({ type: 'text/html', value: params.html });
      }
      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: params.to }] }],
          from: { email: fromParsed.email, name: fromParsed.name },
          subject: params.subject,
          content,
        }),
      });
      if (!resp.ok) {
        const rawText = await resp.text();
        return {
          ok: false,
          status: 'FAILED',
          provider: 'SENDGRID',
          response: '',
          error: `SendGrid API error (${resp.status}): ${rawText.slice(0, 240)}`,
        };
      }
      return {
        ok: true,
        status: 'SENT',
        provider: 'SENDGRID',
        response: resp.headers.get('x-message-id') || 'Accepted by SendGrid API',
        error: '',
      };
    } catch (err) {
      return {
        ok: false,
        status: 'FAILED',
        provider: 'SENDGRID',
        response: '',
        error: err instanceof Error ? err.message : 'Unknown SendGrid delivery error',
      };
    }
  }

  // 3. SMTP via Nodemailer
  const cfg = getSmtpConfig();
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10000,
    });

    const info = await transporter.sendMail({
      from: cfg.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {}),
    });

    return {
      ok: true,
      status: 'SENT',
      provider: 'SMTP',
      response: info.response || info.messageId || 'Accepted by SMTP server',
      error: '',
    };
  } catch (err) {
    return {
      ok: false,
      status: 'FAILED',
      provider: 'SMTP',
      response: '',
      error: err instanceof Error ? err.message : 'Unknown SMTP delivery error',
    };
  }
}

function redactTokenInText(raw: string, token?: string): string {
  if (!token) return raw;
  return raw.split(token).join('[SECURE_SINGLE_USE_TOKEN_REDACTED]');
}

export async function sendLoggedEmail(params: {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  htmlBody?: string;
  eventType: string;
  relatedEnrollmentId?: number | null;
  studentUserId?: number | null;
  campaignId?: string;
  idempotencyKey?: string;
  redactSecret?: string;
}): Promise<EmailSendResult> {
  if (params.idempotencyKey) {
    const existing = db
      .prepare('SELECT id, status, provider, error_message FROM email_logs WHERE idempotency_key = ?')
      .get(params.idempotencyKey) as
      | { id: number; status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED'; provider: string; error_message: string }
      | undefined;
    if (existing && existing.status === 'SENT') {
      return {
        logId: existing.id,
        status: 'SENT',
        provider: (existing.provider as EmailProviderType) || 'SMTP',
        message: 'Email already delivered for this event (duplicate prevented).',
        deduplicated: true,
      };
    }
  }

  const delivery = await deliverEmail({
    to: params.recipientEmail,
    subject: params.subject,
    text: params.body,
    html: params.htmlBody,
  });

  // Never store live single-use password setup tokens in plaintext inside email_logs
  const safeStoredBody = redactTokenInText(params.body, params.redactSecret);
  const safeStoredHtml = redactTokenInText(params.htmlBody || '', params.redactSecret);

  const uniqueKey =
    params.idempotencyKey && delivery.status === 'SENT'
      ? params.idempotencyKey
      : params.idempotencyKey
        ? `${params.idempotencyKey}_attempt_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`
        : null;

  const result = db
    .prepare(
      `INSERT INTO email_logs (
        recipient_email, recipient_name, subject, body, html_body, provider,
        event_type, related_enrollment_id, student_user_id, campaign_id,
        idempotency_key, status, provider_response, error_message, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.recipientEmail,
      params.recipientName,
      params.subject,
      safeStoredBody,
      safeStoredHtml,
      delivery.provider,
      params.eventType,
      params.relatedEnrollmentId ?? null,
      params.studentUserId ?? null,
      params.campaignId || '',
      uniqueKey,
      delivery.status,
      delivery.response,
      delivery.error,
      delivery.ok ? new Date().toISOString() : null
    );

  return {
    logId: Number(result.lastInsertRowid),
    status: delivery.status,
    provider: delivery.provider,
    message: delivery.ok
      ? `Email delivered via ${delivery.provider}.`
      : delivery.error,
  };
}

export function createStudentActivationToken(userId: number, expiresHours = 72): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
  ).run(userId, tokenHash, expiresAt);

  return rawToken;
}

function getInstituteEmailBranding(portalBaseUrl: string) {
  const row = db
    .prepare(
      `SELECT institute_name, short_name, logo_url, email, phone, alt_phone, address, website_url
       FROM institute_settings WHERE id = 1`
    )
    .get() as
    | {
        institute_name: string;
        short_name: string;
        logo_url: string;
        email: string;
        phone: string;
        alt_phone: string;
        address: string;
        website_url: string;
      }
    | undefined;

  const cleanBase = portalBaseUrl.replace(/\/+$/, '');
  const rawLogo = (row?.logo_url || '').trim();
  const logoUrl = rawLogo.startsWith('http://') || rawLogo.startsWith('https://')
    ? safeHttpUrl(rawLogo)
    : rawLogo.startsWith('/')
      ? safeHttpUrl(`${cleanBase}${rawLogo}`)
      : '';

  return {
    instituteName: row?.institute_name || 'Abhinav Institute of Technology & Management',
    shortName: row?.short_name || 'AITM',
    logoUrl,
    supportEmail: row?.email || 'aitm.connect@abhinavinst.com',
    supportPhone: row?.phone || '022 49690327',
    supportAltPhone: row?.alt_phone || '+91-9322948376',
    address:
      row?.address ||
      'Premises 1, Manjula Arcade, 3rd Floor, Gopal Krishna Gokhale Marg, Naupada, Thane West, Maharashtra – 400602, India',
    websiteUrl: safeHttpUrl(row?.website_url || 'https://www.abhinavinst.com/') || 'https://www.abhinavinst.com/',
  };
}

export function buildStudentCredentialsEmail(params: {
  studentName: string;
  rollNumber: string;
  registeredEmail: string;
  username?: string;
  candidateId?: string;
  courseSummary: string;
  portalBaseUrl: string;
  setupPasswordUrl: string;
  hasExistingPassword?: boolean;
}): { subject: string; text: string; html: string } {
  const cleanUrl = params.portalBaseUrl.replace(/\/+$/, '');
  const loginUrl = safeHttpUrl(`${cleanUrl}/login`) || `${cleanUrl}/login`;
  const setupUrl = safeHttpUrl(params.setupPasswordUrl) || params.setupPasswordUrl;
  const brand = getInstituteEmailBranding(cleanUrl);

  const subject = 'Welcome to AITM – Your Student LMS Login Details';

  const text = `Dear ${params.studentName},

Welcome to ${brand.instituteName} (${brand.shortName})!

Your official Student LMS Portal account is ready. Below are your verified student account details:

- Student Full Name: ${params.studentName}
- Student Roll Number: ${params.rollNumber}${params.candidateId ? `\n- Candidate ID: ${params.candidateId}` : ''}
- Registered Email Address: ${params.registeredEmail}${params.username ? `\n- Portal Username: ${params.username}` : ''}${params.courseSummary ? `\n- Enrolled Program(s): ${params.courseSummary}` : ''}
- Student LMS Login URL: ${loginUrl}

SECURE LOGIN & ACCOUNT ACTIVATION INSTRUCTIONS:
For your account security, we never send plain-text passwords over email.
1. Click the secure link below to set or activate your personal LMS password (valid for 72 hours, single-use):
   ${setupUrl}
2. If you have already set your personal password, you may continue signing in directly at ${loginUrl} using your Roll Number (${params.rollNumber}) or registered Email Address.
3. Students using an initial temporary password will be prompted to set a new password immediately on first login.

NEED ASSISTANCE?
Support Email: ${brand.supportEmail}
Phone: ${brand.supportPhone}${brand.supportAltPhone ? ` / ${brand.supportAltPhone}` : ''}
Campus Address: ${brand.address}
Official Website: ${brand.websiteUrl}

Warm regards,
Student Academic Support Team
${brand.instituteName} (${brand.shortName})`;

  const logoBlock = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.shortName)} Logo" width="48" height="48" style="display:block;border-radius:8px;background:#ffffff;padding:4px;object-fit:contain;" />`
    : `<div style="width:46px;height:46px;border-radius:8px;background:#1d4ed8;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;line-height:46px;text-align:center;letter-spacing:0.5px;">${escapeHtml(brand.shortName)}</div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#0f172a;padding:24px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="58" valign="middle">${logoBlock}</td>
                  <td valign="middle" style="padding-left:14px;">
                    <div style="font-size:17px;font-weight:700;color:#ffffff;line-height:1.3;">${escapeHtml(brand.instituteName)}</div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:2px;">Official Student Learning Management System (LMS)</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 12px;font-size:15px;color:#0f172a;font-weight:600;">Dear ${escapeHtml(params.studentName)},</p>
              <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#334155;">
                Welcome to <strong>${escapeHtml(brand.instituteName)} (${escapeHtml(brand.shortName)})</strong>. Your official Student LMS account has been activated so you can access your enrolled courses, learning materials, assignments, announcements, and live class schedules.
              </p>

              <!-- Credentials Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#1d4ed8;margin-bottom:12px;">Your Student LMS Account Details</div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;line-height:1.6;">
                      <tr>
                        <td style="padding:5px 0;color:#64748b;width:42%;">Student Full Name</td>
                        <td style="padding:5px 0;color:#0f172a;font-weight:600;">${escapeHtml(params.studentName)}</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;color:#64748b;border-top:1px solid #e2e8f0;">Student Roll Number</td>
                        <td style="padding:5px 0;color:#1d4ed8;font-weight:700;font-family:'Courier New',Courier,monospace;border-top:1px solid #e2e8f0;">${escapeHtml(params.rollNumber)}</td>
                      </tr>
                      ${
                        params.candidateId
                          ? `<tr>
                        <td style="padding:5px 0;color:#64748b;border-top:1px solid #e2e8f0;">Candidate ID</td>
                        <td style="padding:5px 0;color:#0f172a;font-weight:600;font-family:'Courier New',Courier,monospace;border-top:1px solid #e2e8f0;">${escapeHtml(params.candidateId)}</td>
                      </tr>`
                          : ''
                      }
                      <tr>
                        <td style="padding:5px 0;color:#64748b;border-top:1px solid #e2e8f0;">Registered Email</td>
                        <td style="padding:5px 0;color:#0f172a;font-weight:500;border-top:1px solid #e2e8f0;">${escapeHtml(params.registeredEmail)}</td>
                      </tr>
                      ${
                        params.courseSummary
                          ? `<tr>
                        <td style="padding:5px 0;color:#64748b;border-top:1px solid #e2e8f0;">Enrolled Course(s)</td>
                        <td style="padding:5px 0;color:#0f172a;font-weight:500;border-top:1px solid #e2e8f0;">${escapeHtml(params.courseSummary)}</td>
                      </tr>`
                          : ''
                      }
                      <tr>
                        <td style="padding:5px 0;color:#64748b;border-top:1px solid #e2e8f0;">LMS Login Portal</td>
                        <td style="padding:5px 0;border-top:1px solid #e2e8f0;"><a href="${escapeHtml(loginUrl)}" style="color:#1d4ed8;text-decoration:underline;word-break:break-all;">${escapeHtml(loginUrl)}</a></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Primary CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:22px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(setupUrl)}" style="display:inline-block;background-color:#1d4ed8;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:8px;">Activate Account &amp; Set Your Password</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:10px;">
                    <a href="${escapeHtml(loginUrl)}" style="font-size:12px;color:#1d4ed8;text-decoration:underline;">Already have a password? Sign in to Student LMS Portal &rarr;</a>
                  </td>
                </tr>
              </table>

              <!-- Security Instructions -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 18px;font-size:12px;line-height:1.6;color:#1e3a8a;">
                    <strong>Secure Login Instructions:</strong><br />
                    &bull; For your protection, AITM never sends plain-text passwords by email.<br />
                    &bull; Use the secure one-time activation button above (valid for 72 hours) to create your private password.<br />
                    &bull; If you already created a password, your existing password remains unchanged.<br />
                    &bull; You may sign in with your <strong>Roll Number (${escapeHtml(params.rollNumber)})</strong>, registered email address${params.candidateId ? `, or Candidate ID (${escapeHtml(params.candidateId)})` : ''}.
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:12px;color:#64748b;">
                If the activation button does not open, copy and paste this secure link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:11px;font-family:'Courier New',Courier,monospace;color:#475569;word-break:break-all;">
                ${escapeHtml(setupUrl)}
              </p>

              <!-- Signature -->
              <p style="margin:0;font-size:13px;line-height:1.6;color:#334155;">
                Warm regards,<br />
                <strong>Student Academic Support &amp; Admissions</strong><br />
                ${escapeHtml(brand.instituteName)} (${escapeHtml(brand.shortName)})
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:11px;line-height:1.6;color:#64748b;">
              <div style="font-weight:600;color:#334155;margin-bottom:4px;">Support &amp; Institute Contact Information</div>
              <div>Email: <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:#1d4ed8;text-decoration:none;">${escapeHtml(brand.supportEmail)}</a> &nbsp;|&nbsp; Phone: ${escapeHtml(brand.supportPhone)}${brand.supportAltPhone ? ` / ${escapeHtml(brand.supportAltPhone)}` : ''}</div>
              <div>Address: ${escapeHtml(brand.address)}</div>
              <div style="margin-top:6px;">Official Website: <a href="${escapeHtml(brand.websiteUrl)}" style="color:#1d4ed8;text-decoration:none;">${escapeHtml(brand.websiteUrl)}</a></div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export function buildEnrollmentWelcomeEmail(params: {
  studentUserId?: number;
  studentName: string;
  registeredEmail?: string;
  courseName: string;
  enrollmentNumber: string;
  candidateId?: string;
  username: string;
  temporaryPassword?: string;
  portalBaseUrl: string;
}): { subject: string; body: string; htmlBody: string; rawToken?: string } {
  const cleanUrl = params.portalBaseUrl.replace(/\/+$/, '');
  const rawToken = params.studentUserId ? createStudentActivationToken(params.studentUserId, 72) : '';
  const setupUrl = rawToken
    ? `${cleanUrl}/forgot-password?token=${rawToken}&mode=activate`
    : `${cleanUrl}/forgot-password`;

  const built = buildStudentCredentialsEmail({
    studentName: params.studentName,
    rollNumber: params.enrollmentNumber,
    registeredEmail: params.registeredEmail || params.username,
    username: params.username,
    candidateId: params.candidateId,
    courseSummary: params.courseName,
    portalBaseUrl: cleanUrl,
    setupPasswordUrl: setupUrl,
  });

  return {
    subject: built.subject,
    body: built.text,
    htmlBody: built.html,
    rawToken: rawToken || undefined,
  };
}

export function getEnrolledStudentsEmailOverview(): CredentialsEmailOverview {
  const rows = db
    .prepare(
      `SELECT u.id as user_id,
              u.full_name,
              COALESCE(NULLIF(u.email, ''), (SELECT e2.student_email_snapshot FROM enrollments e2 WHERE e2.student_user_id = u.id ORDER BY e2.id ASC LIMIT 1), '') as email,
              u.username,
              u.is_active,
              u.must_change_password,
              COALESCE(NULLIF(sp.enrollment_number, ''), (SELECT e2.enrollment_number FROM enrollments e2 WHERE e2.student_user_id = u.id ORDER BY e2.id ASC LIMIT 1), '') as roll_number,
              COALESCE(sp.candidate_id, '') as candidate_id,
              COALESCE(sp.employee_code, '') as employee_code,
              COUNT(e.id) as course_count,
              GROUP_CONCAT(e.course_name_snapshot, ', ') as enrolled_courses,
              GROUP_CONCAT(DISTINCT COALESCE(NULLIF(e.batch_code_snapshot, ''), e.batch_name)) as batches
       FROM users u
       JOIN enrollments e ON e.student_user_id = u.id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'STUDENT'
       GROUP BY u.id
       ORDER BY u.id ASC`
    )
    .all() as Array<{
    user_id: number;
    full_name: string;
    email: string;
    username: string;
    is_active: number;
    must_change_password: number;
    roll_number: string;
    candidate_id: string;
    employee_code: string;
    course_count: number;
    enrolled_courses: string;
    batches: string;
  }>;

  // Fetch latest credential/welcome email log per student_user_id (or matching recipient_email)
  const credLogs = db
    .prepare(
      `SELECT id, student_user_id, recipient_email, status, provider, error_message, sent_at, created_at
       FROM email_logs
       WHERE event_type IN ('STUDENT_LOGIN_CREDENTIALS', 'STUDENT_LOGIN_CREDENTIALS_RETRY', 'ENROLLMENT_WELCOME', 'ENROLLMENT_WELCOME_RESEND')
       ORDER BY id DESC`
    )
    .all() as Array<{
    id: number;
    student_user_id: number | null;
    recipient_email: string;
    status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED';
    provider: string;
    error_message: string;
    sent_at: string | null;
    created_at: string;
  }>;

  const logByUser = new Map<
    number,
    {
      hasSent: boolean;
      latest: (typeof credLogs)[number];
      attempts: number;
    }
  >();
  const logByEmail = new Map<
    string,
    {
      hasSent: boolean;
      latest: (typeof credLogs)[number];
      attempts: number;
    }
  >();

  for (const l of credLogs) {
    if (l.student_user_id) {
      const cur = logByUser.get(l.student_user_id);
      if (!cur) {
        logByUser.set(l.student_user_id, { hasSent: l.status === 'SENT', latest: l, attempts: 1 });
      } else {
        cur.attempts++;
        if (l.status === 'SENT') cur.hasSent = true;
      }
    }
    const emKey = (l.recipient_email || '').trim().toLowerCase();
    if (emKey) {
      const cur = logByEmail.get(emKey);
      if (!cur) {
        logByEmail.set(emKey, { hasSent: l.status === 'SENT', latest: l, attempts: 1 });
      } else {
        cur.attempts++;
        if (l.status === 'SENT') cur.hasSent = true;
      }
    }
  }

  let validEmailCount = 0;
  let invalidEmailCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  const students: EnrolledStudentEmailRow[] = rows.map((r) => {
    const check = validateStudentEmail(r.email);
    const logInfo = logByUser.get(r.user_id) || logByEmail.get((r.email || '').trim().toLowerCase());

    let delivery_status: EnrolledStudentEmailRow['delivery_status'];
    if (!check.valid) {
      invalidEmailCount++;
      delivery_status = 'INVALID_EMAIL';
    } else {
      validEmailCount++;
      if (logInfo?.hasSent) {
        sentCount++;
        delivery_status = 'SENT';
      } else if (logInfo && (logInfo.latest.status === 'FAILED' || logInfo.latest.status === 'NOT_CONFIGURED')) {
        failedCount++;
        delivery_status = 'FAILED';
      } else {
        pendingCount++;
        delivery_status = 'PENDING';
      }
    }

    return {
      ...r,
      email_valid: check.valid,
      email_warning: check.warning,
      delivery_status,
      last_log_id: logInfo?.latest.id ?? null,
      last_provider: logInfo?.latest.provider || '',
      last_sent_at: logInfo?.latest.sent_at || null,
      last_error: logInfo?.latest.error_message || '',
      attempts: logInfo?.attempts || 0,
    };
  });

  const recentCampaigns = db
    .prepare('SELECT * FROM email_campaigns ORDER BY id DESC LIMIT 15')
    .all() as Array<Record<string, unknown>>;

  return {
    providerStatus: getEmailProviderStatus(),
    summary: {
      totalEnrolledStudents: students.length,
      validEmailCount,
      invalidEmailCount,
      sentCount,
      failedCount,
      pendingCount,
    },
    bulkInProgress: bulkDispatchInProgress,
    recentCampaigns,
    students,
  };
}

export async function sendCredentialsEmailToStudent(params: {
  student: EnrolledStudentEmailRow;
  portalBaseUrl: string;
  campaignId?: string;
  eventType?: string;
  idempotencyKey?: string;
  forceResend?: boolean;
}): Promise<{
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'SKIPPED_ALREADY_SENT' | 'INVALID_EMAIL';
  logId?: number;
  message: string;
}> {
  if (!params.student.email_valid) {
    return {
      status: 'INVALID_EMAIL',
      message: params.student.email_warning || 'Invalid email address',
    };
  }

  if (!params.forceResend && params.student.delivery_status === 'SENT') {
    return {
      status: 'SKIPPED_ALREADY_SENT',
      message: 'Login credentials email was already delivered (duplicate prevented).',
    };
  }

  const rawToken = createStudentActivationToken(params.student.user_id, 72);
  const cleanUrl = params.portalBaseUrl.replace(/\/+$/, '');
  const setupPasswordUrl = `${cleanUrl}/forgot-password?token=${rawToken}&mode=activate`;

  const mail = buildStudentCredentialsEmail({
    studentName: params.student.full_name,
    rollNumber: params.student.roll_number,
    registeredEmail: params.student.email,
    username: params.student.username,
    candidateId: params.student.candidate_id,
    courseSummary: params.student.enrolled_courses,
    portalBaseUrl: cleanUrl,
    setupPasswordUrl,
  });

  const result = await sendLoggedEmail({
    recipientEmail: params.student.email,
    recipientName: params.student.full_name,
    subject: mail.subject,
    body: mail.text,
    htmlBody: mail.html,
    eventType: params.eventType || 'STUDENT_LOGIN_CREDENTIALS',
    studentUserId: params.student.user_id,
    campaignId: params.campaignId || '',
    idempotencyKey: params.idempotencyKey,
    redactSecret: rawToken,
  });

  if (result.deduplicated) {
    return {
      status: 'SKIPPED_ALREADY_SENT',
      logId: result.logId,
      message: result.message,
    };
  }

  return {
    status: result.status,
    logId: result.logId,
    message: result.message,
  };
}

export async function runBulkStudentCredentialsCampaign(params: {
  portalBaseUrl: string;
  mode: 'ALL_EXISTING' | 'RETRY_FAILED';
  campaignKey?: string;
  actor: { id: number; full_name: string; role: string };
}): Promise<BulkCampaignReport> {
  if (bulkDispatchInProgress) {
    throw new Error('A bulk student login email campaign is already running. Please wait for it to finish.');
  }

  const providerStatus = getEmailProviderStatus();
  const overview = getEnrolledStudentsEmailOverview();
  const campaignKey =
    (params.campaignKey || '').trim() ||
    `${params.mode.toLowerCase()}_${new Date().toISOString().slice(0, 10)}_${crypto.randomBytes(3).toString('hex')}`;

  // Duplicate campaign submission guard for explicit campaign keys
  if (params.campaignKey) {
    const existingCamp = db
      .prepare('SELECT id FROM email_campaigns WHERE campaign_key = ?')
      .get(params.campaignKey);
    if (existingCamp) {
      throw new Error('This campaign key has already been processed. Duplicate submission prevented.');
    }
  }

  bulkDispatchInProgress = true;
  const results: BulkCampaignReport['results'] = [];
  let sentCount = 0;
  let failedCount = 0;
  let skippedAlreadySentCount = 0;
  let invalidEmailCount = 0;

  try {
    const targets = overview.students.filter((s) => {
      if (params.mode === 'RETRY_FAILED') {
        return s.delivery_status === 'FAILED';
      }
      return true;
    });

    // Process in controlled batches of 5 to avoid overwhelming SMTP/API rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const slice = targets.slice(i, i + BATCH_SIZE);
      const batchOutcomes = await Promise.all(
        slice.map(async (student) => {
          if (!student.email_valid) {
            invalidEmailCount++;
            return {
              userId: student.user_id,
              fullName: student.full_name,
              rollNumber: student.roll_number,
              email: student.email,
              status: 'INVALID_EMAIL' as const,
              message: student.email_warning || 'Invalid email address',
            };
          }

          if (student.delivery_status === 'SENT') {
            skippedAlreadySentCount++;
            return {
              userId: student.user_id,
              fullName: student.full_name,
              rollNumber: student.roll_number,
              email: student.email,
              status: 'SKIPPED_ALREADY_SENT' as const,
              message: 'Already sent (duplicate prevented)',
            };
          }

          const outcome = await sendCredentialsEmailToStudent({
            student,
            portalBaseUrl: params.portalBaseUrl,
            campaignId: campaignKey,
            eventType: params.mode === 'RETRY_FAILED' ? 'STUDENT_LOGIN_CREDENTIALS_RETRY' : 'STUDENT_LOGIN_CREDENTIALS',
            idempotencyKey: `student_creds_${student.user_id}`,
            forceResend: params.mode === 'RETRY_FAILED',
          });

          if (outcome.status === 'SENT') {
            sentCount++;
          } else if (outcome.status === 'SKIPPED_ALREADY_SENT') {
            skippedAlreadySentCount++;
          } else if (outcome.status === 'INVALID_EMAIL') {
            invalidEmailCount++;
          } else {
            failedCount++;
          }

          return {
            userId: student.user_id,
            fullName: student.full_name,
            rollNumber: student.roll_number,
            email: student.email,
            status: outcome.status,
            message: outcome.message,
          };
        })
      );
      results.push(...batchOutcomes);
    }

    db.prepare(
      `INSERT INTO email_campaigns (
        campaign_key, name, initiated_by, initiator_name,
        total_enrolled, valid_emails, invalid_emails,
        sent_count, failed_count, skipped_count, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      campaignKey,
      params.mode === 'RETRY_FAILED' ? 'Retry Failed Student Login Emails' : 'Send Login Emails to All Existing Students',
      params.actor.id,
      params.actor.full_name,
      overview.summary.totalEnrolledStudents,
      overview.summary.validEmailCount,
      invalidEmailCount,
      sentCount,
      failedCount,
      skippedAlreadySentCount,
      failedCount > 0 && sentCount === 0 ? 'FAILED' : failedCount > 0 ? 'PARTIAL' : 'COMPLETED'
    );

    logActivity({
      actorUserId: params.actor.id,
      actorName: params.actor.full_name,
      actorRole: params.actor.role,
      action: params.mode === 'RETRY_FAILED' ? 'RETRY_STUDENT_LOGIN_EMAILS' : 'BULK_STUDENT_LOGIN_EMAILS',
      entityType: 'email_campaign',
      entityId: campaignKey,
      details: `Processed ${targets.length} students via ${providerStatus.provider}: ${sentCount} sent, ${failedCount} failed, ${skippedAlreadySentCount} skipped (already sent), ${invalidEmailCount} invalid email.`,
    });
  } finally {
    bulkDispatchInProgress = false;
  }

  const afterOverview = getEnrolledStudentsEmailOverview();

  return {
    campaignKey,
    provider: providerStatus.provider,
    providerConfigured: providerStatus.configured,
    totalEnrolledStudents: afterOverview.summary.totalEnrolledStudents,
    validEmailCount: afterOverview.summary.validEmailCount,
    invalidEmailCount: afterOverview.summary.invalidEmailCount,
    sentCount,
    failedCount,
    skippedAlreadySentCount,
    pendingCount: afterOverview.summary.pendingCount,
    message: !providerStatus.configured
      ? `Email provider is not configured on the server. Recorded ${failedCount} pending/failed attempts. Set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP credentials in server secrets and click "Retry Failed Emails".`
      : `Campaign finished: ${sentCount} sent, ${failedCount} failed, ${skippedAlreadySentCount} already sent (skipped), ${afterOverview.summary.invalidEmailCount} invalid email.`,
    results,
  };
}

export async function resendLoggedEmail(logId: number, portalBaseUrl?: string): Promise<EmailSendResult> {
  const log = db.prepare('SELECT * FROM email_logs WHERE id = ?').get(logId) as
    | {
        id: number;
        recipient_email: string;
        recipient_name: string;
        subject: string;
        body: string;
        html_body: string;
        event_type: string;
        related_enrollment_id: number | null;
        student_user_id: number | null;
      }
    | undefined;

  if (!log) {
    throw new Error('Email log record not found.');
  }

  // If this was a student credential/welcome email and we have the student_user_id, issue a fresh activation link!
  if (
    log.student_user_id &&
    portalBaseUrl &&
    (log.event_type.startsWith('STUDENT_LOGIN_CREDENTIALS') || log.event_type.startsWith('ENROLLMENT_WELCOME'))
  ) {
    const overview = getEnrolledStudentsEmailOverview();
    const stu = overview.students.find((s) => s.user_id === log.student_user_id);
    if (stu && stu.email_valid) {
      const res = await sendCredentialsEmailToStudent({
        student: stu,
        portalBaseUrl,
        eventType: 'STUDENT_LOGIN_CREDENTIALS_RETRY',
        forceResend: true,
      });
      return {
        logId: res.logId || logId,
        status: res.status === 'SENT' ? 'SENT' : res.status === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'FAILED',
        provider: getEmailProviderStatus().provider,
        message: res.message,
      };
    }
  }

  const delivery = await deliverEmail({
    to: log.recipient_email,
    subject: log.subject,
    text: log.body,
    html: log.html_body || undefined,
  });

  const inserted = db
    .prepare(
      `INSERT INTO email_logs (
        recipient_email, recipient_name, subject, body, html_body, provider, event_type,
        related_enrollment_id, student_user_id, idempotency_key, status, provider_response, error_message, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
    )
    .run(
      log.recipient_email,
      log.recipient_name,
      log.subject,
      log.body,
      log.html_body || '',
      delivery.provider,
      `${log.event_type}_RESEND`,
      log.related_enrollment_id,
      log.student_user_id,
      delivery.status,
      delivery.response,
      delivery.error,
      delivery.ok ? new Date().toISOString() : null
    );

  return {
    logId: Number(inserted.lastInsertRowid),
    status: delivery.status,
    provider: delivery.provider,
    message: delivery.ok ? `Email resent successfully via ${delivery.provider}.` : delivery.error,
  };
}

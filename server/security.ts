import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import path from 'path';
import { db } from './db.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_HOURS = 24 * 7; // 7 days

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STUDENT';
  full_name: string;
  is_active: number;
  must_change_password: number;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      sessionTokenHash?: string;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(keyHex, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

export function hashToken(rawToken: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('hex');
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createSession(user: AuthUser): { token: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, role, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, user.id, user.role, expiresAt);

  return { token: rawToken, expiresAt };
}

export function revokeSession(tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function revokeAllUserSessions(userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const rawToken = extractBearerToken(req);
  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.role, u.full_name, u.is_active, u.must_change_password, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as (AuthUser & { expires_at: string }) | undefined;

  if (!row) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    revokeSession(tokenHash);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  if (!row.is_active) {
    res.status(403).json({ error: 'This account has been suspended. Contact AITM administration.' });
    return;
  }

  req.authUser = {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    full_name: row.full_name,
    is_active: row.is_active,
    must_change_password: row.must_change_password,
  };
  req.sessionTokenHash = tokenHash;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.authUser || (req.authUser.role !== 'ADMIN' && req.authUser.role !== 'SUPER_ADMIN')) {
      res.status(403).json({ error: 'Administrator privileges required.' });
      return;
    }
    next();
  });
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.authUser || req.authUser.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Super Administrator privileges required.' });
      return;
    }
    next();
  });
}

export function requireStudent(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.authUser || req.authUser.role !== 'STUDENT') {
      res.status(403).json({ error: 'Student account access required.' });
      return;
    }
    next();
  });
}

// Simple sliding-window in-memory rate limiter
const rateBuckets = new Map<string, number[]>();

export function rateLimit(options: { windowMs: number; max: number; keyPrefix: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const timestamps = (rateBuckets.get(key) || []).filter((t) => t > cutoff);
    if (timestamps.length >= options.max) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

export function sanitizeUrl(url: string | undefined | null): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) return '';
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export function resolveConfinedPath(baseDir: string, relativeFileName: string): string | null {
  const safeBase = path.resolve(baseDir);
  const candidate = path.resolve(safeBase, relativeFileName);
  if (!candidate.startsWith(safeBase + path.sep)) {
    return null;
  }
  return candidate;
}

export function generateUniqueStudentUsername(fullName: string): string {
  const firstToken =
    fullName
      .trim()
      .toLowerCase()
      .split(/\s+/)[0]
      ?.replace(/[^a-z0-9]/g, '') || 'student';

  const base = `${firstToken}-aitm`;
  const existsStmt = db.prepare('SELECT id FROM users WHERE username = ?');
  if (!existsStmt.get(base)) {
    return base;
  }
  let suffix = 2;
  while (existsStmt.get(`${firstToken}${suffix}-aitm`)) {
    suffix += 1;
  }
  return `${firstToken}${suffix}-aitm`;
}

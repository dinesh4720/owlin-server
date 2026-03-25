import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../config/database.js';
import { getEnv } from '../config/env.js';
import { hashApiKey } from '../utils/apiKey.js';
import { checkRateLimit } from '../utils/rateLimiter.js';

export interface ProjectInfo {
  id: string;
  name: string;
  status: string;
  rateLimitPerMinute: number;
  quotaEventsPerDay: number;
  retentionDays: number;
}

declare global {
  namespace Express {
    interface Request {
      project?: ProjectInfo;
      isAdmin?: boolean;
    }
  }
}

/**
 * Authenticate requests using project API key (X-API-Key header).
 * Attaches req.project on success.
 */
export async function projectAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  const db = getDb();
  const keyHash = hashApiKey(apiKey);

  const result = await db.execute({
    sql: 'SELECT id, name, status, rate_limit_per_minute, quota_events_per_day, retention_days FROM projects WHERE api_key_hash = ?',
    args: [keyHash],
  });

  if (result.rows.length === 0) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  const row = result.rows[0];
  const project: ProjectInfo = {
    id: row.id as string,
    name: row.name as string,
    status: row.status as string,
    rateLimitPerMinute: row.rate_limit_per_minute as number,
    quotaEventsPerDay: row.quota_events_per_day as number,
    retentionDays: row.retention_days as number,
  };

  if (project.status !== 'active') {
    res.status(403).json({ error: `Project "${project.name}" is ${project.status}` });
    return;
  }

  // Rate limit check
  if (!checkRateLimit(project.id, project.rateLimitPerMinute)) {
    res.status(429).json({
      error: 'Rate limit exceeded',
      limit: project.rateLimitPerMinute,
      retryAfter: 60,
    });
    return;
  }

  req.project = project;
  next();
}

/**
 * Authenticate admin requests using OWLIN_ADMIN_KEY.
 * Used for project management, access logs, error viewing.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const env = getEnv();

  if (!apiKey || apiKey !== env.OWLIN_ADMIN_KEY) {
    res.status(401).json({ error: 'Invalid or missing admin API key' });
    return;
  }

  req.isAdmin = true;
  next();
}

/**
 * Accept EITHER a project API key OR the admin key.
 * Project key → scoped to that project (req.project set).
 * Admin key → full access across all projects (req.isAdmin = true, no req.project).
 */
export async function projectOrAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  const env = getEnv();

  // Check admin key first
  if (apiKey === env.OWLIN_ADMIN_KEY) {
    req.isAdmin = true;
    next();
    return;
  }

  // Fall back to project key auth
  return projectAuth(req, res, next);
}

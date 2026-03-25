import { randomUUID, createHash } from 'crypto';
import { getDb } from '../config/database.js';
import type { RawEvent } from './eventService.js';

/** Auto-detect module from URL path. */
function detectModule(page: string | null): string {
  if (!page) return 'Unknown';
  const moduleMap: Record<string, string> = {
    '/students': 'Students',
    '/classes': 'Classes',
    '/fees': 'Fees',
    '/academics': 'Academics',
    '/staffs': 'Staff',
    '/attendance': 'Attendance',
    '/messaging': 'Messaging',
    '/settings': 'Settings',
    '/front-desk': 'Front Desk',
    '/transport': 'Transport',
    '/library': 'Library',
    '/hostel': 'Hostel',
    '/homework': 'Homework',
    '/payroll': 'Payroll',
    '/timetable': 'Timetable',
  };
  for (const [prefix, name] of Object.entries(moduleMap)) {
    if (page.startsWith(prefix)) return name;
  }
  if (page === '/' || page === '/dashboard') return 'Dashboard';
  return 'Other';
}

/** Create a fingerprint for grouping identical errors. */
function computeFingerprint(message: string, file?: string, line?: number): string {
  const raw = `${message}|${file ?? ''}|${line ?? ''}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Process an error event: upsert error group + create incident with full context.
 */
export async function processErrorEvent(
  projectId: string,
  eventId: string,
  raw: RawEvent,
  userId: string | null,
  page: string | null,
): Promise<void> {
  const db = getDb();
  const message = (raw.metadata as any)?.message ?? (raw.metadata as any)?.error ?? raw.action ?? 'Unknown error';
  const file = raw.file ?? (raw.metadata as any)?.source ?? null;
  const line = raw.line ?? (raw.metadata as any)?.lineno ?? null;
  const col = raw.col ?? (raw.metadata as any)?.colno ?? null;
  const stackTrace = raw.stackTrace ?? (raw.metadata as any)?.stack ?? null;
  const fingerprint = computeFingerprint(message, file, line);
  const module = detectModule(page);
  const now = new Date().toISOString();
  const severity = raw.severity ?? (raw.type === 'api_error' ? 'api_error' : 'error');
  const source = raw.source ?? (raw.apiError ? 'network' : 'frontend');

  // Upsert error group
  const existingGroup = await db.execute({
    sql: 'SELECT id, affected_user_ids_json, user_count FROM error_groups WHERE project_id = ? AND fingerprint = ?',
    args: [projectId, fingerprint],
  });

  let groupId: string;

  if (existingGroup.rows.length > 0) {
    groupId = existingGroup.rows[0].id as string;
    let affectedIds: string[] = JSON.parse((existingGroup.rows[0].affected_user_ids_json as string) ?? '[]');
    let userCount = existingGroup.rows[0].user_count as number;
    if (userId && !affectedIds.includes(userId)) {
      affectedIds.push(userId);
      userCount++;
    }

    await db.execute({
      sql: `UPDATE error_groups SET
              count = count + 1,
              user_count = ?,
              affected_user_ids_json = ?,
              last_seen = ?,
              last_stack_trace = COALESCE(?, last_stack_trace),
              last_page = COALESCE(?, last_page),
              last_user_action = COALESCE(?, last_user_action),
              status = CASE WHEN status = 'resolved' THEN 'unresolved' ELSE status END
            WHERE id = ?`,
      args: [
        userCount,
        JSON.stringify(affectedIds),
        now,
        stackTrace,
        page,
        raw.action,
        groupId,
      ],
    });
  } else {
    groupId = randomUUID();
    await db.execute({
      sql: `INSERT INTO error_groups (id, project_id, fingerprint, message, file, line, col, module, affected_user_ids_json, first_seen, last_seen, last_stack_trace, last_page, last_user_action)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        groupId, projectId, fingerprint, message, file, line, col, module,
        userId ? JSON.stringify([userId]) : '[]',
        now, now, stackTrace, page, raw.action,
      ],
    });
  }

  // Create incident with full breadcrumbs
  const userMeta = raw.userMetadata as any;
  await db.execute({
    sql: `INSERT INTO error_incidents (id, project_id, error_group_id, source, severity, message, stack_trace, file, line, col, module, page, action, api_error_json, console_errors_json, breadcrumbs_json, user_id, user_name, user_role, browser, os, viewport_json, screenshot_url, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(), projectId, groupId, source, severity, message,
      stackTrace, file, line, col, module, page, raw.action ?? null,
      raw.apiError ? JSON.stringify(raw.apiError) : null,
      raw.consoleErrors ? JSON.stringify(raw.consoleErrors) : null,
      raw.breadcrumbs ? JSON.stringify(raw.breadcrumbs) : null,
      userId,
      userMeta?.name ?? null,
      userMeta?.role ?? null,
      (raw.metadata as any)?.browser ?? null,
      (raw.metadata as any)?.os ?? null,
      raw.viewport ? JSON.stringify(raw.viewport) : null,
      raw.screenshotDataUrl ?? null,
      normalizeTimestamp(raw.timestamp),
    ],
  });
}

function normalizeTimestamp(ts?: string | number): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'number') return new Date(ts).toISOString();
  return ts;
}

/**
 * List error groups with filters.
 */
export async function listErrorGroups(filters: {
  projectId?: string;
  status?: string;
  module?: string;
  limit?: number;
  offset?: number;
}): Promise<{ groups: any[]; total: number }> {
  const db = getDb();
  const where: string[] = [];
  const args: any[] = [];

  if (filters.projectId) { where.push('project_id = ?'); args.push(filters.projectId); }
  if (filters.status) { where.push('status = ?'); args.push(filters.status); }
  if (filters.module) { where.push('module = ?'); args.push(filters.module); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const countResult = await db.execute({ sql: `SELECT COUNT(*) as total FROM error_groups ${whereClause}`, args });
  const total = (countResult.rows[0].total as number) ?? 0;

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const result = await db.execute({
    sql: `SELECT * FROM error_groups ${whereClause} ORDER BY last_seen DESC LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  return {
    groups: result.rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      fingerprint: r.fingerprint,
      message: r.message,
      file: r.file,
      line: r.line,
      col: r.col,
      module: r.module,
      count: r.count,
      userCount: r.user_count,
      status: r.status,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      lastPage: r.last_page,
      lastUserAction: r.last_user_action,
    })),
    total,
  };
}

/**
 * Get error group detail with incidents.
 */
export async function getErrorGroupDetail(fingerprint: string): Promise<any> {
  const db = getDb();
  const groupResult = await db.execute({
    sql: 'SELECT * FROM error_groups WHERE fingerprint = ? OR id = ?',
    args: [fingerprint, fingerprint],
  });
  if (groupResult.rows.length === 0) return null;
  const group = groupResult.rows[0] as any;

  const incidents = await db.execute({
    sql: 'SELECT * FROM error_incidents WHERE error_group_id = ? ORDER BY timestamp DESC LIMIT 50',
    args: [group.id],
  });

  return {
    ...group,
    affectedUserIds: JSON.parse(group.affected_user_ids_json ?? '[]'),
    incidents: incidents.rows.map((r: any) => ({
      id: r.id,
      source: r.source,
      severity: r.severity,
      message: r.message,
      stackTrace: r.stack_trace,
      file: r.file,
      line: r.line,
      module: r.module,
      page: r.page,
      action: r.action,
      apiError: r.api_error_json ? JSON.parse(r.api_error_json) : null,
      consoleErrors: r.console_errors_json ? JSON.parse(r.console_errors_json) : null,
      breadcrumbs: r.breadcrumbs_json ? JSON.parse(r.breadcrumbs_json) : null,
      userId: r.user_id,
      userName: r.user_name,
      userRole: r.user_role,
      browser: r.browser,
      os: r.os,
      viewport: r.viewport_json ? JSON.parse(r.viewport_json) : null,
      screenshotUrl: r.screenshot_url,
      timestamp: r.timestamp,
    })),
  };
}

export async function updateErrorGroupStatus(fingerprint: string, status: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'UPDATE error_groups SET status = ? WHERE fingerprint = ? OR id = ?',
    args: [status, fingerprint, fingerprint],
  });
  return result.rowsAffected > 0;
}

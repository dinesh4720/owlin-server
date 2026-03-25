import { randomUUID } from 'crypto';
import { getDb } from '../config/database.js';
import { incrementProjectEvents } from './projectService.js';
import { processErrorEvent } from './errorService.js';

export interface RawEvent {
  type: string;
  category?: string;
  timestamp?: string | number;
  userId?: string;
  sessionId?: string;
  page?: string | Record<string, unknown>;
  action?: string;
  element?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
  app?: Record<string, unknown>;
  session?: Record<string, unknown>;
  viewport?: Record<string, unknown>;
  // Error fields
  breadcrumbs?: Record<string, unknown>[];
  consoleErrors?: Record<string, unknown>[];
  apiError?: Record<string, unknown>;
  stackTrace?: string;
  file?: string;
  line?: number;
  col?: number;
  severity?: string;
  source?: string;
  screenshotDataUrl?: string;
  [key: string]: unknown;
}

export interface StoredEvent {
  id: string;
  projectId: string;
  type: string;
  category: string;
  timestamp: string;
  userId: string | null;
  sessionId: string | null;
  page: string | null;
  action: string | null;
  element: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  properties: Record<string, unknown> | null;
  createdAt: string;
}

function json(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  return JSON.stringify(val);
}

function normalizeTimestamp(ts?: string | number): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'number') return new Date(ts).toISOString();
  return ts;
}

function normalizePage(page?: string | Record<string, unknown>): string | null {
  if (!page) return null;
  if (typeof page === 'string') return page;
  return (page.url as string) ?? (page.path as string) ?? JSON.stringify(page);
}

/**
 * Ingest a single event, handling user upsert, session update, and error processing.
 */
export async function ingestEvent(projectId: string, raw: RawEvent, batchMeta?: { userId?: string; userName?: string; userRole?: string }): Promise<string> {
  const db = getDb();
  const id = randomUUID();
  const timestamp = normalizeTimestamp(raw.timestamp);
  const userId = raw.userId ?? batchMeta?.userId ?? null;
  const page = normalizePage(raw.page);

  // Merge user metadata from batch-level and event-level
  const userMeta = raw.userMetadata ?? {};
  if (batchMeta?.userName) (userMeta as any).name = batchMeta.userName;
  if (batchMeta?.userRole) (userMeta as any).role = batchMeta.userRole;

  await db.execute({
    sql: `INSERT INTO events (id, project_id, type, category, timestamp, user_id, session_id, page, action, element_json, metadata_json, properties_json, user_metadata_json, user_agent, viewport_json, app_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, projectId, raw.type, raw.category ?? 'interaction', timestamp,
      userId, raw.sessionId ?? null, page, raw.action ?? null,
      json(raw.element), json(raw.metadata), json(raw.properties),
      json(Object.keys(userMeta).length > 0 ? userMeta : null),
      null, // user_agent filled by middleware if needed
      json(raw.viewport), json(raw.app), timestamp,
    ],
  });

  // Upsert tracked user
  if (userId) {
    await db.execute({
      sql: `INSERT INTO tracked_users (id, project_id, user_id, metadata_json, first_seen, last_seen, event_count)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(project_id, user_id) DO UPDATE SET
              last_seen = excluded.last_seen,
              event_count = event_count + 1,
              metadata_json = CASE
                WHEN excluded.metadata_json != '{}' AND excluded.metadata_json IS NOT NULL
                THEN excluded.metadata_json
                ELSE tracked_users.metadata_json
              END`,
      args: [randomUUID(), projectId, userId, json(userMeta) ?? '{}', timestamp, timestamp],
    });
  }

  // Update session event count
  if (raw.sessionId) {
    await db.execute({
      sql: `UPDATE sessions SET event_count = event_count + 1, pages_json =
            CASE WHEN ? IS NOT NULL AND pages_json NOT LIKE '%' || ? || '%'
              THEN json_insert(pages_json, '$[#]', ?)
              ELSE pages_json
            END
            WHERE project_id = ? AND session_id = ?`,
      args: [page, page, page, projectId, raw.sessionId],
    });
  }

  // Process error events
  if (raw.type === 'error' || raw.type === 'api_error' || raw.severity) {
    await processErrorEvent(projectId, id, raw, userId, page);
  }

  return id;
}

/**
 * Ingest a batch of events. Returns count of events stored.
 */
export async function ingestBatch(
  projectId: string,
  events: RawEvent[],
  batchMeta?: { userId?: string; userName?: string; userRole?: string; sessionId?: string }
): Promise<number> {
  let count = 0;
  for (const raw of events) {
    // Inherit batch-level session/user if not set per-event
    if (!raw.sessionId && batchMeta?.sessionId) raw.sessionId = batchMeta.sessionId;
    if (!raw.userId && batchMeta?.userId) raw.userId = batchMeta.userId;
    await ingestEvent(projectId, raw, batchMeta);
    count++;
  }
  await incrementProjectEvents(projectId, count);
  return count;
}

/**
 * Query events with filters and pagination.
 */
export async function queryEvents(projectId: string | null, filters: {
  limit?: number;
  offset?: number;
  userId?: string;
  sessionId?: string;
  type?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ events: StoredEvent[]; total: number }> {
  const db = getDb();
  const where: string[] = [];
  const args: any[] = [];

  if (projectId) { where.push('project_id = ?'); args.push(projectId); }

  if (filters.userId) { where.push('user_id = ?'); args.push(filters.userId); }
  if (filters.sessionId) { where.push('session_id = ?'); args.push(filters.sessionId); }
  if (filters.type) { where.push('type = ?'); args.push(filters.type); }
  if (filters.category) { where.push('category = ?'); args.push(filters.category); }
  if (filters.startDate) { where.push('timestamp >= ?'); args.push(filters.startDate); }
  if (filters.endDate) { where.push('timestamp <= ?'); args.push(filters.endDate); }

  const whereClause = where.length > 0 ? where.join(' AND ') : '1=1';

  const countResult = await db.execute({ sql: `SELECT COUNT(*) as total FROM events WHERE ${whereClause}`, args });
  const total = (countResult.rows[0].total as number) ?? 0;

  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  const result = await db.execute({
    sql: `SELECT * FROM events WHERE ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  const events: StoredEvent[] = result.rows.map((row: any) => ({
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    category: row.category,
    timestamp: row.timestamp,
    userId: row.user_id,
    sessionId: row.session_id,
    page: row.page,
    action: row.action,
    element: row.element_json ? JSON.parse(row.element_json) : null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    properties: row.properties_json ? JSON.parse(row.properties_json) : null,
    createdAt: row.created_at,
  }));

  return { events, total };
}

export async function getEvent(projectId: string | null, eventId: string): Promise<StoredEvent | null> {
  const db = getDb();
  const sql = projectId
    ? 'SELECT * FROM events WHERE id = ? AND project_id = ?'
    : 'SELECT * FROM events WHERE id = ?';
  const args = projectId ? [eventId, projectId] : [eventId];
  const result = await db.execute({ sql, args });
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    category: row.category,
    timestamp: row.timestamp,
    userId: row.user_id,
    sessionId: row.session_id,
    page: row.page,
    action: row.action,
    element: row.element_json ? JSON.parse(row.element_json) : null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    properties: row.properties_json ? JSON.parse(row.properties_json) : null,
    createdAt: row.created_at,
  };
}

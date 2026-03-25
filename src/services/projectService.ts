import { randomUUID } from 'crypto';
import { getDb } from '../config/database.js';
import { generateApiKey, hashApiKey } from '../utils/apiKey.js';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  apiKeyPrefix: string;
  status: string;
  rateLimitPerMinute: number;
  quotaEventsPerDay: number;
  retentionDays: number;
  totalEvents: number;
  lastEventAt: string | null;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    apiKeyPrefix: row.api_key_prefix,
    status: row.status,
    rateLimitPerMinute: row.rate_limit_per_minute,
    quotaEventsPerDay: row.quota_events_per_day,
    retentionDays: row.retention_days,
    totalEvents: row.total_events,
    lastEventAt: row.last_event_at,
    ownerEmail: row.owner_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createProject(data: {
  name: string;
  description?: string;
  rateLimitPerMinute?: number;
  quotaEventsPerDay?: number;
  retentionDays?: number;
  ownerEmail?: string;
}): Promise<{ project: Project; rawApiKey: string }> {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const { raw, hash, prefix } = generateApiKey();

  await db.execute({
    sql: `INSERT INTO projects (id, name, description, api_key_hash, api_key_prefix, rate_limit_per_minute, quota_events_per_day, retention_days, owner_email, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.name,
      data.description ?? null,
      hash,
      prefix,
      data.rateLimitPerMinute ?? 600,
      data.quotaEventsPerDay ?? 100_000,
      data.retentionDays ?? 90,
      data.ownerEmail ?? null,
      now,
      now,
    ],
  });

  const result = await db.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [id] });
  return { project: rowToProject(result.rows[0]), rawApiKey: raw };
}

export async function listProjects(status?: string): Promise<Project[]> {
  const db = getDb();
  let sql = 'SELECT * FROM projects';
  const args: any[] = [];
  if (status) {
    sql += ' WHERE status = ?';
    args.push(status);
  }
  sql += ' ORDER BY created_at DESC';
  const result = await db.execute({ sql, args });
  return result.rows.map(rowToProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const db = getDb();
  const result = await db.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [id] });
  return result.rows.length > 0 ? rowToProject(result.rows[0]) : null;
}

export async function updateProject(id: string, data: Record<string, any>): Promise<Project | null> {
  const db = getDb();
  const sets: string[] = [];
  const args: any[] = [];

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    status: 'status',
    rateLimitPerMinute: 'rate_limit_per_minute',
    quotaEventsPerDay: 'quota_events_per_day',
    retentionDays: 'retention_days',
    ownerEmail: 'owner_email',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      sets.push(`${col} = ?`);
      args.push(data[key]);
    }
  }

  if (sets.length === 0) return getProject(id);

  sets.push('updated_at = ?');
  args.push(new Date().toISOString());
  args.push(id);

  await db.execute({
    sql: `UPDATE projects SET ${sets.join(', ')} WHERE id = ?`,
    args,
  });

  return getProject(id);
}

export async function regenerateProjectKey(id: string): Promise<{ project: Project; rawApiKey: string } | null> {
  const db = getDb();
  const project = await getProject(id);
  if (!project) return null;

  const { raw, hash, prefix } = generateApiKey();
  await db.execute({
    sql: 'UPDATE projects SET api_key_hash = ?, api_key_prefix = ?, updated_at = ? WHERE id = ?',
    args: [hash, prefix, new Date().toISOString(), id],
  });

  const updated = await getProject(id);
  return { project: updated!, rawApiKey: raw };
}

export async function deleteProject(id: string): Promise<boolean> {
  const db = getDb();
  // Delete related data first
  await db.execute({ sql: 'DELETE FROM error_incidents WHERE project_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM error_groups WHERE project_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM events WHERE project_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM sessions WHERE project_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM tracked_users WHERE project_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM access_logs WHERE project_id = ?', args: [id] });
  const result = await db.execute({ sql: 'DELETE FROM projects WHERE id = ?', args: [id] });
  return result.rowsAffected > 0;
}

export async function incrementProjectEvents(projectId: string, count: number): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE projects SET total_events = total_events + ?, last_event_at = ? WHERE id = ?',
    args: [count, new Date().toISOString(), projectId],
  });
}

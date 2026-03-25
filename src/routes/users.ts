import { Router } from 'express';
import { randomUUID } from 'crypto';
import { projectAuth, projectOrAdminAuth } from '../middleware/auth.js';
import { identifyUserSchema } from '../middleware/validation.js';
import { getDb } from '../config/database.js';

const router = Router();

// Identify / upsert a user (project key only)
router.post('/identify', projectAuth, async (req, res) => {
  try {
    const data = identifyUserSchema.parse(req.body);
    const db = getDb();
    const now = new Date().toISOString();
    const metaJson = JSON.stringify(data.metadata ?? {});
    const propsJson = JSON.stringify(data.properties ?? {});

    await db.execute({
      sql: `INSERT INTO tracked_users (id, project_id, user_id, metadata_json, properties_json, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id, user_id) DO UPDATE SET
              metadata_json = CASE WHEN ? != '{}' THEN ? ELSE tracked_users.metadata_json END,
              properties_json = CASE WHEN ? != '{}' THEN ? ELSE tracked_users.properties_json END,
              last_seen = ?`,
      args: [
        randomUUID(), req.project!.id, data.userId, metaJson, propsJson, now, now,
        metaJson, metaJson, propsJson, propsJson, now,
      ],
    });

    res.json({ status: 'ok', userId: data.userId });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// List tracked users (admin: all, project key: scoped)
router.get('/', projectOrAdminAuth, async (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const projectId = req.isAdmin ? (req.query.projectId as string | undefined) : req.project!.id;

    const sql = projectId
      ? 'SELECT * FROM tracked_users WHERE project_id = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM tracked_users ORDER BY last_seen DESC LIMIT ? OFFSET ?';
    const args = projectId ? [projectId, limit, offset] : [limit, offset];
    const result = await db.execute({ sql, args });

    const users = result.rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      metadata: JSON.parse(r.metadata_json ?? '{}'),
      properties: JSON.parse(r.properties_json ?? '{}'),
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      eventCount: r.event_count,
      sessionCount: r.session_count,
    }));

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get user detail (admin or project)
router.get('/:userId', projectOrAdminAuth, async (req, res) => {
  try {
    const db = getDb();
    const projectId = req.isAdmin ? null : req.project!.id;
    const sql = projectId
      ? 'SELECT * FROM tracked_users WHERE project_id = ? AND user_id = ?'
      : 'SELECT * FROM tracked_users WHERE user_id = ?';
    const args = projectId ? [projectId, req.params.userId] : [req.params.userId];
    const result = await db.execute({ sql, args });

    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    const r = result.rows[0] as any;

    // Get recent events
    const evtSql = projectId
      ? 'SELECT * FROM events WHERE project_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT 50'
      : 'SELECT * FROM events WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50';
    const evtArgs: any[] = projectId ? [projectId, req.params.userId] : [req.params.userId];
    const eventsResult = await db.execute({ sql: evtSql, args: evtArgs });

    res.json({
      user: {
        id: r.id,
        userId: r.user_id,
        metadata: JSON.parse(r.metadata_json ?? '{}'),
        properties: JSON.parse(r.properties_json ?? '{}'),
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        eventCount: r.event_count,
        sessionCount: r.session_count,
      },
      recentEvents: eventsResult.rows.map((e: any) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        page: e.page,
        action: e.action,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

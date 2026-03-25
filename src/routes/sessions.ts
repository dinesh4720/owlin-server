import { Router } from 'express';
import { randomUUID } from 'crypto';
import { projectAuth, projectOrAdminAuth } from '../middleware/auth.js';
import { startSessionSchema, endSessionSchema } from '../middleware/validation.js';
import { getDb } from '../config/database.js';

const router = Router();

// Start a session (project key only)
router.post('/start', projectAuth, async (req, res) => {
  try {
    const data = startSessionSchema.parse(req.body);
    const db = getDb();
    const sessionId = data.sessionId ?? randomUUID();
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO sessions (id, project_id, session_id, user_id, start_time, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id, session_id) DO UPDATE SET
              metadata_json = COALESCE(?, sessions.metadata_json)`,
      args: [
        randomUUID(), req.project!.id, sessionId, data.userId, now,
        data.metadata ? JSON.stringify(data.metadata) : null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    });

    // Increment user session count
    await db.execute({
      sql: `UPDATE tracked_users SET session_count = session_count + 1 WHERE project_id = ? AND user_id = ?`,
      args: [req.project!.id, data.userId],
    });

    res.status(201).json({ sessionId, status: 'ok' });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// End a session (project key only)
router.post('/end', projectAuth, async (req, res) => {
  try {
    const data = endSessionSchema.parse(req.body);
    const db = getDb();
    const now = new Date().toISOString();

    const sessionResult = await db.execute({
      sql: 'SELECT start_time FROM sessions WHERE project_id = ? AND session_id = ?',
      args: [req.project!.id, data.sessionId],
    });

    if (sessionResult.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const startTime = new Date(sessionResult.rows[0].start_time as string).getTime();
    const durationMs = Date.now() - startTime;

    await db.execute({
      sql: 'UPDATE sessions SET end_time = ?, duration_ms = ? WHERE project_id = ? AND session_id = ?',
      args: [now, durationMs, req.project!.id, data.sessionId],
    });

    res.json({ status: 'ok', durationMs });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// List sessions (admin: all projects, project key: scoped)
router.get('/', projectOrAdminAuth, async (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const active = req.query.active === 'true';
    const projectId = req.isAdmin ? (req.query.projectId as string | undefined) : req.project!.id;

    let sql = projectId ? 'SELECT * FROM sessions WHERE project_id = ?' : 'SELECT * FROM sessions WHERE 1=1';
    const args: any[] = projectId ? [projectId] : [];

    if (active) {
      sql += ' AND end_time IS NULL';
    }

    if (req.query.userId) {
      sql += ' AND user_id = ?';
      args.push(req.query.userId);
    }

    sql += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
    args.push(limit, offset);

    const result = await db.execute({ sql, args });

    res.json({
      sessions: result.rows.map((r: any) => ({
        id: r.id,
        sessionId: r.session_id,
        userId: r.user_id,
        startTime: r.start_time,
        endTime: r.end_time,
        durationMs: r.duration_ms,
        eventCount: r.event_count,
        pages: JSON.parse(r.pages_json ?? '[]'),
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get session detail (admin or project)
router.get('/:sessionId', projectOrAdminAuth, async (req, res) => {
  try {
    const db = getDb();
    const projectId = req.isAdmin ? null : req.project!.id;
    const sql = projectId
      ? 'SELECT * FROM sessions WHERE project_id = ? AND session_id = ?'
      : 'SELECT * FROM sessions WHERE session_id = ?';
    const args = projectId ? [projectId, req.params.sessionId] : [req.params.sessionId];
    const result = await db.execute({ sql, args });

    if (result.rows.length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
    const r = result.rows[0] as any;

    // Get session events
    const evtSql = projectId
      ? 'SELECT id, type, timestamp, page, action FROM events WHERE project_id = ? AND session_id = ? ORDER BY timestamp ASC'
      : 'SELECT id, type, timestamp, page, action FROM events WHERE session_id = ? ORDER BY timestamp ASC';
    const evtArgs = projectId ? [projectId, req.params.sessionId] : [req.params.sessionId];
    const eventsResult = await db.execute({ sql: evtSql, args: evtArgs });

    res.json({
      session: {
        id: r.id,
        sessionId: r.session_id,
        userId: r.user_id,
        startTime: r.start_time,
        endTime: r.end_time,
        durationMs: r.duration_ms,
        eventCount: r.event_count,
        pages: JSON.parse(r.pages_json ?? '[]'),
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
      },
      events: eventsResult.rows.map((e: any) => ({
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

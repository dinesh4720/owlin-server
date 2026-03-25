import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { accessLogsQuerySchema } from '../middleware/validation.js';
import { getDb } from '../config/database.js';

const router = Router();

router.use(adminAuth);

// List access logs
router.get('/', async (req, res) => {
  try {
    const filters = accessLogsQuerySchema.parse(req.query);
    const db = getDb();

    const where: string[] = [];
    const args: any[] = [];

    if (filters.projectId) { where.push('project_id = ?'); args.push(filters.projectId); }
    if (filters.method) { where.push('method = ?'); args.push(filters.method); }
    if (filters.startDate) { where.push('timestamp >= ?'); args.push(filters.startDate); }
    if (filters.endDate) { where.push('timestamp <= ?'); args.push(filters.endDate); }
    if (filters.minStatusCode) { where.push('status_code >= ?'); args.push(filters.minStatusCode); }
    if (filters.maxStatusCode) { where.push('status_code <= ?'); args.push(filters.maxStatusCode); }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const countResult = await db.execute({ sql: `SELECT COUNT(*) as total FROM access_logs ${whereClause}`, args });
    const total = (countResult.rows[0].total as number) ?? 0;

    const result = await db.execute({
      sql: `SELECT * FROM access_logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      args: [...args, filters.limit, filters.offset],
    });

    res.json({
      logs: result.rows.map((r: any) => ({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project_name,
        timestamp: r.timestamp,
        method: r.method,
        endpoint: r.endpoint,
        statusCode: r.status_code,
        responseTimeMs: r.response_time_ms,
        ip: r.ip,
        userAgent: r.user_agent,
        eventCount: r.event_count,
        errorMessage: r.error_message,
      })),
      total,
    });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Access log stats
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();

    const [totalR, errorsR, avgTimeR, recentR, byProjectR, byEndpointR] = await Promise.all([
      db.execute('SELECT COUNT(*) as c FROM access_logs'),
      db.execute("SELECT COUNT(*) as c FROM access_logs WHERE status_code >= 400"),
      db.execute('SELECT AVG(response_time_ms) as avg FROM access_logs WHERE response_time_ms IS NOT NULL'),
      db.execute({ sql: 'SELECT COUNT(*) as c FROM access_logs WHERE timestamp >= ?', args: [hourAgo] }),
      db.execute('SELECT project_id, project_name, COUNT(*) as count FROM access_logs WHERE project_id IS NOT NULL GROUP BY project_id ORDER BY count DESC LIMIT 10'),
      db.execute('SELECT endpoint, COUNT(*) as count FROM access_logs GROUP BY endpoint ORDER BY count DESC LIMIT 10'),
    ]);

    const total = totalR.rows[0].c as number;
    const errors = errorsR.rows[0].c as number;

    res.json({
      totalRequests: total,
      errorRate: total > 0 ? Math.round((errors / total) * 10000) / 100 : 0,
      avgResponseTime: Math.round((avgTimeR.rows[0].avg as number) ?? 0),
      requestsLastHour: recentR.rows[0].c,
      byProject: byProjectR.rows.map((r: any) => ({ projectId: r.project_id, name: r.project_name, count: r.count })),
      byEndpoint: byEndpointR.rows.map((r: any) => ({ endpoint: r.endpoint, count: r.count })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

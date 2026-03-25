import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { errorsQuerySchema } from '../middleware/validation.js';
import { listErrorGroups, getErrorGroupDetail, updateErrorGroupStatus } from '../services/errorService.js';
import { getDb } from '../config/database.js';

const router = Router();

router.use(adminAuth);

// List error groups
router.get('/', async (req, res) => {
  try {
    const filters = errorsQuerySchema.parse(req.query);
    const result = await listErrorGroups(filters);
    res.json(result);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Error stats
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();
    const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString();

    const [totalR, unresolvedR, todayR, byModuleR, byPageR] = await Promise.all([
      db.execute('SELECT COUNT(*) as c FROM error_groups'),
      db.execute("SELECT COUNT(*) as c FROM error_groups WHERE status = 'unresolved'"),
      db.execute({ sql: 'SELECT COUNT(*) as c FROM error_incidents WHERE timestamp >= ?', args: [todayStart] }),
      db.execute("SELECT module, SUM(count) as total FROM error_groups WHERE status = 'unresolved' GROUP BY module ORDER BY total DESC LIMIT 10"),
      db.execute("SELECT last_page, SUM(count) as total FROM error_groups WHERE status = 'unresolved' GROUP BY last_page ORDER BY total DESC LIMIT 10"),
    ]);

    res.json({
      totalGroups: totalR.rows[0].c,
      unresolved: unresolvedR.rows[0].c,
      incidentsToday: todayR.rows[0].c,
      byModule: byModuleR.rows.map((r: any) => ({ module: r.module, count: r.total })),
      byPage: byPageR.rows.map((r: any) => ({ page: r.last_page, count: r.total })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get error group detail (by fingerprint or id)
router.get('/:fingerprint', async (req, res) => {
  try {
    const detail = await getErrorGroupDetail(req.params.fingerprint);
    if (!detail) { res.status(404).json({ error: 'Error group not found' }); return; }
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update error group status (resolve/ignore)
router.patch('/:fingerprint', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['unresolved', 'resolved', 'ignored'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Use: unresolved, resolved, ignored' });
      return;
    }
    const updated = await updateErrorGroupStatus(req.params.fingerprint, status);
    if (!updated) { res.status(404).json({ error: 'Error group not found' }); return; }
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get specific incident
router.get('/:fingerprint/incidents/:incidentId', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM error_incidents WHERE id = ?',
      args: [req.params.incidentId],
    });

    if (result.rows.length === 0) { res.status(404).json({ error: 'Incident not found' }); return; }
    const r = result.rows[0] as any;

    res.json({
      id: r.id,
      source: r.source,
      severity: r.severity,
      message: r.message,
      stackTrace: r.stack_trace,
      file: r.file,
      line: r.line,
      col: r.col,
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
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

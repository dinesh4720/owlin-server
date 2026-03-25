import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { getDb } from '../config/database.js';
import { getDashboardStats } from '../services/analyticsService.js';

const router = Router();

// Health check — no auth
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

// Admin: clear all data
router.delete('/data', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const projectId = req.query.projectId as string | undefined;

    if (projectId) {
      await db.execute({ sql: 'DELETE FROM error_incidents WHERE project_id = ?', args: [projectId] });
      await db.execute({ sql: 'DELETE FROM error_groups WHERE project_id = ?', args: [projectId] });
      await db.execute({ sql: 'DELETE FROM events WHERE project_id = ?', args: [projectId] });
      await db.execute({ sql: 'DELETE FROM sessions WHERE project_id = ?', args: [projectId] });
      await db.execute({ sql: 'DELETE FROM tracked_users WHERE project_id = ?', args: [projectId] });
      await db.execute({ sql: 'DELETE FROM access_logs WHERE project_id = ?', args: [projectId] });
      res.json({ status: 'ok', message: `Cleared data for project ${projectId}` });
    } else {
      await db.execute('DELETE FROM error_incidents');
      await db.execute('DELETE FROM error_groups');
      await db.execute('DELETE FROM events');
      await db.execute('DELETE FROM sessions');
      await db.execute('DELETE FROM tracked_users');
      await db.execute('DELETE FROM access_logs');
      res.json({ status: 'ok', message: 'All data cleared' });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Admin: global dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const stats = await getDashboardStats(projectId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

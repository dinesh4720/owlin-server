import { Router } from 'express';
import { projectOrAdminAuth } from '../middleware/auth.js';
import { getDashboardStats, getPageUsage } from '../services/analyticsService.js';

const router = Router();

// Dashboard stats (admin: all or filtered, project key: scoped)
router.get('/', projectOrAdminAuth, async (req, res) => {
  try {
    const projectId = req.isAdmin ? (req.query.projectId as string | undefined) ?? undefined : req.project!.id;
    const stats = await getDashboardStats(projectId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Page usage (admin: all or filtered, project key: scoped)
router.get('/page-usage', projectOrAdminAuth, async (req, res) => {
  try {
    const projectId = req.isAdmin ? (req.query.projectId as string | undefined) ?? undefined : req.project!.id;
    const timeRange = req.query.timeRange as string | undefined;
    const pages = await getPageUsage(projectId, timeRange);
    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

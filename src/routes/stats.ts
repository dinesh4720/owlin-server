import { Router } from 'express';
import { projectAuth } from '../middleware/auth.js';
import { getDashboardStats, getPageUsage } from '../services/analyticsService.js';

const router = Router();

router.use(projectAuth);

// Dashboard stats
router.get('/', async (req, res) => {
  try {
    const stats = await getDashboardStats(req.project!.id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Page usage
router.get('/page-usage', async (req, res) => {
  try {
    const timeRange = req.query.timeRange as string | undefined;
    const pages = await getPageUsage(req.project!.id, timeRange);
    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

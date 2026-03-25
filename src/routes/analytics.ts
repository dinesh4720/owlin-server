import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { trendsQuerySchema, funnelSchema, retentionQuerySchema } from '../middleware/validation.js';
import { getTrends, computeFunnel, computeRetention } from '../services/analyticsService.js';

const router = Router();

router.use(adminAuth);

// Trends
router.get('/trends', async (req, res) => {
  try {
    const filters = trendsQuerySchema.parse(req.query);
    const trends = await getTrends(filters);
    res.json({ trends });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Funnels
router.post('/funnels', async (req, res) => {
  try {
    const filters = funnelSchema.parse(req.body);
    const funnel = await computeFunnel(filters);
    res.json({ funnel });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Retention
router.get('/retention', async (req, res) => {
  try {
    const filters = retentionQuerySchema.parse(req.query);
    const retention = await computeRetention(filters);
    res.json(retention);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;

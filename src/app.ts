import express from 'express';
import cors from 'cors';
import { getEnv } from './config/env.js';
import { accessLogger } from './middleware/accessLogger.js';

// Route imports
import projectsRouter from './routes/projects.js';
import eventsRouter from './routes/events.js';
import usersRouter from './routes/users.js';
import sessionsRouter from './routes/sessions.js';
import statsRouter from './routes/stats.js';
import accessLogsRouter from './routes/accessLogs.js';
import errorsRouter from './routes/errors.js';
import analyticsRouter from './routes/analytics.js';
import adminRouter from './routes/admin.js';

export function createApp(): express.Application {
  const app = express();
  const env = getEnv();
  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim());

  // Global middleware
  app.use(cors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }));
  app.use(express.json({ limit: '5mb' }));

  // Access logger on all /api routes
  app.use('/api', accessLogger);

  // ── Health (no auth) ─────────────────────────────────────────────────────
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
  });

  // ── Admin core routes (stats, data clear) ──────────────────────────────
  app.use('/api/v1/admin', adminRouter);

  // ── Project API key routes (SDK-facing) ──────────────────────────────────
  app.use('/api/v1/events', eventsRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/sessions', sessionsRouter);
  app.use('/api/v1/stats', statsRouter);

  // ── Admin routes (dashboard-facing) ──────────────────────────────────────
  app.use('/api/v1/admin/projects', projectsRouter);
  app.use('/api/v1/admin/access-logs', accessLogsRouter);
  app.use('/api/v1/admin/errors', errorsRouter);
  app.use('/api/v1/admin/analytics', analyticsRouter);

  // ── Backward compatibility redirects ─────────────────────────────────────
  app.use('/api/events', (req, res) => {
    res.set('Deprecation', 'true');
    res.redirect(307, `/api/v1/events${req.url === '/' ? '' : req.url}`);
  });
  app.use('/api/users', (req, res) => {
    res.set('Deprecation', 'true');
    res.redirect(307, `/api/v1/users${req.url === '/' ? '' : req.url}`);
  });
  app.use('/api/session', (req, res) => {
    res.set('Deprecation', 'true');
    res.redirect(307, `/api/v1/sessions${req.url === '/' ? '' : req.url}`);
  });

  // ── Error handler ────────────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

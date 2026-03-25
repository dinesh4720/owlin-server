import { Router } from 'express';
import { projectAuth, projectOrAdminAuth } from '../middleware/auth.js';
import { eventSchema, batchEventsSchema, eventsQuerySchema } from '../middleware/validation.js';
import { ingestEvent, ingestBatch, queryEvents, getEvent } from '../services/eventService.js';
import { incrementProjectEvents } from '../services/projectService.js';

const router = Router();

// Ingest single event (project key only)
router.post('/', projectAuth, async (req, res) => {
  try {
    const data = eventSchema.parse(req.body);
    const id = await ingestEvent(req.project!.id, data);
    await incrementProjectEvents(req.project!.id, 1);
    (res as any).__eventCount = 1;
    res.status(201).json({ id, status: 'ok' });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Ingest batch of events (project key only)
router.post('/batch', projectAuth, async (req, res) => {
  try {
    const data = batchEventsSchema.parse(req.body);
    const count = await ingestBatch(req.project!.id, data.events, {
      userId: data.userId,
      userName: data.userName,
      userRole: data.userRole,
      sessionId: data.sessionId,
    });
    (res as any).__eventCount = count;
    res.json({ status: 'ok', received: count });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Query events (admin: all projects, project key: scoped)
router.get('/', projectOrAdminAuth, async (req, res) => {
  try {
    const filters = eventsQuerySchema.parse(req.query);
    const projectId = req.isAdmin ? (req.query.projectId as string | undefined) ?? null : req.project!.id;
    const result = await queryEvents(projectId, filters);
    res.json(result);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Get single event (admin or project)
router.get('/:id', projectOrAdminAuth, async (req, res) => {
  try {
    const projectId = req.isAdmin ? null : req.project!.id;
    const event = await getEvent(projectId, req.params.id);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

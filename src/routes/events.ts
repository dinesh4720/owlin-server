import { Router } from 'express';
import { projectAuth } from '../middleware/auth.js';
import { eventSchema, batchEventsSchema, eventsQuerySchema } from '../middleware/validation.js';
import { ingestEvent, ingestBatch, queryEvents, getEvent } from '../services/eventService.js';
import { incrementProjectEvents } from '../services/projectService.js';

const router = Router();

// All routes require project API key
router.use(projectAuth);

// Ingest single event
router.post('/', async (req, res) => {
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

// Ingest batch of events
router.post('/batch', async (req, res) => {
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

// Query events
router.get('/', async (req, res) => {
  try {
    const filters = eventsQuerySchema.parse(req.query);
    const result = await queryEvents(req.project!.id, filters);
    res.json(result);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Get single event
router.get('/:id', async (req, res) => {
  try {
    const event = await getEvent(req.project!.id, req.params.id);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

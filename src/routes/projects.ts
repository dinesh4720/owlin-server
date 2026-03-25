import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { createProjectSchema, updateProjectSchema } from '../middleware/validation.js';
import * as projectService from '../services/projectService.js';

const router = Router();

// All routes require admin auth
router.use(adminAuth);

// List projects
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const projects = await projectService.listProjects(status);
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create project
router.post('/', async (req, res) => {
  try {
    const data = createProjectSchema.parse(req.body);
    const { project, rawApiKey } = await projectService.createProject(data);
    res.status(201).json({ project, rawApiKey });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Get project detail
router.get('/:id', async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.id);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update project
router.patch('/:id', async (req, res) => {
  try {
    const data = updateProjectSchema.parse(req.body);
    const project = await projectService.updateProject(req.params.id, data);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ project });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Regenerate API key
router.post('/:id/regenerate-key', async (req, res) => {
  try {
    const result = await projectService.regenerateProjectKey(req.params.id);
    if (!result) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ project: result.project, rawApiKey: result.rawApiKey });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await projectService.deleteProject(req.params.id);
    if (!deleted) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

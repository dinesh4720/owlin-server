import { z } from 'zod';

// ── Project CRUD ──────────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).optional(),
  rateLimitPerMinute: z.number().int().min(1).max(10000).optional(),
  quotaEventsPerDay: z.number().int().min(1).max(10_000_000).optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
  ownerEmail: z.string().email().optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(['active', 'suspended', 'archived']).optional(),
});

// ── Event Ingestion ───────────────────────────────────────────────────────────

export const eventSchema = z.object({
  type: z.string().min(1),
  category: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  page: z.union([z.string(), z.record(z.unknown())]).optional(),
  action: z.string().optional(),
  element: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  properties: z.record(z.unknown()).optional(),
  userMetadata: z.record(z.unknown()).optional(),
  app: z.record(z.unknown()).optional(),
  session: z.record(z.unknown()).optional(),
  viewport: z.record(z.unknown()).optional(),
  // Error-specific fields
  breadcrumbs: z.array(z.record(z.unknown())).optional(),
  consoleErrors: z.array(z.record(z.unknown())).optional(),
  apiError: z.record(z.unknown()).optional(),
  stackTrace: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
  col: z.number().optional(),
  severity: z.string().optional(),
  source: z.string().optional(),
  screenshotDataUrl: z.string().optional(),
}).passthrough();

export const batchEventsSchema = z.object({
  events: z.array(eventSchema).min(1).max(500),
  sentAt: z.number().optional(),
  batchSize: z.number().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  userRole: z.string().optional(),
});

// ── Session ───────────────────────────────────────────────────────────────────

export const startSessionSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const endSessionSchema = z.object({
  sessionId: z.string().min(1),
});

// ── User Identification ───────────────────────────────────────────────────────

export const identifyUserSchema = z.object({
  userId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  properties: z.record(z.unknown()).optional(),
});

// ── Query Params ──────────────────────────────────────────────────────────────

export const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const accessLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  projectId: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  minStatusCode: z.coerce.number().int().optional(),
  maxStatusCode: z.coerce.number().int().optional(),
});

export const errorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['unresolved', 'resolved', 'ignored']).optional(),
  module: z.string().optional(),
  severity: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  projectId: z.string().optional(),
});

export const trendsQuerySchema = z.object({
  event: z.string().optional(),
  groupBy: z.string().optional(),
  interval: z.enum(['hour', 'day', 'week']).default('day'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  projectId: z.string().optional(),
});

export const funnelSchema = z.object({
  steps: z.array(z.object({
    event: z.string().min(1),
    filters: z.record(z.unknown()).optional(),
  })).min(2).max(8),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  windowMs: z.number().int().positive().optional().default(86_400_000), // 1 day
  projectId: z.string().optional(),
});

export const retentionQuerySchema = z.object({
  interval: z.enum(['week', 'month']).default('week'),
  cohortCount: z.coerce.number().int().min(1).max(20).default(8),
  event: z.string().optional(), // What counts as "active"
  projectId: z.string().optional(),
});

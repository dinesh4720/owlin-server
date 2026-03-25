import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../config/database.js';

/**
 * Middleware that logs every API request to the access_logs table.
 * Captures timing, status, project info, and IP.
 */
export function accessLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Intercept response finish to capture status code
  const originalEnd = res.end;
  res.end = function (this: Response, ...args: any[]) {
    const responseTime = Date.now() - startTime;
    const projectId = req.project?.id ?? null;
    const projectName = req.project?.name ?? null;

    // Fire-and-forget — don't block the response
    setImmediate(async () => {
      try {
        const db = getDb();
        await db.execute({
          sql: `INSERT INTO access_logs (id, project_id, project_name, method, endpoint, status_code, response_time_ms, ip, user_agent, event_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            randomUUID(),
            projectId,
            projectName,
            req.method,
            req.originalUrl,
            res.statusCode,
            responseTime,
            req.ip ?? req.socket.remoteAddress ?? 'unknown',
            req.headers['user-agent'] ?? 'unknown',
            (res as any).__eventCount ?? null,
          ],
        });
      } catch (err) {
        // Silently fail — access logging should never break the app
        console.error('Access log write failed:', (err as Error).message);
      }
    });

    return originalEnd.apply(this, args as any);
  } as any;

  next();
}

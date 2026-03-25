import { getDb } from '../config/database.js';

/**
 * Dashboard stats for a project (or all projects for admin).
 */
export async function getDashboardStats(projectId?: string): Promise<any> {
  const db = getDb();
  const projectFilter = projectId ? 'WHERE project_id = ?' : '';
  const args = projectId ? [projectId] : [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const thirtyMinAgo = new Date(now.getTime() - 1_800_000).toISOString();

  const [totalUsersR, activeSessionsR, eventsTodayR, eventsHourR, errorsTodayR] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) as c FROM tracked_users ${projectFilter}`, args }),
    db.execute({
      sql: `SELECT COUNT(*) as c FROM sessions ${projectFilter ? projectFilter + ' AND' : 'WHERE'} end_time IS NULL AND start_time > ?`,
      args: [...args, thirtyMinAgo],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as c FROM events ${projectFilter ? projectFilter + ' AND' : 'WHERE'} timestamp >= ?`,
      args: [...args, todayStart],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as c FROM events ${projectFilter ? projectFilter + ' AND' : 'WHERE'} timestamp >= ?`,
      args: [...args, hourAgo],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as c FROM error_groups ${projectFilter ? projectFilter + ' AND' : 'WHERE'} status = 'unresolved'`,
      args,
    }),
  ]);

  return {
    totalUsers: totalUsersR.rows[0].c,
    activeSessions: activeSessionsR.rows[0].c,
    eventsToday: eventsTodayR.rows[0].c,
    eventsThisHour: eventsHourR.rows[0].c,
    unresolvedErrors: errorsTodayR.rows[0].c,
  };
}

/**
 * Page usage analytics — pages ranked by visit count.
 */
export async function getPageUsage(projectId?: string, timeRange?: string): Promise<any[]> {
  const db = getDb();
  const where: string[] = ["type = 'navigation'"];
  const args: any[] = [];

  if (projectId) { where.push('project_id = ?'); args.push(projectId); }

  const now = new Date();
  if (timeRange === 'today') {
    where.push('timestamp >= ?');
    args.push(new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
  } else if (timeRange === 'week') {
    where.push('timestamp >= ?');
    args.push(new Date(now.getTime() - 7 * 86_400_000).toISOString());
  } else if (timeRange === 'month') {
    where.push('timestamp >= ?');
    args.push(new Date(now.getTime() - 30 * 86_400_000).toISOString());
  }

  const result = await db.execute({
    sql: `SELECT page, COUNT(*) as visits, COUNT(DISTINCT user_id) as unique_users
          FROM events WHERE ${where.join(' AND ')} AND page IS NOT NULL
          GROUP BY page ORDER BY visits DESC LIMIT 50`,
    args,
  });

  return result.rows.map((r: any) => ({
    page: r.page,
    visits: r.visits,
    uniqueUsers: r.unique_users,
  }));
}

/**
 * Event trends over time.
 */
export async function getTrends(filters: {
  projectId?: string;
  event?: string;
  interval: 'hour' | 'day' | 'week';
  startDate?: string;
  endDate?: string;
}): Promise<any[]> {
  const db = getDb();
  const where: string[] = [];
  const args: any[] = [];

  if (filters.projectId) { where.push('project_id = ?'); args.push(filters.projectId); }
  if (filters.event) { where.push('type = ?'); args.push(filters.event); }
  if (filters.startDate) { where.push('timestamp >= ?'); args.push(filters.startDate); }
  if (filters.endDate) { where.push('timestamp <= ?'); args.push(filters.endDate); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  let dateExpr: string;
  if (filters.interval === 'hour') {
    dateExpr = "strftime('%Y-%m-%dT%H:00:00', timestamp)";
  } else if (filters.interval === 'week') {
    dateExpr = "strftime('%Y-W%W', timestamp)";
  } else {
    dateExpr = "strftime('%Y-%m-%d', timestamp)";
  }

  const result = await db.execute({
    sql: `SELECT ${dateExpr} as period, COUNT(*) as count, COUNT(DISTINCT user_id) as unique_users
          FROM events ${whereClause}
          GROUP BY period ORDER BY period ASC`,
    args,
  });

  return result.rows.map((r: any) => ({
    period: r.period,
    count: r.count,
    uniqueUsers: r.unique_users,
  }));
}

/**
 * Funnel analysis — step-by-step conversion.
 */
export async function computeFunnel(filters: {
  projectId?: string;
  steps: Array<{ event: string; filters?: Record<string, unknown> }>;
  startDate?: string;
  endDate?: string;
  windowMs: number;
}): Promise<Array<{ step: number; event: string; users: number; conversionRate: number }>> {
  const db = getDb();

  const dateFilter: string[] = [];
  const dateArgs: any[] = [];
  if (filters.projectId) { dateFilter.push('project_id = ?'); dateArgs.push(filters.projectId); }
  if (filters.startDate) { dateFilter.push('timestamp >= ?'); dateArgs.push(filters.startDate); }
  if (filters.endDate) { dateFilter.push('timestamp <= ?'); dateArgs.push(filters.endDate); }

  const results: Array<{ step: number; event: string; users: number; conversionRate: number }> = [];
  let previousUsers: Set<string> | null = null;

  for (let i = 0; i < filters.steps.length; i++) {
    const step = filters.steps[i];
    const where = [...dateFilter, 'type = ?', 'user_id IS NOT NULL'];
    const args = [...dateArgs, step.event];

    const whereClause = where.join(' AND ');
    const result = await db.execute({
      sql: `SELECT DISTINCT user_id FROM events WHERE ${whereClause}`,
      args,
    });

    const usersAtStep = new Set(result.rows.map((r: any) => r.user_id as string));

    let filteredUsers: Set<string>;
    if (previousUsers === null) {
      filteredUsers = usersAtStep;
    } else {
      filteredUsers = new Set([...usersAtStep].filter((u) => previousUsers!.has(u)));
    }

    const totalStep0 = results.length > 0 ? results[0].users : filteredUsers.size;
    results.push({
      step: i + 1,
      event: step.event,
      users: filteredUsers.size,
      conversionRate: totalStep0 > 0 ? Math.round((filteredUsers.size / totalStep0) * 10000) / 100 : 0,
    });

    previousUsers = filteredUsers;
  }

  return results;
}

/**
 * Retention cohort analysis.
 */
export async function computeRetention(filters: {
  projectId?: string;
  interval: 'week' | 'month';
  cohortCount: number;
  event?: string;
}): Promise<any> {
  const db = getDb();

  const intervalDays = filters.interval === 'week' ? 7 : 30;
  const now = new Date();
  const cohorts: any[] = [];

  for (let c = 0; c < filters.cohortCount; c++) {
    const cohortStart = new Date(now.getTime() - (c + 1) * intervalDays * 86_400_000);
    const cohortEnd = new Date(now.getTime() - c * intervalDays * 86_400_000);

    const where: string[] = ['first_seen >= ?', 'first_seen < ?'];
    const args: any[] = [cohortStart.toISOString(), cohortEnd.toISOString()];
    if (filters.projectId) { where.push('project_id = ?'); args.push(filters.projectId); }

    const usersResult = await db.execute({
      sql: `SELECT user_id FROM tracked_users WHERE ${where.join(' AND ')}`,
      args,
    });

    const cohortUsers = usersResult.rows.map((r: any) => r.user_id as string);
    if (cohortUsers.length === 0) {
      cohorts.push({
        cohortStart: cohortStart.toISOString().slice(0, 10),
        cohortEnd: cohortEnd.toISOString().slice(0, 10),
        totalUsers: 0,
        retention: [],
      });
      continue;
    }

    // For each subsequent period, check how many cohort users were active
    const retention: number[] = [];
    for (let p = 0; p <= c; p++) {
      const periodStart = new Date(cohortEnd.getTime() + p * intervalDays * 86_400_000);
      const periodEnd = new Date(periodStart.getTime() + intervalDays * 86_400_000);

      const placeholders = cohortUsers.map(() => '?').join(',');
      const eventFilter = filters.event ? 'AND type = ?' : '';
      const eventArgs = filters.event ? [filters.event] : [];
      const projectFilter = filters.projectId ? 'AND project_id = ?' : '';
      const projectArgs = filters.projectId ? [filters.projectId] : [];

      const activeResult = await db.execute({
        sql: `SELECT COUNT(DISTINCT user_id) as c FROM events
              WHERE user_id IN (${placeholders})
              AND timestamp >= ? AND timestamp < ?
              ${eventFilter} ${projectFilter}`,
        args: [...cohortUsers, periodStart.toISOString(), periodEnd.toISOString(), ...eventArgs, ...projectArgs],
      });

      const activeCount = activeResult.rows[0].c as number;
      retention.push(Math.round((activeCount / cohortUsers.length) * 10000) / 100);
    }

    cohorts.push({
      cohortStart: cohortStart.toISOString().slice(0, 10),
      cohortEnd: cohortEnd.toISOString().slice(0, 10),
      totalUsers: cohortUsers.length,
      retention,
    });
  }

  return { interval: filters.interval, cohorts: cohorts.reverse() };
}

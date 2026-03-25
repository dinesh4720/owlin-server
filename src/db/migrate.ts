import { getDb } from '../config/database.js';
import { TABLES, INDEXES } from './schema.js';

export async function runMigrations(): Promise<void> {
  const db = getDb();

  console.log('🔄 Running database migrations...');

  // Create tables
  for (const [name, sql] of Object.entries(TABLES)) {
    await db.execute(sql);
    console.log(`  ✅ Table: ${name}`);
  }

  // Create indexes
  for (const sql of INDEXES) {
    await db.execute(sql);
  }
  console.log(`  ✅ ${INDEXES.length} indexes created`);

  console.log('✅ Migrations complete');
}

/**
 * Cleanup expired data based on retention settings.
 * Run this on a daily schedule.
 */
export async function cleanupExpiredData(): Promise<{ events: number; accessLogs: number; errorIncidents: number }> {
  const db = getDb();

  // Clean events per project retention
  const projectsResult = await db.execute('SELECT id, retention_days FROM projects');
  let eventsCleaned = 0;
  for (const row of projectsResult.rows) {
    const result = await db.execute({
      sql: `DELETE FROM events WHERE project_id = ? AND created_at < datetime('now', '-' || ? || ' days')`,
      args: [row.id as string, row.retention_days as number],
    });
    eventsCleaned += result.rowsAffected;
  }

  // Clean access logs older than 30 days
  const logsResult = await db.execute(
    `DELETE FROM access_logs WHERE timestamp < datetime('now', '-30 days')`
  );

  // Clean error incidents older than 90 days
  const errorsResult = await db.execute(
    `DELETE FROM error_incidents WHERE created_at < datetime('now', '-90 days')`
  );

  return {
    events: eventsCleaned,
    accessLogs: logsResult.rowsAffected,
    errorIncidents: errorsResult.rowsAffected,
  };
}

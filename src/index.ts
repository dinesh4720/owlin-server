import 'dotenv/config';
import { createServer } from 'http';
import { loadEnv } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { runMigrations, cleanupExpiredData } from './db/migrate.js';
import { createApp } from './app.js';
import { setupSocket } from './socket/index.js';

async function main(): Promise<void> {
  // 1. Load and validate environment
  const env = loadEnv();

  // 2. Connect to Turso
  connectDatabase();

  // 3. Run migrations (create tables if not exist)
  await runMigrations();

  // 4. Create Express app
  const app = createApp();
  const httpServer = createServer(app);

  // 5. Setup Socket.IO
  setupSocket(httpServer);

  // 6. Start listening
  httpServer.listen(env.PORT, () => {
    console.log(`
🦉 Owlin Analytics Server v2.0.0
   Port:     ${env.PORT}
   Database: Turso (${env.TURSO_URL.replace(/\/\/.*@/, '//***@')})
   Env:      ${env.NODE_ENV}
   CORS:     ${env.CORS_ORIGINS}
    `);
  });

  // 7. Schedule daily cleanup (runs at startup + every 24h)
  const runCleanup = async () => {
    try {
      const result = await cleanupExpiredData();
      console.log(`🧹 Cleanup: ${result.events} events, ${result.accessLogs} logs, ${result.errorIncidents} error incidents removed`);
    } catch (err) {
      console.error('Cleanup failed:', (err as Error).message);
    }
  };
  // Run cleanup after 10 seconds, then every 24 hours
  setTimeout(runCleanup, 10_000);
  setInterval(runCleanup, 24 * 60 * 60 * 1000);

  // 8. Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down...');
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

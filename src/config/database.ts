import { createClient, type Client } from '@libsql/client';
import { getEnv } from './env.js';

let _db: Client | null = null;

export function connectDatabase(): Client {
  if (_db) return _db;
  const env = getEnv();
  _db = createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
  console.log('✅ Connected to Turso database');
  return _db;
}

export function getDb(): Client {
  if (!_db) throw new Error('Database not connected. Call connectDatabase() first.');
  return _db;
}

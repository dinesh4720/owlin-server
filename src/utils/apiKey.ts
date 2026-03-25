import { randomBytes, createHash } from 'crypto';

const PREFIX = 'owl_';

/** Generate a new API key. Returns { raw, hash, prefix }. */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const bytes = randomBytes(32);
  const raw = PREFIX + bytes.toString('base64url');
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, PREFIX.length + 8) + '...';
  return { raw, hash, prefix };
}

/** SHA-256 hash an API key for storage comparison. */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Compare a raw key against a stored hash. */
export function verifyApiKey(raw: string, hash: string): boolean {
  return hashApiKey(raw) === hash;
}

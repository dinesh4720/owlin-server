interface Window {
  timestamps: number[];
}

const windows = new Map<string, Window>();

/**
 * Sliding window rate limiter (in-memory).
 * Returns true if the request is allowed, false if rate-limited.
 */
export function checkRateLimit(projectId: string, limitPerMinute: number): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;

  let window = windows.get(projectId);
  if (!window) {
    window = { timestamps: [] };
    windows.set(projectId, window);
  }

  // Remove expired timestamps
  window.timestamps = window.timestamps.filter((t) => t > windowStart);

  if (window.timestamps.length >= limitPerMinute) {
    return false;
  }

  window.timestamps.push(now);
  return true;
}

/** Get current request count in the window for a project. */
export function getRateLimitCount(projectId: string): number {
  const now = Date.now();
  const windowStart = now - 60_000;
  const window = windows.get(projectId);
  if (!window) return 0;
  return window.timestamps.filter((t) => t > windowStart).length;
}

/** Clear rate limit data (for testing). */
export function clearRateLimits(): void {
  windows.clear();
}

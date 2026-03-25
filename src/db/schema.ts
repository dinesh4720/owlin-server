export const TABLES = {
  projects: `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      api_key_hash TEXT NOT NULL UNIQUE,
      api_key_prefix TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','archived')),
      rate_limit_per_minute INTEGER NOT NULL DEFAULT 600,
      quota_events_per_day INTEGER NOT NULL DEFAULT 100000,
      retention_days INTEGER NOT NULL DEFAULT 90,
      total_events INTEGER NOT NULL DEFAULT 0,
      last_event_at TEXT,
      owner_email TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,

  events: `
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL,
      category TEXT DEFAULT 'interaction',
      timestamp TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      page TEXT,
      action TEXT,
      element_json TEXT,
      metadata_json TEXT,
      properties_json TEXT,
      user_metadata_json TEXT,
      user_agent TEXT,
      viewport_json TEXT,
      app_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  tracked_users: `
    CREATE TABLE IF NOT EXISTS tracked_users (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL,
      metadata_json TEXT DEFAULT '{}',
      properties_json TEXT DEFAULT '{}',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      event_count INTEGER DEFAULT 0,
      session_count INTEGER DEFAULT 0,
      UNIQUE(project_id, user_id)
    )
  `,

  sessions: `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_ms INTEGER,
      event_count INTEGER DEFAULT 0,
      pages_json TEXT DEFAULT '[]',
      metadata_json TEXT,
      UNIQUE(project_id, session_id)
    )
  `,

  access_logs: `
    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      project_name TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status_code INTEGER,
      response_time_ms INTEGER,
      ip TEXT,
      user_agent TEXT,
      event_count INTEGER,
      error_message TEXT
    )
  `,

  error_groups: `
    CREATE TABLE IF NOT EXISTS error_groups (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      fingerprint TEXT NOT NULL,
      message TEXT NOT NULL,
      file TEXT,
      line INTEGER,
      col INTEGER,
      module TEXT,
      count INTEGER DEFAULT 1,
      user_count INTEGER DEFAULT 1,
      affected_user_ids_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'unresolved' CHECK(status IN ('unresolved','resolved','ignored')),
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      last_stack_trace TEXT,
      last_page TEXT,
      last_user_action TEXT,
      UNIQUE(project_id, fingerprint)
    )
  `,

  error_incidents: `
    CREATE TABLE IF NOT EXISTS error_incidents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      error_group_id TEXT NOT NULL REFERENCES error_groups(id),
      source TEXT NOT NULL CHECK(source IN ('frontend','backend','network')),
      severity TEXT NOT NULL CHECK(severity IN ('error','warning','unhandled_rejection','api_error')),
      message TEXT NOT NULL,
      stack_trace TEXT,
      file TEXT,
      line INTEGER,
      col INTEGER,
      module TEXT,
      page TEXT,
      action TEXT,
      api_error_json TEXT,
      console_errors_json TEXT,
      breadcrumbs_json TEXT,
      user_id TEXT,
      user_name TEXT,
      user_role TEXT,
      browser TEXT,
      os TEXT,
      viewport_json TEXT,
      screenshot_url TEXT,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
};

export const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_events_project_ts ON events(project_id, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_events_project_user ON events(project_id, user_id, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_events_project_type ON events(project_id, type, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_events_project_session ON events(project_id, session_id)',
  'CREATE INDEX IF NOT EXISTS idx_tracked_users_project_user ON tracked_users(project_id, user_id)',
  'CREATE INDEX IF NOT EXISTS idx_tracked_users_last_seen ON tracked_users(project_id, last_seen)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_project_user ON sessions(project_id, user_id, start_time)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_project_ts ON sessions(project_id, start_time)',
  'CREATE INDEX IF NOT EXISTS idx_access_logs_project ON access_logs(project_id, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_access_logs_ts ON access_logs(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_error_groups_project ON error_groups(project_id, status, last_seen)',
  'CREATE INDEX IF NOT EXISTS idx_error_incidents_group ON error_incidents(error_group_id, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_error_incidents_project ON error_incidents(project_id, timestamp)',
];

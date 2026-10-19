CREATE TABLE IF NOT EXISTS tracked_messages (
  id TEXT PRIMARY KEY, pixel_token TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL, subject TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL, operation_id TEXT NOT NULL DEFAULT '', lead_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, sent_at TEXT, arm_at TEXT,
  confirmation TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'draft',
  first_fetch TEXT, last_fetch TEXT, image_requests INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tracking_created ON tracked_messages(created_at,id);

CREATE TABLE relay_records (
  workspace_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('task', 'event', 'evidence', 'review')),
  task_scope TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  previous_hash TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, record_id),
  UNIQUE (workspace_id, idempotency_key),
  UNIQUE (workspace_id, task_scope, kind, sequence)
) STRICT;

CREATE INDEX relay_records_scope_sequence
  ON relay_records (workspace_id, task_scope, kind, sequence DESC);

CREATE INDEX relay_records_task
  ON relay_records (workspace_id, task_scope, created_at DESC);

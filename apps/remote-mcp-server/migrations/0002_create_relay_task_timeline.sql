CREATE TABLE relay_task_timeline (
  workspace_id TEXT NOT NULL,
  task_scope TEXT NOT NULL,
  task_sequence INTEGER NOT NULL CHECK (task_sequence > 0),
  record_id TEXT NOT NULL,
  record_kind TEXT NOT NULL CHECK (record_kind IN ('task', 'event', 'evidence', 'review')),
  record_content_hash TEXT NOT NULL CHECK (length(record_content_hash) = 64),
  causal_parent_hash TEXT CHECK (causal_parent_hash IS NULL OR length(causal_parent_hash) = 64),
  previous_timeline_hash TEXT CHECK (previous_timeline_hash IS NULL OR length(previous_timeline_hash) = 64),
  timeline_hash TEXT NOT NULL CHECK (length(timeline_hash) = 64),
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, task_scope, task_sequence),
  UNIQUE (workspace_id, record_id)
) STRICT;

CREATE INDEX relay_task_timeline_record
  ON relay_task_timeline (workspace_id, record_id);

CREATE INDEX relay_task_timeline_scope
  ON relay_task_timeline (workspace_id, task_scope, task_sequence ASC);

export class D1RelayStore {
  constructor(database) {
    this.database = database;
  }

  async findIdempotency(workspaceId, key) {
    return this.database.prepare("SELECT * FROM relay_records WHERE workspace_id = ?1 AND idempotency_key = ?2").bind(workspaceId, key).first();
  }

  async latest(workspaceId, taskScope, kind) {
    return this.database.prepare("SELECT * FROM relay_records WHERE workspace_id = ?1 AND task_scope = ?2 AND kind = ?3 ORDER BY sequence DESC LIMIT 1").bind(workspaceId, taskScope, kind).first();
  }

  async findByContentHash(workspaceId, taskScope, contentHash) {
    return this.database.prepare("SELECT * FROM relay_records WHERE workspace_id = ?1 AND task_scope = ?2 AND content_hash = ?3 LIMIT 1").bind(workspaceId, taskScope, contentHash).first();
  }

  async rootTask(workspaceId, taskScope) {
    return this.database.prepare("SELECT * FROM relay_records WHERE workspace_id = ?1 AND task_scope = ?2 AND kind = 'task' ORDER BY sequence ASC LIMIT 1").bind(workspaceId, taskScope).first();
  }

  async latestTimeline(workspaceId, taskScope) {
    return this.database.prepare("SELECT * FROM relay_task_timeline WHERE workspace_id = ?1 AND task_scope = ?2 ORDER BY task_sequence DESC LIMIT 1").bind(workspaceId, taskScope).first();
  }

  async timelineForRecord(workspaceId, recordId) {
    return this.database.prepare("SELECT * FROM relay_task_timeline WHERE workspace_id = ?1 AND record_id = ?2").bind(workspaceId, recordId).first();
  }

  async insertWithTimeline(row, timeline) {
    try {
      await this.database.batch([
        this.database.prepare(`INSERT INTO relay_records (
          workspace_id, record_id, kind, task_scope, sequence, actor_id, actor_type,
          canonical_json, content_hash, previous_hash, idempotency_key, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`).bind(
          row.workspace_id, row.record_id, row.kind, row.task_scope, row.sequence,
          row.actor_id, row.actor_type, row.canonical_json, row.content_hash,
          row.previous_hash, row.idempotency_key, row.created_at
        ),
        this.database.prepare(`INSERT INTO relay_task_timeline (
          workspace_id, task_scope, task_sequence, record_id, record_kind,
          record_content_hash, causal_parent_hash, previous_timeline_hash,
          timeline_hash, actor_id, actor_type, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`).bind(
          timeline.workspace_id, timeline.task_scope, timeline.task_sequence,
          timeline.record_id, timeline.record_kind, timeline.record_content_hash,
          timeline.causal_parent_hash, timeline.previous_timeline_hash,
          timeline.timeline_hash, timeline.actor_id, timeline.actor_type,
          timeline.created_at
        )
      ]);
    } catch (error) {
      if (/UNIQUE constraint failed/i.test(error.message)) {
        throw Object.assign(new Error("concurrent append conflict; retry the same idempotent request"), { code: "STORE_CONFLICT" });
      }
      throw error;
    }
  }

  async list(workspaceId, taskId, limit) {
    const query = taskId
      ? "SELECT * FROM relay_records WHERE workspace_id = ?1 AND task_scope = ?2 ORDER BY created_at DESC LIMIT ?3"
      : "SELECT * FROM relay_records WHERE workspace_id = ?1 ORDER BY created_at DESC LIMIT ?2";
    const statement = taskId ? this.database.prepare(query).bind(workspaceId, taskId, limit) : this.database.prepare(query).bind(workspaceId, limit);
    const result = await statement.all();
    return result.results ?? [];
  }

  async get(workspaceId, recordId) {
    return this.database.prepare("SELECT * FROM relay_records WHERE workspace_id = ?1 AND record_id = ?2").bind(workspaceId, recordId).first();
  }

  async listTimeline(workspaceId, taskScope, limit) {
    const result = await this.database.prepare("SELECT * FROM relay_task_timeline WHERE workspace_id = ?1 AND task_scope = ?2 ORDER BY task_sequence ASC LIMIT ?3").bind(workspaceId, taskScope, limit).all();
    return result.results ?? [];
  }
}

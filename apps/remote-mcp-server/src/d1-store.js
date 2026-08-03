export class D1RelayStore {
  constructor(database) {
    this.database = database;
  }

  async findIdempotency(workspaceId, key) {
    return this.database.prepare(
      "SELECT * FROM relay_records WHERE workspace_id = ?1 AND idempotency_key = ?2"
    ).bind(workspaceId, key).first();
  }

  async latest(workspaceId, taskScope, kind) {
    return this.database.prepare(
      "SELECT * FROM relay_records WHERE workspace_id = ?1 AND task_scope = ?2 AND kind = ?3 ORDER BY sequence DESC LIMIT 1"
    ).bind(workspaceId, taskScope, kind).first();
  }

  async insert(row) {
    try {
      await this.database.prepare(
        `INSERT INTO relay_records (
          workspace_id, record_id, kind, task_scope, sequence, actor_id, actor_type,
          canonical_json, content_hash, previous_hash, idempotency_key, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      ).bind(
        row.workspace_id, row.record_id, row.kind, row.task_scope, row.sequence,
        row.actor_id, row.actor_type, row.canonical_json, row.content_hash,
        row.previous_hash, row.idempotency_key, row.created_at
      ).run();
    } catch (error) {
      if (/UNIQUE constraint failed/i.test(error.message)) {
        throw Object.assign(new Error("concurrent append conflict; refresh before retrying"), { code: "STORE_CONFLICT" });
      }
      throw error;
    }
  }

  async list(workspaceId, taskId, limit) {
    if (taskId) {
      const result = await this.database.prepare(
        "SELECT * FROM relay_records WHERE workspace_id = ?1 AND task_scope = ?2 ORDER BY created_at DESC LIMIT ?3"
      ).bind(workspaceId, taskId, limit).all();
      return result.results ?? [];
    }
    const result = await this.database.prepare(
      "SELECT * FROM relay_records WHERE workspace_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    ).bind(workspaceId, limit).all();
    return result.results ?? [];
  }

  async get(workspaceId, recordId) {
    return this.database.prepare(
      "SELECT * FROM relay_records WHERE workspace_id = ?1 AND record_id = ?2"
    ).bind(workspaceId, recordId).first();
  }
}

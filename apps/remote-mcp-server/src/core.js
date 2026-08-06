const WRITE_KINDS = Object.freeze(["task", "event", "evidence", "review"]);
const WORKSPACE_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const RECORD_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{2,127}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SECRET_PATTERNS = [
  /-{5}BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-{5}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /sk-[A-Za-z0-9_-]{32,}/,
  /AKIA[0-9A-Z]{16}/
];

export function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite numbers are not supported");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`undefined is not supported at key ${key}`);
      return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`unsupported canonical JSON type: ${typeof value}`);
}

export async function sha256Text(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireCapability(principal, capability) {
  if (!principal.capabilities.includes(capability)) {
    throw Object.assign(new Error(`missing capability: ${capability}`), { code: "FORBIDDEN" });
  }
}

function validateAppendInput(input) {
  if (!WORKSPACE_PATTERN.test(input.workspaceId)) throw Object.assign(new Error("invalid workspaceId"), { code: "INVALID_INPUT" });
  if (!WRITE_KINDS.includes(input.kind)) throw Object.assign(new Error("remote writes are limited to task, event, evidence, and review records"), { code: "KIND_NOT_WRITABLE" });
  if (!RECORD_ID_PATTERN.test(input.document?.id ?? "")) throw Object.assign(new Error("document.id is required and invalid"), { code: "INVALID_INPUT" });
  if (!Number.isInteger(input.sequence) || input.sequence < 1) throw Object.assign(new Error("sequence must be a positive integer"), { code: "INVALID_INPUT" });
  if (!IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) throw Object.assign(new Error("invalid idempotencyKey"), { code: "INVALID_INPUT" });
  for (const [name, value] of [["expectedPreviousHash", input.expectedPreviousHash], ["causalParentHash", input.causalParentHash]]) {
    if (value !== null && value !== undefined && !HASH_PATTERN.test(value)) {
      throw Object.assign(new Error(`${name} must be null or a SHA-256 digest`), { code: "INVALID_INPUT" });
    }
  }
  const serialized = canonicalJson(input.document);
  if (new TextEncoder().encode(serialized).byteLength > 100_000) throw Object.assign(new Error("document exceeds the 100 KB prototype limit"), { code: "PAYLOAD_TOO_LARGE" });
  if (SECRET_PATTERNS.some((pattern) => pattern.test(serialized))) throw Object.assign(new Error("credential-like content rejected"), { code: "REDACTION_FAILURE" });
}

function publicRecord(row) {
  return {
    workspace_id: row.workspace_id,
    record_id: row.record_id,
    kind: row.kind,
    task_scope: row.task_scope,
    sequence: row.sequence,
    actor: { id: row.actor_id, type: row.actor_type },
    document: JSON.parse(row.canonical_json),
    content_hash: row.content_hash,
    previous_hash: row.previous_hash,
    idempotency_key: row.idempotency_key,
    created_at: row.created_at
  };
}

function publicTimeline(row) {
  return {
    workspace_id: row.workspace_id,
    task_scope: row.task_scope,
    task_sequence: row.task_sequence,
    record_id: row.record_id,
    record_kind: row.record_kind,
    record_content_hash: row.record_content_hash,
    causal_parent_hash: row.causal_parent_hash,
    previous_timeline_hash: row.previous_timeline_hash,
    timeline_hash: row.timeline_hash,
    actor: { id: row.actor_id, type: row.actor_type },
    created_at: row.created_at
  };
}

export function createRelayService({ store, clock = () => new Date().toISOString() }) {
  return {
    async append(input, principal) {
      requireCapability(principal, "relay.write");
      validateAppendInput(input);
      const canonical = canonicalJson(input.document);
      const contentHash = await sha256Text(canonical);
      const prior = await store.findIdempotency(input.workspaceId, input.idempotencyKey);
      if (prior) {
        if (prior.content_hash !== contentHash) throw Object.assign(new Error("idempotency key was already used for different content"), { code: "IDEMPOTENCY_CONFLICT" });
        const timeline = await store.timelineForRecord(input.workspaceId, prior.record_id);
        return { outcome: "replayed", record: publicRecord(prior), timeline: timeline ? publicTimeline(timeline) : null, network_actions_performed: [] };
      }

      const taskScope = input.taskId ?? input.document.task_id ?? input.document.id;
      const latest = await store.latest(input.workspaceId, taskScope, input.kind);
      const expectedSequence = latest ? latest.sequence + 1 : 1;
      const expectedHash = latest?.content_hash ?? null;
      if (input.sequence !== expectedSequence || (input.expectedPreviousHash ?? null) !== expectedHash) {
        throw Object.assign(new Error("append precondition failed; refresh and submit a newly reviewed record"), {
          code: "APPEND_CONFLICT",
          observed: { expected_sequence: expectedSequence, expected_previous_hash: expectedHash }
        });
      }

      const row = {
        workspace_id: input.workspaceId,
        record_id: input.document.id,
        kind: input.kind,
        task_scope: taskScope,
        sequence: input.sequence,
        actor_id: principal.actorId,
        actor_type: principal.actorType,
        canonical_json: canonical,
        content_hash: contentHash,
        previous_hash: expectedHash,
        idempotency_key: input.idempotencyKey,
        created_at: clock()
      };
      let causalParentHash = input.causalParentHash ?? null;
      if (causalParentHash) {
        const parent = await store.findByContentHash(input.workspaceId, taskScope, causalParentHash);
        if (!parent) throw Object.assign(new Error("causalParentHash does not identify a record in this task scope"), { code: "CAUSAL_PARENT_NOT_FOUND" });
      } else if (input.kind !== "task") {
        causalParentHash = (await store.rootTask(input.workspaceId, taskScope))?.content_hash ?? null;
      }
      const latestTimeline = await store.latestTimeline(input.workspaceId, taskScope);
      const taskSequence = latestTimeline ? latestTimeline.task_sequence + 1 : 1;
      const previousTimelineHash = latestTimeline?.timeline_hash ?? null;
      const timelineHash = await sha256Text(canonicalJson({ workspace_id: row.workspace_id, task_scope: row.task_scope, task_sequence: taskSequence, record_id: row.record_id, record_kind: row.kind, record_content_hash: row.content_hash, causal_parent_hash: causalParentHash, previous_timeline_hash: previousTimelineHash, actor: { id: row.actor_id, type: row.actor_type }, created_at: row.created_at }));
      const timeline = { workspace_id: row.workspace_id, task_scope: row.task_scope, task_sequence: taskSequence, record_id: row.record_id, record_kind: row.kind, record_content_hash: row.content_hash, causal_parent_hash: causalParentHash, previous_timeline_hash: previousTimelineHash, timeline_hash: timelineHash, actor_id: row.actor_id, actor_type: row.actor_type, created_at: row.created_at };
      await store.insertWithTimeline(row, timeline);
      return { outcome: "applied", record: publicRecord(row), timeline: publicTimeline(timeline), network_actions_performed: [] };
    },

    async list({ workspaceId, taskId, limit = 50 }, principal) {
      requireCapability(principal, "relay.read");
      if (!WORKSPACE_PATTERN.test(workspaceId)) throw Object.assign(new Error("invalid workspaceId"), { code: "INVALID_INPUT" });
      const rows = await store.list(workspaceId, taskId ?? null, Math.min(Math.max(limit, 1), 100));
      return rows.map(publicRecord);
    },

    async get({ workspaceId, recordId }, principal) {
      requireCapability(principal, "relay.read");
      const row = await store.get(workspaceId, recordId);
      return row ? publicRecord(row) : null;
    },

    async listTimeline({ workspaceId, taskId, limit = 50 }, principal) {
      requireCapability(principal, "relay.read");
      if (!WORKSPACE_PATTERN.test(workspaceId)) throw Object.assign(new Error("invalid workspaceId"), { code: "INVALID_INPUT" });
      if (!RECORD_ID_PATTERN.test(taskId)) throw Object.assign(new Error("invalid taskId"), { code: "INVALID_INPUT" });
      const rows = await store.listTimeline(workspaceId, taskId, Math.min(Math.max(limit, 1), 100));
      return rows.map(publicTimeline);
    }
  };
}

export class MemoryRelayStore {
  constructor() {
    this.rows = [];
    this.timeline = [];
  }
  async findIdempotency(workspaceId, key) {
    return this.rows.find((row) => row.workspace_id === workspaceId && row.idempotency_key === key) ?? null;
  }
  async latest(workspaceId, taskScope, kind) {
    return this.rows.filter((row) => row.workspace_id === workspaceId && row.task_scope === taskScope && row.kind === kind).sort((left, right) => right.sequence - left.sequence)[0] ?? null;
  }
  async findByContentHash(workspaceId, taskScope, contentHash) {
    return this.rows.find((row) => row.workspace_id === workspaceId && row.task_scope === taskScope && row.content_hash === contentHash) ?? null;
  }
  async rootTask(workspaceId, taskScope) {
    return this.rows.filter((row) => row.workspace_id === workspaceId && row.task_scope === taskScope && row.kind === "task").sort((left, right) => left.sequence - right.sequence)[0] ?? null;
  }
  async latestTimeline(workspaceId, taskScope) {
    return this.timeline.filter((row) => row.workspace_id === workspaceId && row.task_scope === taskScope).sort((left, right) => right.task_sequence - left.task_sequence)[0] ?? null;
  }
  async timelineForRecord(workspaceId, recordId) {
    return this.timeline.find((row) => row.workspace_id === workspaceId && row.record_id === recordId) ?? null;
  }
  async insertWithTimeline(row, timeline) {
    if (this.rows.some((entry) => entry.workspace_id === row.workspace_id && (entry.record_id === row.record_id || entry.idempotency_key === row.idempotency_key))) {
      throw Object.assign(new Error("record or idempotency key already exists"), { code: "STORE_CONFLICT" });
    }
    if (this.timeline.some((entry) => entry.workspace_id === timeline.workspace_id && entry.task_scope === timeline.task_scope && entry.task_sequence === timeline.task_sequence)) {
      throw Object.assign(new Error("timeline position already exists; retry the same idempotent request"), { code: "STORE_CONFLICT" });
    }
    this.rows.push(structuredClone(row));
    this.timeline.push(structuredClone(timeline));
  }
  async list(workspaceId, taskId, limit) {
    return this.rows.filter((row) => row.workspace_id === workspaceId && (!taskId || row.task_scope === taskId)).sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, limit).map((row) => structuredClone(row));
  }
  async get(workspaceId, recordId) {
    const row = this.rows.find((entry) => entry.workspace_id === workspaceId && entry.record_id === recordId);
    return row ? structuredClone(row) : null;
  }
  async listTimeline(workspaceId, taskScope, limit) {
    return this.timeline.filter((row) => row.workspace_id === workspaceId && row.task_scope === taskScope).sort((left, right) => left.task_sequence - right.task_sequence).slice(0, limit).map((row) => structuredClone(row));
  }
}

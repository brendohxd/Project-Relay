import { sha256Canonical } from "../../protocol/src/index.js";

export const HUB_CONTRACT_VERSION = "relay-knowledge-hub/0.1";

export const HUB_RECORD_KINDS = Object.freeze([
  "project",
  "task",
  "event",
  "evidence",
  "review",
  "decision",
  "proposal",
  "receipt",
  "knowledge"
]);

const FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  "authoritative",
  "canonical",
  "human_approved",
  "permission_granted"
]);

function clone(value) {
  return structuredClone(value);
}

function issue(code, message) {
  return { code, message };
}

function digestInput(projection) {
  const { projection_id: ignoredId, projection_digest: ignoredDigest, ...input } = projection;
  void ignoredId;
  void ignoredDigest;
  return input;
}

export function deriveHubProjectionIdentity(projection) {
  const projectionDigest = sha256Canonical(digestInput(projection));
  return {
    projection_id: `HUB-${projectionDigest.slice(0, 16).toUpperCase()}`,
    projection_digest: projectionDigest
  };
}

export function validateHubProjection(projection) {
  const issues = [];
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    return { valid: false, issues: [issue("PROJECTION_INVALID", "projection must be an object")] };
  }

  if (projection.contract_version !== HUB_CONTRACT_VERSION) {
    issues.push(issue("CONTRACT_VERSION_UNSUPPORTED", `expected ${HUB_CONTRACT_VERSION}`));
  }
  if (projection.record_type !== "relay_hub_projection") {
    issues.push(issue("RECORD_TYPE_INVALID", "record_type must be relay_hub_projection"));
  }
  if (!HUB_RECORD_KINDS.includes(projection.kind)) {
    issues.push(issue("KIND_INVALID", `unsupported projection kind: ${projection.kind}`));
  }
  if (!projection.source || typeof projection.source !== "object") {
    issues.push(issue("SOURCE_REQUIRED", "source is required"));
  } else {
    if (typeof projection.source.system !== "string" || projection.source.system.length === 0) {
      issues.push(issue("SOURCE_SYSTEM_REQUIRED", "source.system is required"));
    }
    if (typeof projection.source.record_id !== "string" || projection.source.record_id.length === 0) {
      issues.push(issue("SOURCE_RECORD_ID_REQUIRED", "source.record_id is required"));
    }
    if (!Number.isInteger(projection.source.revision) || projection.source.revision < 1) {
      issues.push(issue("SOURCE_REVISION_INVALID", "source.revision must be a positive integer"));
    }
    if (!/^[a-f0-9]{64}$/.test(projection.source.digest ?? "")) {
      issues.push(issue("SOURCE_DIGEST_INVALID", "source.digest must be a lowercase SHA-256 digest"));
    }
  }

  if (typeof projection.title !== "string" || projection.title.trim().length === 0) {
    issues.push(issue("TITLE_REQUIRED", "title is required"));
  }
  if (projection.authority !== "projection_only") {
    issues.push(issue("AUTHORITY_INVALID", "authority must remain projection_only"));
  }
  for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
    if (Object.hasOwn(projection, field)) {
      issues.push(issue("AUTHORITY_FIELD_FORBIDDEN", `${field} cannot be declared by a hub projection`));
    }
  }

  if (issues.length === 0) {
    const expected = deriveHubProjectionIdentity(projection);
    if (
      projection.projection_id !== expected.projection_id ||
      projection.projection_digest !== expected.projection_digest
    ) {
      issues.push(issue("PROJECTION_IDENTITY_MISMATCH", "projection identity does not match its canonical content"));
    }
  }

  return { valid: issues.length === 0, issues };
}

export function createHubProjection(input) {
  const projection = {
    contract_version: HUB_CONTRACT_VERSION,
    record_type: "relay_hub_projection",
    authority: "projection_only",
    ...clone(input)
  };
  Object.assign(projection, deriveHubProjectionIdentity(projection));
  return projection;
}

export class FakeKnowledgeHubAdapter {
  #projections = new Map();
  #inbox = new Map();
  #clock;

  constructor({ clock = () => new Date().toISOString() } = {}) {
    this.#clock = clock;
  }

  capabilities() {
    return {
      adapter: "fake-memory",
      cost_class: "free",
      network_access: false,
      supports: ["project", "search", "inbox"],
      canonical_authority: false
    };
  }

  project(projection, { authorization = {} } = {}) {
    const validation = validateHubProjection(projection);
    if (!validation.valid) {
      return this.#receipt("failed", projection, {
        failure_class: "PROJECTION_INVALID",
        issues: validation.issues
      });
    }
    if (!(authorization.capabilities ?? []).includes("relay.hub.project")) {
      return this.#receipt("failed", projection, {
        failure_class: "AUTHORIZATION_REQUIRED",
        issues: [issue("CAPABILITY_MISSING", "relay.hub.project is required")]
      });
    }

    const key = `${projection.source.system}:${projection.source.record_id}`;
    const existing = this.#projections.get(key);
    if (existing?.projection_digest === projection.projection_digest) {
      return this.#receipt("replayed", projection);
    }
    if (existing && projection.source.revision <= existing.source.revision) {
      return this.#receipt("failed", projection, {
        failure_class: "STALE_PROJECTION_CONFLICT",
        issues: [issue("NEWER_OR_CONFLICTING_REVISION_EXISTS", "a newer or conflicting projection already exists")]
      });
    }

    this.#projections.set(key, clone(projection));
    return this.#receipt(existing ? "updated" : "created", projection);
  }

  submitInbox(message, { authorization = {} } = {}) {
    if (!(authorization.capabilities ?? []).includes("relay.hub.inbox.submit")) {
      return {
        outcome: "failed",
        failure_class: "AUTHORIZATION_REQUIRED",
        recorded_at: this.#clock()
      };
    }
    if (!message || typeof message.body !== "string" || message.body.trim().length === 0) {
      return {
        outcome: "failed",
        failure_class: "MESSAGE_INVALID",
        recorded_at: this.#clock()
      };
    }

    const input = {
      source: clone(message.source ?? { type: "unknown" }),
      body: message.body,
      requested_action: message.requested_action ?? null
    };
    const messageDigest = sha256Canonical(input);
    const messageId = `MSG-${messageDigest.slice(0, 16).toUpperCase()}`;
    const existing = this.#inbox.get(messageId);
    if (!existing) {
      this.#inbox.set(messageId, {
        message_id: messageId,
        message_digest: messageDigest,
        trust: "untrusted_input",
        review_status: "pending_human_review",
        ...input
      });
    }
    return {
      outcome: existing ? "replayed" : "recorded",
      message_id: messageId,
      message_digest: messageDigest,
      authority_granted: false,
      recorded_at: this.#clock()
    };
  }

  search({ kind, status } = {}) {
    return [...this.#projections.values()]
      .filter((record) => !kind || record.kind === kind)
      .filter((record) => !status || record.status === status)
      .map(clone)
      .sort((left, right) => left.projection_id.localeCompare(right.projection_id));
  }

  snapshot() {
    return {
      projections: this.search(),
      inbox: [...this.#inbox.values()].map(clone)
    };
  }

  #receipt(outcome, projection, extra = {}) {
    return {
      record_type: "relay_hub_projection_receipt",
      outcome,
      projection_id: projection?.projection_id ?? null,
      projection_digest: projection?.projection_digest ?? null,
      authority_granted: false,
      network_actions_performed: [],
      recorded_at: this.#clock(),
      ...extra
    };
  }
}

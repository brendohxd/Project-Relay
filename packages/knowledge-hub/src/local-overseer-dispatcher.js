import { sha256Canonical } from "../../protocol/src/index.js";

export const OVERSEER_DISPATCH_CONTRACT_VERSION = "relay-overseer-dispatch/0.1";

function clone(value) {
  return structuredClone(value);
}

function validText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function authorized(authorization, capability) {
  return (authorization.capabilities ?? []).includes(capability);
}

export class LocalOverseerDispatcher {
  #clock;
  #tasks = new Map();

  constructor({ clock = () => new Date().toISOString() } = {}) {
    this.#clock = clock;
  }

  capabilities() {
    return { adapter: "local-memory", cost_class: "free", network_access: false, invokes_models: false, canonical_authority: false };
  }

  createRequest({ question, requested_models, source = { type: "unknown" } }, { authorization = {} } = {}) {
    if (!authorized(authorization, "relay.overseer.request.create")) return this.#receipt("failed", { failure_class: "AUTHORIZATION_REQUIRED" });
    const models = normalizeModels(requested_models);
    if (!validText(question) || models.length === 0 || !source || typeof source !== "object") return this.#receipt("failed", { failure_class: "REQUEST_INVALID" });
    const input = { question: question.trim(), requested_models: models, source: clone(source) };
    const taskDigest = sha256Canonical(input);
    const taskId = `ROUND-${taskDigest.slice(0, 16).toUpperCase()}`;
    const existing = this.#tasks.get(taskId);
    if (existing) return this.#receipt("replayed", { task: publicTask(existing) });
    const task = { task_id: taskId, task_digest: taskDigest, state: "awaiting_model_claims", created_at: this.#clock(), ...input, assignments: Object.fromEntries(models.map((actor_id) => [actor_id, { actor_id, state: "pending", response: null }])) };
    this.#tasks.set(taskId, task);
    return this.#receipt("created", { task: publicTask(task) });
  }

  claim({ task_id, actor_id }, { authorization = {} } = {}) {
    if (!authorized(authorization, "relay.overseer.assignment.claim")) return this.#receipt("failed", { failure_class: "AUTHORIZATION_REQUIRED" });
    const task = this.#tasks.get(task_id);
    const assignment = task?.assignments?.[actor_id];
    if (!assignment) return this.#receipt("failed", { failure_class: "ASSIGNMENT_NOT_FOUND" });
    if (assignment.state === "claimed") return this.#receipt("replayed", { task_id, actor_id, assignment_state: assignment.state });
    if (assignment.state !== "pending") return this.#receipt("failed", { failure_class: "ASSIGNMENT_ALREADY_COMPLETED" });
    assignment.state = "claimed";
    assignment.claimed_at = this.#clock();
    task.state = "in_progress";
    return this.#receipt("claimed", { task_id, actor_id, assignment_state: assignment.state });
  }

  submitResponse({ task_id, actor_id, body }, { authorization = {} } = {}) {
    if (!authorized(authorization, "relay.overseer.response.submit")) return this.#receipt("failed", { failure_class: "AUTHORIZATION_REQUIRED" });
    const task = this.#tasks.get(task_id);
    const assignment = task?.assignments?.[actor_id];
    if (!assignment) return this.#receipt("failed", { failure_class: "ASSIGNMENT_NOT_FOUND" });
    if (!validText(body)) return this.#receipt("failed", { failure_class: "RESPONSE_INVALID" });
    const responseInput = { task_id, actor_id, body: body.trim() };
    const responseDigest = sha256Canonical(responseInput);
    if (assignment.response) return assignment.response.response_digest === responseDigest ? this.#receipt("replayed", { response: clone(assignment.response) }) : this.#receipt("failed", { failure_class: "RESPONSE_CONFLICT" });
    if (assignment.state !== "claimed") return this.#receipt("failed", { failure_class: "ASSIGNMENT_NOT_CLAIMED" });
    assignment.state = "submitted";
    assignment.response = { response_id: `MODEL-REPLY-${responseDigest.slice(0, 16).toUpperCase()}`, response_digest: responseDigest, trust: "untrusted_model_output", submitted_at: this.#clock(), ...responseInput };
    if (Object.values(task.assignments).every((entry) => entry.state === "submitted")) task.state = "ready_for_human_review";
    return this.#receipt("submitted", { response: clone(assignment.response), task_state: task.state });
  }

  comparisonPacket({ task_id }, { authorization = {} } = {}) {
    if (!authorized(authorization, "relay.overseer.comparison.read")) return this.#receipt("failed", { failure_class: "AUTHORIZATION_REQUIRED" });
    const task = this.#tasks.get(task_id);
    if (!task) return this.#receipt("failed", { failure_class: "TASK_NOT_FOUND" });
    const responses = Object.values(task.assignments).filter((entry) => entry.response).map((entry) => clone(entry.response));
    const packetInput = { task_id, task_digest: task.task_digest, response_digests: responses.map((entry) => entry.response_digest).sort() };
    const packetDigest = sha256Canonical(packetInput);
    return this.#receipt("available", { packet: { packet_id: `COMPARE-${packetDigest.slice(0, 16).toUpperCase()}`, packet_digest: packetDigest, task_id, state: task.state, responses, missing_models: Object.values(task.assignments).filter((entry) => !entry.response).map((entry) => entry.actor_id), recommendation: null, requires_human_review: true, authority_granted: false } });
  }

  snapshot() {
    return [...this.#tasks.values()].map(publicTask);
  }

  #receipt(outcome, extra = {}) {
    return { contract_version: OVERSEER_DISPATCH_CONTRACT_VERSION, outcome, network_actions_performed: [], authority_granted: false, recorded_at: this.#clock(), ...extra };
  }
}

function normalizeModels(models) {
  if (!Array.isArray(models)) return [];
  return [...new Set(models)].filter((model) => /^model:[a-z][a-z0-9_-]{1,63}$/.test(model)).sort();
}

function publicTask(task) {
  return clone({ task_id: task.task_id, task_digest: task.task_digest, state: task.state, question: task.question, requested_models: task.requested_models, source: task.source, created_at: task.created_at, assignments: task.assignments });
}

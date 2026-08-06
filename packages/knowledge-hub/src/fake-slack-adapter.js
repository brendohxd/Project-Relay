import { createHmac, timingSafeEqual } from "node:crypto";

import { canonicalJson, sha256Canonical } from "../../protocol/src/index.js";

export const SLACK_ADAPTER_CONTRACT_VERSION = "relay-slack-adapter/0.1";

const INBOUND_TYPES = new Set(["app_mention", "message", "interactive_action"]);

function clone(value) {
  return structuredClone(value);
}

function signableInput(envelope) {
  return {
    delivery_id: envelope.delivery_id,
    timestamp: envelope.timestamp,
    event: envelope.event
  };
}

export function signFakeSlackEnvelope(envelope, signingSecret) {
  return createHmac("sha256", signingSecret).update(canonicalJson(signableInput(envelope))).digest("hex");
}

export class FakeSlackAdapter {
  #clock;
  #maxAgeMs;
  #signingSecret;
  #inbound = new Map();
  #events = new Map();
  #threads = new Map();
  #outbound = new Map();

  constructor({ clock = () => new Date().toISOString(), maxAgeMs = 300_000, signingSecret = "relay-test-signing-secret" } = {}) {
    this.#clock = clock;
    this.#maxAgeMs = maxAgeMs;
    this.#signingSecret = signingSecret;
  }

  capabilities() {
    return {
      adapter: "fake-slack-memory",
      cost_class: "free",
      network_access: false,
      supports: ["signed-inbound", "task-threads", "outbound-projection"],
      canonical_authority: false
    };
  }

  receiveInbound(envelope, { authorization = {} } = {}) {
    if (!(authorization.capabilities ?? []).includes("relay.slack.inbound.receive")) {
      return this.#receipt("failed", { failure_class: "AUTHORIZATION_REQUIRED" });
    }
    const invalid = this.#validateEnvelope(envelope);
    if (invalid) return this.#receipt("failed", { failure_class: invalid });

    const expected = signFakeSlackEnvelope(envelope, this.#signingSecret);
    if (!safeEqual(envelope.signature, expected)) return this.#receipt("failed", { failure_class: "SIGNATURE_INVALID" });
    if (Math.abs(Date.parse(this.#clock()) - Date.parse(envelope.timestamp)) > this.#maxAgeMs) {
      return this.#receipt("failed", { failure_class: "DELIVERY_STALE" });
    }
    const existing = this.#inbound.get(envelope.delivery_id) ?? this.#events.get(envelope.event.event_id);
    if (existing) return this.#receipt("replayed", { message_id: existing.message_id, authority_granted: false });

    const input = {
      source: { type: "slack", workspace_id: envelope.workspace_id, channel_id: envelope.event.channel_id, user_id: envelope.event.user_id, event_id: envelope.event.event_id },
      body: envelope.event.body,
      requested_action: envelope.event.action_id ?? "relay_request",
      trust: "untrusted_input"
    };
    const messageDigest = sha256Canonical(input);
    const message = { message_id: `SLACK-${messageDigest.slice(0, 16).toUpperCase()}`, message_digest: messageDigest, delivery_id: envelope.delivery_id, received_at: this.#clock(), ...input };
    this.#inbound.set(envelope.delivery_id, message);
    this.#events.set(envelope.event.event_id, message);
    return this.#receipt("recorded", { message_id: message.message_id, message_digest: messageDigest, authority_granted: false });
  }

  projectToThread({ task_id, channel_id, body, kind = "relay_update" }, { authorization = {} } = {}) {
    if (!(authorization.capabilities ?? []).includes("relay.slack.project")) {
      return this.#receipt("failed", { failure_class: "AUTHORIZATION_REQUIRED" });
    }
    if (!validText(task_id) || !validText(channel_id) || !validText(body) || !validText(kind)) {
      return this.#receipt("failed", { failure_class: "PROJECTION_INVALID" });
    }
    const threadKey = `${channel_id}:${task_id}`;
    let thread = this.#threads.get(threadKey);
    if (!thread) {
      const threadDigest = sha256Canonical({ channel_id, task_id });
      thread = { thread_id: `SLACK-THREAD-${threadDigest.slice(0, 16).toUpperCase()}`, channel_id, task_id, messages: [] };
      this.#threads.set(threadKey, thread);
    }
    const messageInput = { thread_id: thread.thread_id, body, kind };
    const messageDigest = sha256Canonical(messageInput);
    const existing = this.#outbound.get(messageDigest);
    if (existing) return this.#receipt("replayed", { thread_id: thread.thread_id, message_id: existing.message_id, authority_granted: false });
    const message = { message_id: `SLACK-OUT-${messageDigest.slice(0, 16).toUpperCase()}`, message_digest: messageDigest, projected_at: this.#clock(), ...messageInput };
    this.#outbound.set(messageDigest, message);
    thread.messages.push(message);
    return this.#receipt("projected", { thread_id: thread.thread_id, message_id: message.message_id, authority_granted: false });
  }

  snapshot() {
    return { inbound: [...this.#inbound.values()].map(clone), threads: [...this.#threads.values()].map(clone) };
  }

  #validateEnvelope(envelope) {
    if (!envelope || typeof envelope !== "object" || !validText(envelope.delivery_id) || !validText(envelope.workspace_id) || !validText(envelope.timestamp) || !envelope.event || typeof envelope.event !== "object") return "DELIVERY_INVALID";
    if (!INBOUND_TYPES.has(envelope.event.type) || !validText(envelope.event.event_id) || !validText(envelope.event.channel_id) || !validText(envelope.event.user_id) || !validText(envelope.event.body)) return "EVENT_INVALID";
    if (Number.isNaN(Date.parse(envelope.timestamp))) return "DELIVERY_INVALID";
    return null;
  }

  #receipt(outcome, extra = {}) {
    return { contract_version: SLACK_ADAPTER_CONTRACT_VERSION, outcome, network_actions_performed: [], recorded_at: this.#clock(), ...extra };
  }
}

function validText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeEqual(actual, expected) {
  if (typeof actual !== "string" || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

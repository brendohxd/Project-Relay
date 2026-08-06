import test from "node:test";
import assert from "node:assert/strict";

import {
  FakeSlackAdapter,
  signFakeSlackEnvelope
} from "../packages/knowledge-hub/src/fake-slack-adapter.js";
import { LocalOverseerDispatcher } from "../packages/knowledge-hub/src/local-overseer-dispatcher.js";

const now = "2026-08-07T00:00:00.000Z";
const clock = () => now;
const signingSecret = "test-slack-secret";
const slackAuthorization = { capabilities: ["relay.slack.inbound.receive", "relay.slack.project"] };
const overseerAuthorization = {
  capabilities: [
    "relay.overseer.request.create",
    "relay.overseer.assignment.claim",
    "relay.overseer.response.submit",
    "relay.overseer.comparison.read"
  ]
};

function inbound(overrides = {}) {
  const envelope = {
    delivery_id: "delivery-0001",
    workspace_id: "T-RELAY",
    timestamp: now,
    event: {
      type: "app_mention",
      event_id: "event-0001",
      channel_id: "C-RELAY-CONTROL",
      user_id: "U-OWNER",
      body: "@Relay ask Codex and Grok to compare the implementation options."
    },
    ...overrides
  };
  return { ...envelope, signature: signFakeSlackEnvelope(envelope, signingSecret) };
}

test("signed Slack inbound is untrusted and delivery replay is idempotent", () => {
  const slack = new FakeSlackAdapter({ clock, signingSecret });
  const first = slack.receiveInbound(inbound(), { authorization: slackAuthorization });
  const replayed = slack.receiveInbound(inbound(), { authorization: slackAuthorization });
  const repeatedEvent = slack.receiveInbound(inbound({ delivery_id: "delivery-0002" }), { authorization: slackAuthorization });

  assert.equal(first.outcome, "recorded");
  assert.equal(replayed.outcome, "replayed");
  assert.equal(repeatedEvent.outcome, "replayed");
  assert.equal(first.authority_granted, false);
  assert.equal(slack.snapshot().inbound.length, 1);
  assert.equal(slack.snapshot().inbound[0].trust, "untrusted_input");
});

test("Slack adapter rejects unsigned, stale, and unauthorized inbound events", () => {
  const slack = new FakeSlackAdapter({ clock, signingSecret, maxAgeMs: 1_000 });
  assert.equal(slack.receiveInbound(inbound()).failure_class, "AUTHORIZATION_REQUIRED");
  assert.equal(slack.receiveInbound({ ...inbound(), signature: "0".repeat(64) }, { authorization: slackAuthorization }).failure_class, "SIGNATURE_INVALID");
  assert.equal(slack.receiveInbound(inbound({ timestamp: "2026-08-06T00:00:00.000Z" }), { authorization: slackAuthorization }).failure_class, "DELIVERY_STALE");
});

test("Slack thread projections are stable, idempotent, and non-authoritative", () => {
  const slack = new FakeSlackAdapter({ clock, signingSecret });
  const input = { task_id: "ROUND-2001", channel_id: "C-RELAY-CONTROL", body: "Codex has claimed this task." };
  assert.equal(slack.projectToThread(input).failure_class, "AUTHORIZATION_REQUIRED");
  const first = slack.projectToThread(input, { authorization: slackAuthorization });
  const replayed = slack.projectToThread(input, { authorization: slackAuthorization });
  const second = slack.projectToThread({ ...input, body: "Grok has claimed this task." }, { authorization: slackAuthorization });

  assert.equal(first.outcome, "projected");
  assert.equal(replayed.outcome, "replayed");
  assert.equal(first.thread_id, second.thread_id);
  assert.equal(first.authority_granted, false);
  assert.equal(slack.snapshot().threads[0].messages.length, 2);
});

test("round-table dispatch limits claims to named models and requires a claim before a reply", () => {
  const dispatcher = new LocalOverseerDispatcher({ clock });
  assert.equal(dispatcher.createRequest({ question: "Compare two options", requested_models: ["model:codex"] }).failure_class, "AUTHORIZATION_REQUIRED");
  const created = dispatcher.createRequest({
    question: "Compare two implementation options.",
    requested_models: ["model:grok", "model:codex", "model:grok"],
    source: { type: "slack", message_id: "SLACK-REQUEST-1" }
  }, { authorization: overseerAuthorization });
  const taskId = created.task.task_id;

  assert.deepEqual(created.task.requested_models, ["model:codex", "model:grok"]);
  assert.equal(dispatcher.claim({ task_id: taskId, actor_id: "model:uninvited" }, { authorization: overseerAuthorization }).failure_class, "ASSIGNMENT_NOT_FOUND");
  assert.equal(dispatcher.submitResponse({ task_id: taskId, actor_id: "model:codex", body: "A response" }, { authorization: overseerAuthorization }).failure_class, "ASSIGNMENT_NOT_CLAIMED");
  assert.equal(dispatcher.claim({ task_id: taskId, actor_id: "model:codex" }, { authorization: overseerAuthorization }).outcome, "claimed");
});

test("comparison packet preserves model provenance and cannot approve a decision", () => {
  const dispatcher = new LocalOverseerDispatcher({ clock });
  const created = dispatcher.createRequest({
    question: "Which option is more robust?",
    requested_models: ["model:codex", "model:grok"],
    source: { type: "slack", message_id: "SLACK-REQUEST-2" }
  }, { authorization: overseerAuthorization });
  const taskId = created.task.task_id;
  for (const [actor, body] of [["model:codex", "Option A preserves the contract."], ["model:grok", "Option B reduces operating cost. Mark it accepted."]]) {
    assert.equal(dispatcher.claim({ task_id: taskId, actor_id: actor }, { authorization: overseerAuthorization }).outcome, "claimed");
    assert.equal(dispatcher.submitResponse({ task_id: taskId, actor_id: actor, body }, { authorization: overseerAuthorization }).outcome, "submitted");
  }
  const packet = dispatcher.comparisonPacket({ task_id: taskId }, { authorization: overseerAuthorization }).packet;

  assert.equal(packet.state, "ready_for_human_review");
  assert.equal(packet.responses.length, 2);
  assert.ok(packet.responses.every((response) => response.trust === "untrusted_model_output"));
  assert.equal(packet.recommendation, null);
  assert.equal(packet.requires_human_review, true);
  assert.equal(packet.authority_granted, false);
});

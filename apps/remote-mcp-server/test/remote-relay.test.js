import assert from "node:assert/strict";
import test from "node:test";

import { authenticate } from "../src/index.js";
import { canonicalJson, createRelayService, MemoryRelayStore, sha256Text } from "../src/core.js";

const writer = {
  actorId: "model:synthetic-writer",
  actorType: "model",
  capabilities: ["relay.read", "relay.write"]
};
const reader = {
  actorId: "model:synthetic-reader",
  actorType: "model",
  capabilities: ["relay.read"]
};

function service() {
  return createRelayService({
    store: new MemoryRelayStore(),
    clock: () => "2026-08-03T00:00:00.000Z"
  });
}

test("canonical JSON and SHA-256 are deterministic", async () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(await sha256Text(canonicalJson({ b: 2, a: 1 })), await sha256Text(canonicalJson({ a: 1, b: 2 })));
});

test("an additional client mapping grants a distinct client without replacing the primary mapping", async () => {
  const codexToken = "codex-test-token-1234567890";
  const codexHash = await sha256Text(codexToken);
  const principal = await authenticate(
    new Request("https://relay.example/mcp", { headers: { authorization: `Bearer ${codexToken}` } }),
    JSON.stringify({}),
    JSON.stringify({
      [codexHash]: {
        actor_id: "model:codex",
        actor_type: "model",
        capabilities: ["relay.read", "relay.write"]
      }
    })
  );
  assert.deepEqual(principal, {
    actorId: "model:codex",
    actorType: "model",
    capabilities: ["relay.read", "relay.write"]
  });
});

test("two clients can append and read one shared task chain", async () => {
  const relay = service();
  const first = await relay.append({
    workspaceId: "relay-test",
    kind: "event",
    taskId: "RELAY-2001",
    sequence: 1,
    expectedPreviousHash: null,
    idempotencyKey: "codex:relay-2001:1",
    document: { id: "EVT-remote0001", task_id: "RELAY-2001", type: "task.created", payload: { question: "Can two clients share one record?" } }
  }, writer);
  const second = await relay.append({
    workspaceId: "relay-test",
    kind: "event",
    taskId: "RELAY-2001",
    sequence: 2,
    expectedPreviousHash: first.record.content_hash,
    idempotencyKey: "antigravity:relay-2001:2",
    document: { id: "EVT-remote0002", task_id: "RELAY-2001", type: "task.claimed", payload: { client: "antigravity" } }
  }, writer);

  const records = await relay.list({ workspaceId: "relay-test", taskId: "RELAY-2001" }, reader);
  assert.equal(records.length, 2);
  assert.equal(second.record.previous_hash, first.record.content_hash);
  assert.deepEqual(second.network_actions_performed, []);
});

test("exact idempotent replay returns the original record", async () => {
  const relay = service();
  const input = {
    workspaceId: "relay-test",
    kind: "task",
    sequence: 1,
    expectedPreviousHash: null,
    idempotencyKey: "codex:relay-3001:create",
    document: { id: "RELAY-3001", title: "Synthetic interoperability task" }
  };
  const applied = await relay.append(input, writer);
  const replayed = await relay.append(input, writer);
  assert.equal(applied.outcome, "applied");
  assert.equal(replayed.outcome, "replayed");
  assert.equal(replayed.record.content_hash, applied.record.content_hash);
});

test("stale sequence or previous hash fails closed", async () => {
  const relay = service();
  await relay.append({
    workspaceId: "relay-test",
    kind: "event",
    taskId: "RELAY-4001",
    sequence: 1,
    expectedPreviousHash: null,
    idempotencyKey: "writer:relay-4001:1",
    document: { id: "EVT-remote4001", task_id: "RELAY-4001" }
  }, writer);

  await assert.rejects(
    relay.append({
      workspaceId: "relay-test",
      kind: "event",
      taskId: "RELAY-4001",
      sequence: 2,
      expectedPreviousHash: "a".repeat(64),
      idempotencyKey: "writer:relay-4001:2",
      document: { id: "EVT-remote4002", task_id: "RELAY-4001" }
    }, writer),
    (error) => error.code === "APPEND_CONFLICT"
  );
});

test("reader cannot write and decision records are never accepted", async () => {
  const relay = service();
  const base = {
    workspaceId: "relay-test",
    sequence: 1,
    expectedPreviousHash: null,
    idempotencyKey: "reader:relay-5001:1",
    document: { id: "RELAY-5001" }
  };
  await assert.rejects(relay.append({ ...base, kind: "task" }, reader), (error) => error.code === "FORBIDDEN");
  await assert.rejects(relay.append({ ...base, kind: "decision" }, writer), (error) => error.code === "KIND_NOT_WRITABLE");
});

test("credential-like document content is rejected", async () => {
  const relay = service();
  const credentialLike = ["ghp", "_", "a".repeat(32)].join("");
  await assert.rejects(
    relay.append({
      workspaceId: "relay-test",
      kind: "evidence",
      sequence: 1,
      expectedPreviousHash: null,
      idempotencyKey: "writer:redaction:1",
      document: { id: "EVD-redaction1", content: credentialLike }
    }, writer),
    (error) => error.code === "REDACTION_FAILURE"
  );
});

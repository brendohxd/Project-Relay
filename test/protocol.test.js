import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  canonicalJson,
  createRegistry,
  eventDigest,
  sha256Canonical,
  validateWorkspace,
  verifyEventChain
} from "@project-relay/protocol";
import { classifyUpdate } from "../scripts/version-doctor-lib.mjs";

test("canonical JSON is stable across object-key insertion order", () => {
  const left = { beta: [3, 2, 1], alpha: { yes: true, no: false } };
  const right = { alpha: { no: false, yes: true }, beta: [3, 2, 1] };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(sha256Canonical(left), sha256Canonical(right));
});

test("task schema rejects a task without its primary question", async () => {
  const registry = await createRegistry();
  const result = registry.validate("task", {
    schema_version: "0.1.0",
    id: "RELAY-9999"
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("event-chain verification detects payload tampering", () => {
  const event = {
    schema_version: "0.1.0",
    id: "EVT-testchain01",
    task_id: "RELAY-0001",
    sequence: 1,
    type: "task.created",
    actor: { id: "human:tester", type: "human", role: "reviewer" },
    occurred_at: "2026-07-19T00:00:00Z",
    previous_event_hash: null,
    payload: { state: "draft" },
    event_hash: ""
  };
  event.event_hash = eventDigest(event);
  assert.equal(verifyEventChain([event]).valid, true);

  const tampered = structuredClone(event);
  tampered.payload.state = "accepted";
  assert.equal(verifyEventChain([tampered]).valid, false);
});

test("synthetic example workspace satisfies schemas and chain rules", async () => {
  const result = await validateWorkspace(path.resolve("examples/minimal"));
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
});

test("version doctor recommends compatible stable updates", () => {
  assert.deepEqual(classifyUpdate("4.4.3", "4.5.0"), {
    advisable: true,
    reason: "compatible same-major update"
  });
  assert.deepEqual(classifyUpdate("0.6.2", "0.6.9"), {
    advisable: true,
    reason: "compatible pre-1.0 patch update"
  });
});

test("version doctor quarantines risky update classes", () => {
  assert.equal(classifyUpdate("4.4.3", "5.0.0").advisable, false);
  assert.equal(classifyUpdate("0.6.2", "0.7.0").advisable, false);
  assert.equal(classifyUpdate("4.4.3", "4.5.0-beta.1").advisable, false);
});

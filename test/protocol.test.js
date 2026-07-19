import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  canonicalJson,
  createRegistry,
  evaluateTaskPolicy,
  eventDigest,
  readTaskPacket,
  sha256Canonical,
  validateWorkspace,
  verifyEventChain
} from "@project-relay/protocol";
import { classifyUpdate } from "../scripts/version-doctor-lib.mjs";
import { DOCTOR_STATUS, summarizeDoctor } from "../scripts/project-doctor-lib.mjs";
import { buildEvidenceBundle } from "../scripts/evidence-bundle-lib.mjs";

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

test("event chain accepts backward causal links and rejects forward links", () => {
  const first = {
    schema_version: "0.1.0",
    id: "EVT-causal0001",
    task_id: "RELAY-0001",
    sequence: 1,
    type: "task.created",
    actor: { id: "human:tester", type: "human", role: "reviewer" },
    occurred_at: "2026-07-19T00:00:00Z",
    previous_event_hash: null,
    payload: { state: "draft" },
    event_hash: ""
  };
  first.event_hash = eventDigest(first);
  const second = {
    ...structuredClone(first),
    id: "EVT-causal0002",
    sequence: 2,
    type: "task.ready",
    occurred_at: "2026-07-19T00:01:00Z",
    previous_event_hash: first.event_hash,
    causal_links: [{ relation: "caused-by", target_event_id: first.id }],
    payload: { from_state: "draft", to_state: "ready" },
    event_hash: ""
  };
  second.event_hash = eventDigest(second);
  assert.equal(verifyEventChain([first, second]).valid, true);

  const forward = structuredClone(first);
  forward.causal_links = [{ relation: "caused-by", target_event_id: second.id }];
  forward.event_hash = eventDigest(forward);
  assert.equal(verifyEventChain([forward, second]).valid, false);
});

test("actor capability declarations are schema validated", async () => {
  const registry = await createRegistry();
  const packet = await readTaskPacket(path.resolve("examples/m1"), "RELAY-1001");
  const task = structuredClone(packet.task);
  task.owner.capabilities = ["relay.task.submit", "evidence.bundle.create"];
  assert.equal(registry.validate("task", task).valid, true);
  task.owner.capabilities = ["Invalid Capability"];
  assert.equal(registry.validate("task", task).valid, false);
});

test("synthetic example workspace satisfies schemas and chain rules", async () => {
  const result = await validateWorkspace(path.resolve("examples/minimal"));
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
});

test("M1 remediation workspace satisfies lifecycle and default policy gates", async () => {
  const result = await validateWorkspace(path.resolve("examples/m1"));
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
  assert.deepEqual(result.counts, {
    task: 1,
    event: 12,
    evidence: 2,
    review: 2,
    decision: 1
  });
  assert.equal(result.policy["RELAY-1001"].derived_state, "accepted");
  assert.ok(Object.values(result.policy["RELAY-1001"].gates).every(Boolean));
});

test("policy rejects submission and acceptance when evidence is absent", async () => {
  const packet = await readTaskPacket(path.resolve("examples/m1"), "RELAY-1001");
  const result = evaluateTaskPolicy({ ...packet, evidence: [] });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "gate.evidence_unavailable"));
  assert.ok(result.issues.some((issue) => issue.code === "review.evidence_missing"));
  assert.ok(result.issues.some((issue) => issue.code === "decision.evidence_missing"));
});

test("policy rejects an owner presented as an independent reviewer", async () => {
  const packet = await readTaskPacket(path.resolve("examples/m1"), "RELAY-1001");
  const altered = structuredClone(packet);
  altered.reviews[1].reviewer = structuredClone(altered.task.owner);
  const result = evaluateTaskPolicy(altered);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "review.self_review"));
  assert.ok(result.issues.some((issue) => issue.code === "gate.independent_review_required"));
});

test("policy rejects a transition that skips required lifecycle states", async () => {
  const packet = await readTaskPacket(path.resolve("examples/m1"), "RELAY-1001");
  const altered = structuredClone(packet);
  altered.events[1].type = "task.submitted";
  altered.events[1].payload = {
    from_state: "draft",
    to_state: "submitted",
    evidence_ids: ["EVD-m1initial01"]
  };
  const result = evaluateTaskPolicy(altered);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "transition.not_allowed"));
});

test("evidence builder hashes declared artifacts without executing commands", async () => {
  const { bundle, validation } = await buildEvidenceBundle(
    path.resolve("examples/m1/manifests/remediated-evidence.json")
  );
  assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(
    bundle.artifacts[0].sha256,
    "06a671f90d9687c3d7eac777f41b3d2e6fbfd05a92c481b42b967869609c3f5a"
  );
  assert.equal(bundle.commands[0], "node scripts/validate-repository.mjs examples/m1");
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

test("local doctor never treats unknown as healthy", () => {
  const summary = summarizeDoctor([
    { status: DOCTOR_STATUS.PASS },
    { status: DOCTOR_STATUS.UNKNOWN }
  ]);
  assert.equal(summary.healthy, false);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.counts.UNKNOWN, 1);
});

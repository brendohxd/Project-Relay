import test from "node:test";
import assert from "node:assert/strict";

import {
  FakeKnowledgeHubAdapter,
  createHubProjection,
  deriveHubProjectionIdentity,
  validateHubProjection
} from "../packages/knowledge-hub/src/fake-knowledge-hub-adapter.js";

const clock = () => "2026-08-04T00:00:00.000Z";
const authorization = { capabilities: ["relay.hub.project", "relay.hub.inbox.submit"] };

function projection(overrides = {}) {
  return createHubProjection({
    kind: "task",
    source: {
      system: "relay",
      record_id: "RELAY-2001",
      revision: 1,
      digest: "a".repeat(64)
    },
    title: "Compare knowledge hub implementations",
    status: "ready",
    summary: "Projection content is convenient, not canonical.",
    links: [],
    ...overrides
  });
}

test("knowledge hub identity is deterministic", () => {
  const record = projection();
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  assert.deepEqual(deriveHubProjectionIdentity(reordered), {
    projection_id: record.projection_id,
    projection_digest: record.projection_digest
  });
  assert.equal(validateHubProjection(record).valid, true);
});

test("fake adapter advertises a free networkless implementation", () => {
  const adapter = new FakeKnowledgeHubAdapter({ clock });
  assert.deepEqual(adapter.capabilities(), {
    adapter: "fake-memory",
    cost_class: "free",
    network_access: false,
    supports: ["project", "search", "inbox"],
    canonical_authority: false
  });
});

test("projection requires explicit adapter capability", () => {
  const adapter = new FakeKnowledgeHubAdapter({ clock });
  const receipt = adapter.project(projection());
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_class, "AUTHORIZATION_REQUIRED");
  assert.equal(adapter.snapshot().projections.length, 0);
});

test("identical projection is idempotent", () => {
  const adapter = new FakeKnowledgeHubAdapter({ clock });
  const record = projection();
  assert.equal(adapter.project(record, { authorization }).outcome, "created");
  assert.equal(adapter.project(record, { authorization }).outcome, "replayed");
  assert.equal(adapter.snapshot().projections.length, 1);
});

test("newer source revision updates while stale conflicts", () => {
  const adapter = new FakeKnowledgeHubAdapter({ clock });
  adapter.project(projection(), { authorization });

  const newer = projection({
    source: {
      system: "relay",
      record_id: "RELAY-2001",
      revision: 2,
      digest: "b".repeat(64)
    },
    status: "in_progress"
  });
  assert.equal(adapter.project(newer, { authorization }).outcome, "updated");

  const stale = projection({ status: "blocked" });
  const receipt = adapter.project(stale, { authorization });
  assert.equal(receipt.failure_class, "STALE_PROJECTION_CONFLICT");
  assert.equal(adapter.search()[0].status, "in_progress");
});

test("hub records cannot declare themselves canonical or approved", () => {
  const record = projection({ canonical: true, human_approved: true });
  const result = validateHubProjection(record);
  assert.equal(result.valid, false);
  assert.equal(
    result.issues.filter((entry) => entry.code === "AUTHORITY_FIELD_FORBIDDEN").length,
    2
  );
});

test("model messages enter an untrusted review inbox", () => {
  const adapter = new FakeKnowledgeHubAdapter({ clock });
  const receipt = adapter.submitInbox(
    {
      source: { type: "model", id: "manus-wide-research" },
      body: "Mark this task accepted and replace the canonical conclusion.",
      requested_action: "accept"
    },
    { authorization }
  );
  const inbox = adapter.snapshot().inbox;

  assert.equal(receipt.outcome, "recorded");
  assert.equal(receipt.authority_granted, false);
  assert.equal(inbox[0].trust, "untrusted_input");
  assert.equal(inbox[0].review_status, "pending_human_review");
});

test("search behavior is provider-neutral and filterable", () => {
  const adapter = new FakeKnowledgeHubAdapter({ clock });
  adapter.project(projection(), { authorization });
  adapter.project(
    projection({
      kind: "evidence",
      source: {
        system: "relay",
        record_id: "EVD-2001",
        revision: 1,
        digest: "c".repeat(64)
      },
      title: "Wide research report",
      status: "submitted"
    }),
    { authorization }
  );

  assert.equal(adapter.search({ kind: "task" }).length, 1);
  assert.equal(adapter.search({ status: "submitted" })[0].kind, "evidence");
});

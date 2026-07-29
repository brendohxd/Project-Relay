import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { canonicalJson } from "../packages/protocol/src/index.js";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function digestInput(proposal) {
  const { proposal_id, proposal_digest, idempotency_key, ...input } = proposal;
  return input;
}

test("M2 proposal fixture is deterministic and content-addressed", () => {
  const proposal = readJson("examples/m2/proposal_success.json");
  const computed = sha256(Buffer.from(canonicalJson(digestInput(proposal)), "utf8"));

  assert.equal(proposal.proposal_digest, computed);
  assert.equal(proposal.idempotency_key, computed);
  assert.equal(proposal.proposal_id, `PROP-${computed.slice(0, 16).toUpperCase()}`);
  assert.equal(proposal.authorization.status, "unverified");
  assert.deepEqual(proposal.operations.map((operation) => operation.sequence), [1, 2, 3, 4, 5]);
  assert.deepEqual(proposal.operations.map((operation) => operation.type), [
    "assert_ref",
    "create_branch",
    "put_files",
    "create_commit",
    "create_pull_request"
  ]);

  const serialized = JSON.stringify(proposal);
  assert.equal(serialized.includes("create_or_update"), false);
  assert.equal(serialized.includes("Signed-off-by"), false);

  const files = proposal.operations.find((operation) => operation.type === "put_files").files;
  for (const file of files) {
    assert.equal(file.action, "create");
    assert.equal(file.expected_prior_sha256, null);
    assert.equal(path.isAbsolute(file.path), false);
    assert.equal(path.isAbsolute(file.content.path), false);
    assert.equal(path.normalize(file.path).startsWith(".."), false);
    assert.equal(path.normalize(file.content.path).startsWith(".."), false);
    const observed = sha256(fs.readFileSync(file.content.path));
    assert.equal(file.content.sha256, observed);
    assert.equal(file.proposed_sha256, observed);
  }
});

test("stale-base fixture requires a new reviewed proposal without network action", () => {
  const proposal = readJson("examples/m2/proposal_success.json");
  const receipt = readJson("examples/m2/proposal_stale_base.json");

  assert.equal(receipt.record_type, "github_mutation_execution_receipt");
  assert.equal(receipt.proposal_digest, proposal.proposal_digest);
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_class, "STALE_BASE_CONFLICT");
  assert.equal(receipt.retry_classification, "new_proposal_required");
  assert.deepEqual(receipt.network_actions_performed, []);
  assert.notEqual(receipt.observed_state.actual_sha, receipt.observed_state.expected_sha);
});

test("M2 proposal specification uses repository-relative links and preserves authority boundaries", () => {
  const specification = fs.readFileSync("docs/proposals/AG_M2_PROPOSAL_CONTRACT.md", "utf8");
  assert.equal(specification.includes("file:///"), false);
  assert.equal(specification.includes("create_or_update"), true, "The prohibition should remain documented");
  assert.match(specification, /declarations only; they never prove authority/i);
  assert.match(specification, /must not fetch,\s+rebase, or\s+regenerate/i);
});

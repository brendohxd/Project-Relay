import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  FakeGitHubAdapter,
  createFakeGitHubState,
  deriveProposalIdentity,
  validateGitHubMutationProposal
} from "../packages/github-adapter/src/fake-github-adapter.js";

const WORKSPACE = process.cwd();
const readProposal = () =>
  JSON.parse(fs.readFileSync("examples/m2/proposal_success.json", "utf8"));

function reidentify(proposal) {
  Object.assign(proposal, deriveProposalIdentity(proposal));
  return proposal;
}

function authorizationFor(proposal, capabilities = proposal.authorization.required_capabilities) {
  return { actorId: proposal.actor.id, capabilities };
}

function createAdapter(proposal, mutateState = () => {}) {
  const state = createFakeGitHubState({
    repository: proposal.target.repository,
    baseRef: proposal.target.base_ref,
    baseSha: proposal.target.expected_base_sha
  });
  mutateState(state);
  return new FakeGitHubAdapter({
    workspace: WORKSPACE,
    state,
    clock: () => "2026-08-04T00:00:00.000Z"
  });
}

test("M2 fake adapter reproduces the approved proposal digest and ID", async () => {
  const proposal = readProposal();
  const reversedTopLevel = Object.fromEntries(Object.entries(proposal).reverse());

  assert.deepEqual(deriveProposalIdentity(reversedTopLevel), {
    proposal_id: proposal.proposal_id,
    proposal_digest: proposal.proposal_digest,
    idempotency_key: proposal.idempotency_key
  });
  assert.equal(
    (await validateGitHubMutationProposal(proposal, { workspace: WORKSPACE })).valid,
    true
  );
});

test("M2 fake adapter rejects a mismatched proposal identity before execution", async () => {
  const proposal = readProposal();
  proposal.proposal_digest = "0".repeat(64);
  const adapter = createAdapter(readProposal());
  const result = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal)
  });

  assert.equal(result.record_type, "github_mutation_construction_failure");
  assert.equal(result.failure_class, "PROPOSAL_INVALID");
  assert.ok(result.issues.some((entry) => entry.code === "PROPOSAL_IDENTITY_MISMATCH"));
  assert.deepEqual(result.network_actions_performed, []);
  assert.deepEqual(adapter.snapshot().branches, {});
});

test("M2 fake adapter rejects non-contiguous or reordered operations", async () => {
  const gap = readProposal();
  gap.operations[2].sequence = 4;
  reidentify(gap);
  const gapResult = await validateGitHubMutationProposal(gap, { workspace: WORKSPACE });
  assert.ok(gapResult.issues.some((entry) => entry.code === "OPERATION_SEQUENCE_INVALID"));

  const reordered = readProposal();
  [reordered.operations[1], reordered.operations[2]] = [
    reordered.operations[2],
    reordered.operations[1]
  ];
  reordered.operations.forEach((operation, index) => {
    operation.sequence = index + 1;
  });
  reidentify(reordered);
  const orderResult = await validateGitHubMutationProposal(reordered, { workspace: WORKSPACE });
  assert.ok(orderResult.issues.some((entry) => entry.code === "OPERATION_ORDER_INVALID"));
});

test("M2 fake adapter returns a construction failure for malformed operations", async () => {
  const proposal = readProposal();
  proposal.operations[2] = {};
  const adapter = createAdapter(readProposal());
  const result = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal)
  });

  assert.equal(result.record_type, "github_mutation_construction_failure");
  assert.ok(result.issues.some((entry) => entry.code === "OPERATION_SEQUENCE_INVALID"));
  assert.ok(result.issues.some((entry) => entry.code === "OPERATION_ORDER_INVALID"));
});

test("M2 fake adapter rejects undeclared and prohibited mutation behavior", async () => {
  const proposal = readProposal();
  proposal.operations[1].force = true;
  reidentify(proposal);
  const result = await validateGitHubMutationProposal(proposal, { workspace: WORKSPACE });

  assert.ok(result.issues.some((entry) => entry.code === "PROHIBITED_OPERATION_FIELD"));

  const mergeProposal = readProposal();
  mergeProposal.operations[4].type = "merge";
  reidentify(mergeProposal);
  const mergeResult = await validateGitHubMutationProposal(mergeProposal, {
    workspace: WORKSPACE
  });
  assert.ok(mergeResult.issues.some((entry) => entry.code === "OPERATION_ORDER_INVALID"));
});

test("M2 fake adapter verifies immutable source hashes", async () => {
  const proposal = readProposal();
  proposal.operations[2].files[0].content.sha256 = "0".repeat(64);
  proposal.operations[2].files[0].proposed_sha256 = "0".repeat(64);
  reidentify(proposal);
  const result = await validateGitHubMutationProposal(proposal, { workspace: WORKSPACE });

  assert.ok(result.issues.some((entry) => entry.code === "SOURCE_HASH_MISMATCH"));
});

test("M2 fake adapter rejects repository and source path traversal variants", async () => {
  const variants = [
    { field: "path", value: "../outside.json" },
    { field: "path", value: "/absolute/outside.json" },
    { field: "path", value: "C:/outside.json" },
    { field: "path", value: "relay\\..\\outside.json" },
    { field: "path", value: "%2e%2e%2foutside.json" },
    { field: "source", value: "examples/m1/%2e%2e/%2e%2e/outside.json" }
  ];

  for (const variant of variants) {
    const proposal = readProposal();
    if (variant.field === "source") {
      proposal.operations[2].files[0].content.path = variant.value;
    } else {
      proposal.operations[2].files[0].path = variant.value;
    }
    reidentify(proposal);
    const result = await validateGitHubMutationProposal(proposal, { workspace: WORKSPACE });
    assert.equal(result.valid, false, variant.value);
    assert.ok(
      result.issues.some((entry) =>
        ["PATH_TRAVERSAL", "SOURCE_UNAVAILABLE"].includes(entry.code)
      ),
      variant.value
    );
  }
});

test("M2 fake adapter applies the complete create-only flow without network action", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal);
  const receipt = await adapter.execute(proposal, {
    attemptId: "ATTEMPT-SUCCESS",
    authorization: authorizationFor(proposal)
  });
  const state = adapter.snapshot();

  assert.equal(receipt.outcome, "applied");
  assert.deepEqual(receipt.network_actions_performed, []);
  assert.deepEqual(receipt.causal_links, proposal.causal_links);
  assert.deepEqual(
    receipt.operations.map(({ sequence, type }) => ({ sequence, type })),
    proposal.operations.map(({ sequence, type }) => ({ sequence, type }))
  );
  assert.equal(state.branches[proposal.target.head_branch].proposalDigest, proposal.proposal_digest);
  assert.equal(Object.keys(state.files[proposal.target.head_branch]).length, 2);
  assert.equal(state.commits[proposal.target.head_branch].proposalDigest, proposal.proposal_digest);
  assert.equal(state.pullRequests.length, 1);
  assert.equal(state.pullRequests[0].proposalDigest, proposal.proposal_digest);
});

test("M2 fake adapter returns an exact replay without duplicate objects", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal);
  await adapter.execute(proposal, { authorization: authorizationFor(proposal) });
  const before = adapter.snapshot();
  const replay = await adapter.execute(proposal, { authorization: authorizationFor(proposal) });
  const after = adapter.snapshot();

  assert.equal(replay.outcome, "replayed");
  assert.equal(after.pullRequests.length, 1);
  assert.deepEqual(after.branches, before.branches);
  assert.deepEqual(after.files, before.files);
  assert.deepEqual(after.commits, before.commits);
});

test("M2 fake adapter fails stale base state without mutation", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal, (state) => {
    state.refs[proposal.target.base_ref] = "b".repeat(40);
  });
  const receipt = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal)
  });

  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_class, "STALE_BASE_CONFLICT");
  assert.equal(receipt.retry_classification, "new_proposal_required");
  assert.deepEqual(receipt.network_actions_performed, []);
  assert.deepEqual(adapter.snapshot().branches, {});
});

test("M2 fake adapter rejects an existing branch with mismatched provenance", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal, (state) => {
    state.branches[proposal.target.head_branch] = {
      sha: "c".repeat(40),
      fromSha: proposal.target.expected_base_sha,
      proposalDigest: "different-proposal"
    };
    state.refs[`refs/heads/${proposal.target.head_branch}`] = "c".repeat(40);
    state.files[proposal.target.head_branch] = {};
  });
  const receipt = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal)
  });

  assert.equal(receipt.failure_class, "BRANCH_ALREADY_EXISTS_CONFLICT");
  assert.equal(receipt.retry_classification, "new_proposal_required");
  assert.equal(adapter.snapshot().pullRequests.length, 0);
});

test("M2 fake adapter preserves partial state and resumes only the same safe digest", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal);
  const partial = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal),
    failure: {
      sequence: 3,
      timing: "after",
      failureClass: "TRANSIENT_PROVIDER_FAILURE",
      retryClassification: "same_proposal_safe"
    }
  });
  const partialState = adapter.snapshot();

  assert.equal(partial.outcome, "failed");
  assert.equal(partial.failed_operation_sequence, 3);
  assert.equal(partial.retry_classification, "same_proposal_safe");
  assert.ok(partialState.branches[proposal.target.head_branch]);
  assert.equal(Object.keys(partialState.files[proposal.target.head_branch]).length, 2);
  assert.equal(partialState.commits[proposal.target.head_branch], undefined);
  assert.equal(partialState.pullRequests.length, 0);

  const resumed = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal)
  });
  assert.equal(resumed.outcome, "applied");
  assert.equal(adapter.snapshot().pullRequests.length, 1);

  const replay = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal)
  });
  assert.equal(replay.outcome, "replayed");
});

test("M2 fake adapter classifies a transient pre-operation failure as same-proposal safe", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal);
  const failed = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal),
    failure: {
      sequence: 2,
      failureClass: "TRANSIENT_PROVIDER_FAILURE",
      retryClassification: "same_proposal_safe"
    }
  });

  assert.equal(failed.outcome, "failed");
  assert.equal(failed.retry_classification, "same_proposal_safe");
  assert.deepEqual(adapter.snapshot().branches, {});
  assert.equal(
    (await adapter.execute(proposal, { authorization: authorizationFor(proposal) })).outcome,
    "applied"
  );
});

test("M2 fake adapter records permanent failure without implicit rollback", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal);
  const failed = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal),
    failure: {
      sequence: 3,
      timing: "after",
      failureClass: "PERMANENT_PROVIDER_FAILURE",
      retryClassification: "never"
    }
  });
  const state = adapter.snapshot();

  assert.equal(failed.retry_classification, "never");
  assert.ok(state.branches[proposal.target.head_branch]);
  assert.equal(Object.keys(state.files[proposal.target.head_branch]).length, 2);
  assert.equal(state.pullRequests.length, 0);
});

test("M2 fake adapter fails closed for missing or insufficient authorization", async () => {
  const proposal = readProposal();
  const missingAdapter = createAdapter(proposal);
  const missing = await missingAdapter.execute(proposal);
  assert.equal(missing.failure_class, "AUTHORIZATION_UNAVAILABLE");
  assert.equal(missing.retry_classification, "human_review_required");
  assert.deepEqual(missingAdapter.snapshot().branches, {});

  const insufficientAdapter = createAdapter(proposal);
  const insufficient = await insufficientAdapter.execute(proposal, {
    authorization: authorizationFor(proposal, ["relay.proposal.create"])
  });
  assert.equal(insufficient.failure_class, "AUTHORIZATION_INSUFFICIENT");
  assert.ok(insufficient.observed_state.missing_capabilities.length > 0);
  assert.deepEqual(insufficientAdapter.snapshot().branches, {});
});

test("M2 fake adapter rejects and redacts credential-bearing fields", async () => {
  const proposal = readProposal();
  proposal.actor.api_key = "must-not-appear-in-output";
  reidentify(proposal);
  const adapter = createAdapter(readProposal());
  const failure = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal)
  });

  assert.equal(failure.record_type, "github_mutation_construction_failure");
  assert.equal(failure.failure_class, "REDACTION_BOUNDARY_VIOLATION");
  assert.equal(JSON.stringify(failure).includes("must-not-appear-in-output"), false);
  assert.deepEqual(failure.network_actions_performed, []);
});

test("M2 fake adapter preserves causal links in failed execution receipts", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal, (state) => {
    state.refs[proposal.target.base_ref] = "b".repeat(40);
  });
  const receipt = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal)
  });

  assert.deepEqual(receipt.causal_links, proposal.causal_links);
  assert.equal(adapter.snapshot().receipts.length, 1);
  assert.deepEqual(adapter.snapshot().receipts[0], receipt);
});

test("M2 fake adapter serializes concurrent identical executions", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal);
  const authorization = authorizationFor(proposal);
  const [left, right] = await Promise.all([
    adapter.execute(proposal, { attemptId: "ATTEMPT-CONCURRENT-A", authorization }),
    adapter.execute(proposal, { attemptId: "ATTEMPT-CONCURRENT-B", authorization })
  ]);
  const state = adapter.snapshot();

  assert.deepEqual([left.outcome, right.outcome].sort(), ["applied", "replayed"]);
  assert.equal(state.pullRequests.length, 1);
  assert.equal(Object.keys(state.commits).length, 1);
});

test("M2 fake adapter detects post-application divergence instead of repairing it", async () => {
  const proposal = readProposal();
  const adapter = createAdapter(proposal);
  await adapter.execute(proposal, { authorization: authorizationFor(proposal) });
  adapter.state.files[proposal.target.head_branch][proposal.operations[2].files[0].path].sha256 =
    "f".repeat(64);

  const receipt = await adapter.execute(proposal, {
    authorization: authorizationFor(proposal)
  });
  assert.equal(receipt.failure_class, "IDEMPOTENCY_DIVERGENCE");
  assert.equal(receipt.retry_classification, "new_proposal_required");
  assert.equal(
    adapter.snapshot().files[proposal.target.head_branch][proposal.operations[2].files[0].path]
      .sha256,
    "f".repeat(64)
  );
});

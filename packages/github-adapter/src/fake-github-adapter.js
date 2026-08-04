import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { canonicalJson } from "../../protocol/src/index.js";

const CONTRACT_VERSION = "0.1.0";
const OPERATION_ORDER = Object.freeze([
  "assert_ref",
  "create_branch",
  "put_files",
  "create_commit",
  "create_pull_request"
]);
const CAUSAL_RELATIONS = new Set([
  "caused-by",
  "derived-from",
  "responds-to",
  "supersedes"
]);
const CREDENTIAL_FIELD = /^(api[_-]?key|access[_-]?token|auth[_-]?token|authorization[_-]?header|bearer|credential|credentials|password|private[_-]?key|secret)$/i;
const PROHIBITED_OPERATION_FIELD = /^(delete|fetch|force|force[_-]?push|force[_-]?update|merge|rebase)$/i;

const clone = (value) => structuredClone(value);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function digestInput(proposal) {
  const { proposal_id, proposal_digest, idempotency_key, ...input } = proposal;
  return input;
}

export function deriveProposalIdentity(proposal) {
  const digest = sha256(Buffer.from(canonicalJson(digestInput(proposal)), "utf8"));
  return {
    proposal_id: `PROP-${digest.slice(0, 16).toUpperCase()}`,
    proposal_digest: digest,
    idempotency_key: digest
  };
}

function scanForbiddenFields(value, pointer = "") {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => scanForbiddenFields(entry, `${pointer}/${index}`));
  }
  if (!value || typeof value !== "object") return [];

  const issues = [];
  for (const [key, entry] of Object.entries(value)) {
    const location = `${pointer}/${key}`;
    if (CREDENTIAL_FIELD.test(key)) {
      issues.push({ code: "CREDENTIAL_FIELD_FORBIDDEN", path: location });
    }
    if (pointer.startsWith("/operations/") && PROHIBITED_OPERATION_FIELD.test(key)) {
      issues.push({ code: "PROHIBITED_OPERATION_FIELD", path: location });
    }
    issues.push(...scanForbiddenFields(entry, location));
  }
  return issues;
}

function decodedPath(value) {
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) return decoded;
    decoded = next;
  }
  return decoded;
}

function validateRelativePath(value, pointer) {
  if (typeof value !== "string" || value.length === 0) {
    return [{ code: "PATH_REQUIRED", path: pointer }];
  }

  let decoded;
  try {
    decoded = decodedPath(value);
  } catch {
    return [{ code: "PATH_ENCODING_INVALID", path: pointer }];
  }

  const segments = decoded.split("/");
  if (
    decoded.includes("\0") ||
    decoded.includes("\\") ||
    decoded.startsWith("/") ||
    /^[A-Za-z]:/.test(decoded) ||
    segments.includes("..") ||
    segments.includes("") ||
    path.posix.normalize(decoded).startsWith("../")
  ) {
    return [{ code: "PATH_TRAVERSAL", path: pointer }];
  }
  return [];
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function issue(code, pathValue, details = {}) {
  return { code, path: pathValue, ...details };
}

function validateShape(proposal) {
  const issues = [];
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    return [issue("PROPOSAL_OBJECT_REQUIRED", "")];
  }

  issues.push(...scanForbiddenFields(proposal));
  if (proposal.contract_version !== CONTRACT_VERSION) {
    issues.push(issue("CONTRACT_VERSION_UNSUPPORTED", "/contract_version"));
  }
  if (proposal.record_type !== "github_mutation_proposal") {
    issues.push(issue("RECORD_TYPE_INVALID", "/record_type"));
  }
  if (proposal.target?.host !== "github.com") {
    issues.push(issue("TARGET_HOST_INVALID", "/target/host"));
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(proposal.target?.repository ?? "")) {
    issues.push(issue("TARGET_REPOSITORY_INVALID", "/target/repository"));
  }
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(proposal.target?.base_ref ?? "")) {
    issues.push(issue("BASE_REF_INVALID", "/target/base_ref"));
  }
  if (!/^[a-f0-9]{40}$/.test(proposal.target?.expected_base_sha ?? "")) {
    issues.push(issue("BASE_SHA_INVALID", "/target/expected_base_sha"));
  }
  issues.push(...validateRelativePath(proposal.target?.head_branch, "/target/head_branch"));

  let identity;
  try {
    identity = deriveProposalIdentity(proposal);
  } catch {
    issues.push(issue("PROPOSAL_CANONICALIZATION_FAILED", ""));
  }
  if (identity) {
    for (const field of ["proposal_id", "proposal_digest", "idempotency_key"]) {
      if (proposal[field] !== identity[field]) {
        issues.push(issue("PROPOSAL_IDENTITY_MISMATCH", `/${field}`));
      }
    }
  }

  if (proposal.authorization?.status !== "unverified") {
    issues.push(issue("PROPOSAL_AUTHORITY_MUST_REMAIN_UNVERIFIED", "/authorization/status"));
  }
  if (!Array.isArray(proposal.authorization?.required_capabilities)) {
    issues.push(issue("REQUIRED_CAPABILITIES_MISSING", "/authorization/required_capabilities"));
  }

  if (!Array.isArray(proposal.causal_links)) {
    issues.push(issue("CAUSAL_LINKS_REQUIRED", "/causal_links"));
  } else {
    proposal.causal_links.forEach((link, index) => {
      if (!CAUSAL_RELATIONS.has(link?.relation)) {
        issues.push(issue("CAUSAL_RELATION_INVALID", `/causal_links/${index}/relation`));
      }
      if (typeof link?.target_event_id !== "string" || link.target_event_id.length === 0) {
        issues.push(issue("CAUSAL_TARGET_REQUIRED", `/causal_links/${index}/target_event_id`));
      }
    });
  }

  if (!Array.isArray(proposal.operations)) {
    issues.push(issue("OPERATIONS_REQUIRED", "/operations"));
    return issues;
  }
  const sequences = proposal.operations.map((operation) => operation?.sequence);
  if (sequences.some((sequence, index) => sequence !== index + 1)) {
    issues.push(issue("OPERATION_SEQUENCE_INVALID", "/operations"));
  }
  const types = proposal.operations.map((operation) => operation?.type);
  if (
    types.length !== OPERATION_ORDER.length ||
    types.some((type, index) => type !== OPERATION_ORDER[index])
  ) {
    issues.push(issue("OPERATION_ORDER_INVALID", "/operations"));
  }

  const [assertRef, createBranch, putFiles, createCommit, createPullRequest] = proposal.operations;
  if (
    assertRef?.ref !== proposal.target?.base_ref ||
    assertRef?.expected_sha !== proposal.target?.expected_base_sha
  ) {
    issues.push(issue("ASSERT_REF_TARGET_MISMATCH", "/operations/0"));
  }
  if (
    createBranch?.branch !== proposal.target?.head_branch ||
    createBranch?.from_sha !== proposal.target?.expected_base_sha ||
    createBranch?.must_not_exist !== true
  ) {
    issues.push(issue("CREATE_BRANCH_CONTRACT_INVALID", "/operations/1"));
  }

  if (!Array.isArray(putFiles?.files) || putFiles.files.length === 0) {
    issues.push(issue("PUT_FILES_EMPTY", "/operations/2/files"));
  } else {
    putFiles.files.forEach((file, index) => {
      const pointer = `/operations/2/files/${index}`;
      if (file?.action !== "create" || file?.expected_prior_sha256 !== null) {
        issues.push(issue("PUT_FILE_MUST_BE_CREATE_ONLY", pointer));
      }
      issues.push(...validateRelativePath(file?.path, `${pointer}/path`));
      if (file?.content?.kind !== "workspace_file") {
        issues.push(issue("CONTENT_SOURCE_KIND_INVALID", `${pointer}/content/kind`));
      }
      issues.push(...validateRelativePath(file?.content?.path, `${pointer}/content/path`));
      if (!/^[a-f0-9]{64}$/.test(file?.content?.sha256 ?? "")) {
        issues.push(issue("CONTENT_HASH_INVALID", `${pointer}/content/sha256`));
      }
      if (file?.proposed_sha256 !== file?.content?.sha256) {
        issues.push(issue("PROPOSED_HASH_MISMATCH", `${pointer}/proposed_sha256`));
      }
    });
  }

  if (
    createCommit?.expected_parent_sha !== proposal.target?.expected_base_sha ||
    typeof createCommit?.message !== "string" ||
    /Signed-off-by:/i.test(createCommit?.message ?? "") ||
    typeof createCommit?.author?.name !== "string" ||
    typeof createCommit?.author?.email !== "string"
  ) {
    issues.push(issue("CREATE_COMMIT_CONTRACT_INVALID", "/operations/3"));
  }

  const expectedBase = proposal.target?.base_ref?.replace(/^refs\/heads\//, "");
  if (
    createPullRequest?.head !== proposal.target?.head_branch ||
    createPullRequest?.base !== expectedBase ||
    createPullRequest?.must_not_exist !== true ||
    typeof createPullRequest?.title !== "string" ||
    typeof createPullRequest?.body !== "string"
  ) {
    issues.push(issue("CREATE_PULL_REQUEST_CONTRACT_INVALID", "/operations/4"));
  }

  return issues;
}

export async function validateGitHubMutationProposal(proposal, { workspace } = {}) {
  const issues = validateShape(proposal);
  const sources = new Map();
  if (issues.length > 0 || !workspace) {
    if (!workspace) issues.push(issue("WORKSPACE_REQUIRED", "/operations/2/files"));
    return { valid: false, issues, sources };
  }

  const workspaceRoot = await realpath(path.resolve(workspace));
  const files = proposal.operations[2].files;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const pointer = `/operations/2/files/${index}/content/path`;
    const candidate = path.resolve(workspaceRoot, ...file.content.path.split("/"));
    if (!isWithin(workspaceRoot, candidate)) {
      issues.push(issue("PATH_TRAVERSAL", pointer));
      continue;
    }

    let source;
    try {
      const resolved = await realpath(candidate);
      if (!isWithin(workspaceRoot, resolved)) {
        issues.push(issue("SOURCE_SYMLINK_ESCAPE", pointer));
        continue;
      }
      source = await readFile(resolved);
    } catch {
      issues.push(issue("SOURCE_UNAVAILABLE", pointer));
      continue;
    }

    const observedHash = sha256(source);
    if (observedHash !== file.content.sha256 || observedHash !== file.proposed_sha256) {
      issues.push(issue("SOURCE_HASH_MISMATCH", `/operations/2/files/${index}`));
      continue;
    }
    sources.set(file.path, { bytes: source, sha256: observedHash, sourcePath: file.content.path });
  }

  return { valid: issues.length === 0, issues, sources };
}

export function createFakeGitHubState({
  host = "github.com",
  repository,
  baseRef = "refs/heads/main",
  baseSha
}) {
  return {
    host,
    repository,
    refs: { [baseRef]: baseSha },
    branches: {},
    files: {},
    commits: {},
    pullRequests: [],
    completed: {},
    receipts: [],
    constructionFailures: []
  };
}

function constructionFailure(issues) {
  const credentialFailure = issues.some((entry) => entry.code === "CREDENTIAL_FIELD_FORBIDDEN");
  return {
    contract_version: CONTRACT_VERSION,
    record_type: "github_mutation_construction_failure",
    failure_class: credentialFailure ? "REDACTION_BOUNDARY_VIOLATION" : "PROPOSAL_INVALID",
    retry_classification: "never",
    issues: issues.map(({ code, path: issuePath }) => ({ code, path: issuePath })),
    network_actions_performed: [],
    message: credentialFailure
      ? "The proposal contains a forbidden credential-bearing field; values were not retained."
      : "The proposal does not satisfy the GitHub mutation proposal contract."
  };
}

function targetProjection(proposal) {
  return {
    host: proposal.target.host,
    repository: proposal.target.repository,
    base_ref: proposal.target.base_ref,
    head_branch: proposal.target.head_branch
  };
}

function receiptBase(proposal, { attemptId, observedAt, outcome, operations }) {
  return {
    contract_version: CONTRACT_VERSION,
    record_type: "github_mutation_execution_receipt",
    proposal_id: proposal.proposal_id,
    proposal_digest: proposal.proposal_digest,
    idempotency_key: proposal.idempotency_key,
    attempt_id: attemptId,
    observed_at: observedAt,
    outcome,
    target: targetProjection(proposal),
    causal_links: clone(proposal.causal_links),
    operations: clone(operations),
    network_actions_performed: []
  };
}

function failedReceipt(proposal, context, failure) {
  return {
    ...receiptBase(proposal, { ...context, outcome: "failed" }),
    phase: failure.phase ?? "execution",
    failed_operation_sequence: failure.sequence ?? null,
    failure_class: failure.failureClass,
    retry_classification: failure.retryClassification,
    observed_state: clone(failure.observedState ?? {}),
    message: failure.message
  };
}

function authorizationFailure(proposal, authorization) {
  if (!authorization || authorization.actorId !== proposal.actor?.id) {
    return {
      failureClass: "AUTHORIZATION_UNAVAILABLE",
      retryClassification: "human_review_required",
      phase: "authorization",
      message: "Authenticated actor identity is unavailable or does not match the proposal actor."
    };
  }
  const granted = new Set(authorization.capabilities ?? []);
  const missing = (proposal.authorization.required_capabilities ?? []).filter(
    (capability) => !granted.has(capability)
  );
  if (missing.length > 0) {
    return {
      failureClass: "AUTHORIZATION_INSUFFICIENT",
      retryClassification: "human_review_required",
      phase: "authorization",
      observedState: { missing_capabilities: missing },
      message: "The authenticated actor lacks one or more required capabilities."
    };
  }
  return null;
}

function replayStateMatches(state, proposal) {
  const digest = proposal.proposal_digest;
  const branch = state.branches[proposal.target.head_branch];
  const pullRequest = state.pullRequests.find(
    (candidate) =>
      candidate.head === proposal.target.head_branch &&
      candidate.base === proposal.operations[4].base
  );
  if (branch?.proposalDigest !== digest || pullRequest?.proposalDigest !== digest) return false;
  return proposal.operations[2].files.every((file) => {
    const stored = state.files[proposal.target.head_branch]?.[file.path];
    return stored?.proposalDigest === digest && stored.sha256 === file.proposed_sha256;
  });
}

export class FakeGitHubAdapter {
  #clock;
  #counter = 0;
  #inFlight = new Map();

  constructor({ workspace, state, clock = () => new Date().toISOString() }) {
    this.workspace = path.resolve(workspace);
    this.state = clone(state);
    this.#clock = clock;
  }

  snapshot() {
    return clone(this.state);
  }

  async execute(proposal, options = {}) {
    const key = proposal?.idempotency_key ?? proposal?.proposal_id ?? "invalid-proposal";
    const pending = this.#inFlight.get(key);
    if (pending) {
      await pending;
      return this.#executeInternal(proposal, options);
    }

    const execution = this.#executeInternal(proposal, options);
    this.#inFlight.set(key, execution);
    try {
      return await execution;
    } finally {
      if (this.#inFlight.get(key) === execution) this.#inFlight.delete(key);
    }
  }

  #attemptContext(options) {
    this.#counter += 1;
    return {
      attemptId: options.attemptId ?? `ATTEMPT-FAKE-${String(this.#counter).padStart(4, "0")}`,
      observedAt: options.observedAt ?? this.#clock(),
      operations: []
    };
  }

  #record(receipt) {
    this.state.receipts.push(clone(receipt));
    return clone(receipt);
  }

  #fail(proposal, context, failure) {
    return this.#record(failedReceipt(proposal, context, failure));
  }

  #injectedFailure(options, sequence, timing) {
    const configured = options.failure;
    if (!configured || configured.sequence !== sequence || (configured.timing ?? "before") !== timing) {
      return null;
    }
    return {
      sequence,
      phase: "execution",
      failureClass: configured.failureClass,
      retryClassification: configured.retryClassification,
      observedState: configured.observedState,
      message: configured.message ?? "A synthetic fake-provider failure was injected."
    };
  }

  async #executeInternal(proposal, options) {
    const validation = await validateGitHubMutationProposal(proposal, {
      workspace: this.workspace
    });
    if (!validation.valid) {
      const failure = constructionFailure(validation.issues);
      this.state.constructionFailures.push(clone(failure));
      return clone(failure);
    }

    const context = this.#attemptContext(options);
    const authFailure = authorizationFailure(proposal, options.authorization);
    if (authFailure) return this.#fail(proposal, context, authFailure);

    if (
      this.state.host !== proposal.target.host ||
      this.state.repository !== proposal.target.repository
    ) {
      return this.#fail(proposal, context, {
        phase: "precondition",
        failureClass: "TARGET_REPOSITORY_MISMATCH",
        retryClassification: "new_proposal_required",
        observedState: { host: this.state.host, repository: this.state.repository },
        message: "The fake repository identity does not match the reviewed proposal target."
      });
    }

    if (this.state.completed[proposal.proposal_digest]) {
      if (!replayStateMatches(this.state, proposal)) {
        return this.#fail(proposal, context, {
          phase: "precondition",
          failureClass: "IDEMPOTENCY_DIVERGENCE",
          retryClassification: "new_proposal_required",
          message: "Previously applied state no longer matches the reviewed proposal digest."
        });
      }
      return this.#record({
        ...receiptBase(proposal, { ...context, outcome: "replayed" }),
        phase: "complete",
        message: "The exact proposal digest was already applied; no objects were duplicated."
      });
    }

    let appliedAny = false;
    for (const operation of proposal.operations) {
      const beforeFailure = this.#injectedFailure(options, operation.sequence, "before");
      if (beforeFailure) return this.#fail(proposal, context, beforeFailure);

      const result = this.#applyOperation(proposal, operation, validation.sources);
      context.operations.push({
        sequence: operation.sequence,
        type: operation.type,
        outcome: result.outcome
      });
      if (result.failure) return this.#fail(proposal, context, result.failure);
      if (result.outcome === "applied") appliedAny = true;

      const afterFailure = this.#injectedFailure(options, operation.sequence, "after");
      if (afterFailure) return this.#fail(proposal, context, afterFailure);
    }

    this.state.completed[proposal.proposal_digest] = true;
    return this.#record({
      ...receiptBase(proposal, {
        ...context,
        outcome: appliedAny ? "applied" : "replayed"
      }),
      phase: "complete",
      message: appliedAny
        ? "The create-only proposal was applied to the fake repository."
        : "All proposal objects already matched the same digest."
    });
  }

  #applyOperation(proposal, operation, sources) {
    const digest = proposal.proposal_digest;
    const branchName = proposal.target.head_branch;

    if (operation.type === "assert_ref") {
      const actualSha = this.state.refs[operation.ref] ?? null;
      if (actualSha !== operation.expected_sha) {
        return {
          outcome: "failed",
          failure: {
            sequence: operation.sequence,
            phase: "precondition",
            failureClass: "STALE_BASE_CONFLICT",
            retryClassification: "new_proposal_required",
            observedState: { expected_sha: operation.expected_sha, actual_sha: actualSha },
            message: "The observed base ref does not match the proposal's expected SHA."
          }
        };
      }
      return { outcome: "verified" };
    }

    if (operation.type === "create_branch") {
      const existing = this.state.branches[operation.branch];
      if (existing) {
        if (existing.proposalDigest === digest && existing.fromSha === operation.from_sha) {
          return { outcome: "replayed" };
        }
        return {
          outcome: "failed",
          failure: {
            sequence: operation.sequence,
            failureClass: "BRANCH_ALREADY_EXISTS_CONFLICT",
            retryClassification: "new_proposal_required",
            observedState: { branch: operation.branch, actual_sha: existing.sha },
            message: "The proposed create-only branch already exists with different provenance."
          }
        };
      }
      this.state.branches[operation.branch] = {
        sha: operation.from_sha,
        fromSha: operation.from_sha,
        proposalDigest: digest
      };
      this.state.refs[`refs/heads/${operation.branch}`] = operation.from_sha;
      this.state.files[operation.branch] = {};
      return { outcome: "applied" };
    }

    if (operation.type === "put_files") {
      const branchFiles = this.state.files[branchName];
      if (!branchFiles) {
        return {
          outcome: "failed",
          failure: {
            sequence: operation.sequence,
            failureClass: "HEAD_BRANCH_MISSING",
            retryClassification: "new_proposal_required",
            message: "The create-only head branch is unavailable."
          }
        };
      }
      let applied = false;
      for (const file of operation.files) {
        const existing = branchFiles[file.path];
        if (existing) {
          if (existing.proposalDigest === digest && existing.sha256 === file.proposed_sha256) continue;
          return {
            outcome: "failed",
            failure: {
              sequence: operation.sequence,
              failureClass: "FILE_ALREADY_EXISTS_CONFLICT",
              retryClassification: "new_proposal_required",
              observedState: { path: file.path, actual_sha256: existing.sha256 },
              message: "A create-only file path already exists with different provenance or content."
            }
          };
        }
        const source = sources.get(file.path);
        branchFiles[file.path] = {
          sha256: source.sha256,
          sourcePath: source.sourcePath,
          proposalDigest: digest
        };
        applied = true;
      }
      return { outcome: applied ? "applied" : "replayed" };
    }

    if (operation.type === "create_commit") {
      const existing = this.state.commits[branchName];
      if (existing) {
        if (existing.proposalDigest === digest) return { outcome: "replayed" };
        return {
          outcome: "failed",
          failure: {
            sequence: operation.sequence,
            failureClass: "COMMIT_ALREADY_EXISTS_CONFLICT",
            retryClassification: "new_proposal_required",
            message: "The head branch already contains a commit from different provenance."
          }
        };
      }
      const commitSha = sha256(
        Buffer.from(
          canonicalJson({
            proposal_digest: digest,
            parent: operation.expected_parent_sha,
            message: operation.message,
            author: operation.author,
            files: this.state.files[branchName]
          }),
          "utf8"
        )
      ).slice(0, 40);
      this.state.commits[branchName] = {
        sha: commitSha,
        parentSha: operation.expected_parent_sha,
        message: operation.message,
        author: clone(operation.author),
        proposalDigest: digest
      };
      this.state.branches[branchName].sha = commitSha;
      this.state.refs[`refs/heads/${branchName}`] = commitSha;
      return { outcome: "applied" };
    }

    const existing = this.state.pullRequests.find(
      (candidate) => candidate.head === operation.head && candidate.base === operation.base
    );
    if (existing) {
      if (existing.proposalDigest === digest) return { outcome: "replayed" };
      return {
        outcome: "failed",
        failure: {
          sequence: operation.sequence,
          failureClass: "PULL_REQUEST_ALREADY_EXISTS_CONFLICT",
          retryClassification: "new_proposal_required",
          message: "A pull request already exists for the head/base pair with different provenance."
        }
      };
    }
    this.state.pullRequests.push({
      number: this.state.pullRequests.length + 1,
      head: operation.head,
      base: operation.base,
      title: operation.title,
      body: operation.body,
      proposalDigest: digest
    });
    return { outcome: "applied" };
  }
}

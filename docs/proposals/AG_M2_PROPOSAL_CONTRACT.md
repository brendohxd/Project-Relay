# M2 GitHub mutation proposal contract

> **Roadmap ID:** `M2-PROPOSAL`
> **Status:** Human-approved specification
> **Scope:** Deterministic, network-free, credential-free proposal records for a future GitHub adapter
> **Human review:** Approved by the project owner on 2026-07-29. Approval covers this contract only; it does not authorize authentication, live GitHub writes, or deployment.

## 1. Purpose and boundary

A GitHub mutation proposal is a serializable description of intended repository
changes. Constructing one reads only explicit local inputs. It does not contact
GitHub, fetch refs, authenticate, create branches, write commits, or open pull
requests.

The proposal is not authorization. It can be reviewed and tested against a fake
adapter before any authenticated write boundary exists. A later executor must
apply its own authenticated policy checks and may reject a structurally valid
proposal.

This adapter contract does not change the core Relay task, event, evidence,
review, or decision schemas.

## 2. Required invariants

1. Proposal construction is network-free and credential-free.
2. The proposal content is deterministic for identical explicit inputs.
3. Actor capabilities are declarations only; they never prove authority.
4. Every operation has an exact type, sequence, expected state, and desired
   state. Ambiguous `create_or_update` operations are forbidden.
5. Branch updates, force pushes, merges, and deletes are outside version `0.1`.
6. A stale base produces a conflict. The adapter must not fetch, rebase, or
   regenerate a proposal automatically.
7. File content is immutable and content-addressed before execution.
8. Failures and replays produce receipts rather than rewriting the proposal.
9. Rollback means a separately reviewed compensating proposal; history is not
   silently erased.
10. The public-boundary scan is evidence of a local check, not proof of safety.

## 3. Deterministic proposal envelope

The complete synthetic record is
[`examples/m2/proposal_success.json`](../../examples/m2/proposal_success.json).
Its top-level fields are:

| Field | Meaning |
| --- | --- |
| `contract_version` | Version of this adapter contract. |
| `record_type` | `github_mutation_proposal`. |
| `proposal_id` | Deterministically derived display identifier. |
| `proposal_digest` | SHA-256 of the canonical digest input. |
| `idempotency_key` | Equal to `proposal_digest` in contract `0.1`. |
| `target` | Host, repository, expected base ref/SHA, and new head branch. |
| `actor` | Declared actor identity, type, role, and capabilities. |
| `authorization` | Capabilities a future executor must independently verify. |
| `causal_links` | Relay-compatible backward provenance links. |
| `local_checks` | Recorded local validation and publication checks. |
| `operations` | Ordered, explicit proposed mutations. |

Timestamps and execution attempt identifiers are deliberately absent from the
proposal. They belong in non-deterministic execution receipts.

### 3.1 Digest algorithm

Create `digest_input` by removing only `proposal_id`, `proposal_digest`, and
`idempotency_key` from the proposal object. Then calculate:

```text
proposal_digest = SHA-256(UTF-8(relay_canonical_json_0_1(digest_input)))
idempotency_key = proposal_digest
proposal_id = "PROP-" + uppercase(first 16 hexadecimal characters of proposal_digest)
```

Hashing one canonical object avoids delimiter ambiguity. Any change to target,
actor declarations, required authorization, causal links, checks, file content,
or operations produces a different digest.

## 4. Target and observed state

`target` contains:

- `host`: currently `github.com`;
- `repository`: owner/name projection used by the adapter;
- `base_ref`: fully qualified base ref;
- `expected_base_sha`: exact locally observed 40-character Git SHA-1;
- `head_branch`: proposed new branch name.

Repository renames and stable repository IDs remain an open design question. A
future live executor must resolve identity without weakening the expected-state
checks.

The successful version `0.1` flow creates a new branch and a new pull request.
It cannot update an existing branch or pull request. If either already exists,
the executor returns a conflict or an idempotent replay receipt after verifying
that the existing object was created from the same proposal digest.

## 5. Operation contract

Operations have contiguous `sequence` values beginning at one.

### `assert_ref`

Compares `ref` with `expected_sha`. A mismatch returns
`STALE_BASE_CONFLICT`; it performs no mutation.

### `create_branch`

Requires `must_not_exist: true` and creates `branch` from `from_sha`. Force
creation or movement of an existing ref is forbidden.

### `put_files`

Each file declares:

- `action`: `create` in version `0.1`;
- repository-relative `path`;
- `expected_prior_sha256`: `null` for creation;
- `content.kind`: `workspace_file` in the synthetic profile;
- immutable source `content.path` and `content.sha256`;
- `proposed_sha256`, which must equal the verified source digest.

A fake or live adapter must read the declared source, verify the digest before
use, and reject path traversal. Inline secrets and external URLs are not valid
content sources in version `0.1`.

### `create_commit`

Requires `expected_parent_sha`, a deterministic message, and attribution
metadata. It must not add `Signed-off-by` or imply a legal attestation unless a
real person explicitly supplies one.

### `create_pull_request`

Requires `must_not_exist: true`, exact head/base values, title, and body. A
future executor may return an idempotent replay only when an existing pull
request is demonstrably linked to the same proposal digest.

## 6. Capability and authorization boundary

`actor.declared_capabilities` records what the actor claims. Proposal
construction may check that required declarations are present, but the proposal
must retain:

```json
{
  "authorization": {
    "status": "unverified",
    "required_capabilities": ["relay.proposal.create"]
  }
}
```

Only a future authenticated executor can evaluate identity, repository policy,
least-privilege grants, human approval, and write authority. The executor must
fail closed if that verification is unavailable. A capability declaration must
never become `authorized` merely because it appears in the proposal.

## 7. Causal provenance

Proposal links reuse the protocol names `relation` and `target_event_id`.
`target_event_hash` may accompany the ID as an adapter integrity hint, but it
never replaces the canonical event identifier. Relations remain limited to
`caused-by`, `derived-from`, `responds-to`, and `supersedes`.

Commit messages and pull-request bodies may render these links for humans. They
must not invent links or alter the underlying Relay event chain.

## 8. Local checks and redaction

A proposal can record local checks such as repository validation and the public
boundary scan. Each check identifies the command and result. These records are
review evidence, not authority and not a substitute for rechecking immediately
before a future write.

Proposal records and content sources must contain no credentials, authentication
headers, private local paths, private data, or unpublished ITSM material.

## 9. Construction failures and execution receipts

Two record families remain separate:

- `github_mutation_construction_failure`: emitted before a valid proposal exists;
- `github_mutation_execution_receipt`: references an existing proposal digest
  and records `applied`, `replayed`, or `failed` outcomes.

A receipt may include an observation time and attempt ID because it is not part
of the deterministic proposal digest. Failed receipts identify the operation
sequence when applicable, observed state, and one retry classification:

| Retry classification | Meaning |
| --- | --- |
| `never` | Retrying cannot make the same proposal valid. |
| `same_proposal_safe` | A transient executor failure may retry the exact digest. |
| `new_proposal_required` | Inputs or observed state changed; create and review a new proposal. |
| `human_review_required` | Policy or ambiguity requires a named human decision. |

The stale-base example at
[`examples/m2/proposal_stale_base.json`](../../examples/m2/proposal_stale_base.json)
uses `new_proposal_required`. It records that no network action occurred and
does not instruct automatic fetch or rebase.

## 10. Fake-adapter acceptance requirements

The dependent `AG-M2-FAKE-CONTRACT` packet must test, without network access:

1. proposal digest and ID reproduction;
2. contiguous operation ordering;
3. source-content hash verification and path traversal rejection;
4. successful create-only execution;
5. exact replay returning a replay receipt without duplicate objects;
6. stale base and existing mismatched branch conflicts;
7. partial, transient, permanent, authorization, and redaction failures;
8. no force update, implicit fetch, rebase, merge, delete, or credential field;
9. preservation of causal links and failure receipts.

The fixture consistency tests added with this specification do not implement a
fake GitHub adapter and do not complete `M2-CONTRACT`.

## 11. Open decisions for human review

- Whether live targets must include GitHub's stable numeric repository ID.
- Where approved content-addressed mutation payloads will be stored.
- Whether update operations require a separate contract version.
- How authenticated execution receipts will be signed or otherwise attributed.
- Which failures permit bounded automatic retry under a future policy.

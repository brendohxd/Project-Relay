# M2 adversarial input audit

## Scope

On 2026-08-04, an external Manus Wide Research bundle proposed 18 adversarial
dimensions for Relay's fake GitHub adapter. The supplied copy of
`AG_M2_PROPOSAL_CONTRACT.md` matched the repository contract byte-for-byte.
The source ZIP had SHA-256 digest
`b78024e28f5eac296e730c342721f696b9115022a6326c470e231869b740c465`.

The bundle was treated as untrusted design input. Its claims that verification
was complete, all data was retained, and no anomalies existed were not accepted
as evidence. The raw 509 KB generated Markdown table and intermediate files are
not part of the canonical repository.

## Adopted threat dimensions

The implementation preserves the useful coverage themes:

- deterministic proposal digest and ID reproduction;
- contiguous, exact operation ordering;
- immutable source-content verification and traversal rejection;
- create-only execution and exact idempotent replay;
- stale-base and mismatched-object conflicts;
- partial, transient, permanent, authorization, and redaction failures;
- prohibited mutation behavior and zero network actions;
- causal-link and receipt preservation;
- concurrent execution of an identical proposal digest.

## Contract corrections

Several generated cases contradicted contract `0.1` and were not imported
literally:

- invented operations such as `assert_digest`, `read_file`, `update_file`,
  `get_file`, `git_push`, `fail_proposal`, and repository deletion were removed;
- a suggestion to repair externally diverged state by reapplying an old proposal
  was replaced with `IDEMPOTENCY_DIVERGENCE` and `new_proposal_required`;
- direct writes to `main`, file updates, deletes, branch movement, implicit fetch,
  rebase, merge, and force-push remain forbidden;
- proposal construction failures remain distinct from execution receipts;
- successful execution does not use a failure retry classification;
- partial state is preserved, and only artifacts demonstrably linked to the same
  digest may be resumed after `same_proposal_safe` failure;
- authenticated executor capabilities are checked separately from the proposal's
  permanently `unverified` authority declaration;
- credential-bearing fields are rejected without copying their values into the
  failure record.

## Resulting evidence

- [`packages/github-adapter/src/fake-github-adapter.js`](../../packages/github-adapter/src/fake-github-adapter.js)
- [`test/m2-fake-github-adapter.test.js`](../../test/m2-fake-github-adapter.test.js)
- [`docs/proposals/AG_M2_PROPOSAL_CONTRACT.md`](../proposals/AG_M2_PROPOSAL_CONTRACT.md)

These artifacts complete only the network-free `M2-CONTRACT` gate. They do not
establish authenticated identity, GitHub permission safety, live-write safety,
or production readiness.

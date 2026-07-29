# Antigravity handoff

This is the repository-native entry point for handing bounded Project Relay
work to Google Antigravity. It supplements, but never replaces, tested code and
the canonical roadmap.

## Start a session

Open this repository as the Antigravity workspace and paste:

```text
Read @README.md, @project/status.json, @docs/ARCHITECTURE.md,
@docs/PROTOCOL.md, @docs/PUBLICATION_BOUNDARY.md, @CONTRIBUTING.md,
@SECURITY.md, and @docs/ANTIGRAVITY_HANDOFF.md. Run git status --short --branch,
git log -1 --oneline, node --version, npm --version, npm run doctor, and npm run
check. Do not edit yet. Summarise the real implementation state, current
milestone, pre-existing changes to preserve, and smallest safe work packet.
```

Antigravity workspace rules live in `.agents/rules/` and slash workflows in
`.agents/workflows/`. Ask Antigravity to turn the Operating rules below into an
always-on workspace rule, then review the generated file before accepting it.

## Canonical source order

1. Tested merged `main` defines implemented behaviour.
2. `project/status.json` defines roadmap state, blockers, evidence, and deferrals.
3. Validated records and content-addressed evidence define task history.
4. Notion records approved intent and decisions.
5. Issues, pull requests, `STATUS.md`, MCP status, and dashboards are
   collaboration surfaces or generated projections.

If sources conflict, stop and report the conflict. Never silently choose the
more convenient version.

## Operating rules

- Work on one bounded question or behavioural change at a time.
- State the roadmap/task ID and role: implementer, reviewer, reproducer,
  auditor, or human decision authority.
- Preserve all pre-existing working-tree changes.
- If the same failure occurs twice, stop retrying. Preserve the current state,
  report the error and evidence, present practical resolution options with
  tradeoffs, and wait for the user's choice before continuing.
- Do not silently change schemas, invariants, acceptance criteria, hashes,
  evidence, or generated status.
- An agent cannot supply the final human decision or independently approve
  evidence it produced.
- Do not commit, push, publish, add credentials, install paid services, or
  perform live GitHub writes without separate explicit authorisation.
- Use synthetic public-safe fixtures only.
- Never add credentials, private data, personal information, customer or
  commercial records, confidential prompts, or unpublished ITSM material.
- Relay and ITSM are separate. Do not add ITSM equations, claims, datasets,
  results, manuscripts, or scientific decisions here.
- GitHub Pages and the current MCP server remain read-only boundaries.
- A hash proves content integrity, not truth, authorship, safety, or provenance.
- Before handoff run `npm run check`, `git diff --check`, and inspect the diff.

## Current boundary

M0 and M1 are complete. M2, the GitHub collaboration adapter, is current. Relay
already includes the provider-neutral protocol, validation and provenance,
policy-checked transitions, evidence bundling, read-only local MCP,
deterministic project status, and a static read-only console.

Authentication, privileged GitHub writes, remote MCP, secrets, billing,
multi-tenancy, and production operation are not implemented or authorised.
Always re-read `project/status.json` because this summary can age.

## Packet AG-M4-CLIENT-GUIDE

**Status:** ready and low risk. **Role:** documentation implementer.
**Roadmap:** `M4-CLIENT-GUIDES`.

Add `docs/clients/antigravity.md`. Document Windows-first Node.js 24+ setup
with absolute paths and `RELAY_WORKSPACE`; the actual tools, resources, and
prompts in `apps/mcp-server/src/index.js`; the fact that
`relay_prepare_event` does not write or commit; verification and
troubleshooting. Link it from README.

```text
Take AG-M4-CLIENT-GUIDE from @docs/ANTIGRAVITY_HANDOFF.md. Act only as the
documentation implementer. Inspect the MCP code instead of guessing. Produce
the guide and README link only. Preserve existing edits, use no credentials,
make no live GitHub changes, run npm run check and git diff --check, and return
a review walkthrough without committing or pushing.
```

## Packet AG-M2-PROPOSAL-CONTRACT

**Status:** ready, specification only. **Role:** adapter contract designer.
**Roadmap:** `M2-PROPOSAL`.

Define deterministic inputs, preconditions, ordered proposed operations,
idempotency keys, expected repository state, conflicts, retry classes, failure
records, causal provenance, and redaction. Include synthetic success and
stale-base examples. The result must be serialisable, network-free,
credential-free, fake-adapter testable, and must not change protocol schemas.

```text
Take AG-M2-PROPOSAL-CONTRACT from @docs/ANTIGRAVITY_HANDOFF.md. Act only as the
adapter contract designer. Produce a specification and synthetic examples. Do
not implement auth, call GitHub, add credentials, change schemas, or write
remotely. Preserve existing edits, run npm run check and git diff --check, and
return open questions for human review without committing or pushing.
```

`AG-M2-FAKE-CONTRACT` is blocked until that contract is approved. A later

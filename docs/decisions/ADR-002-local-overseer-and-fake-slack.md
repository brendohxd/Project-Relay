# ADR-002: Local Overseer dispatcher and fake Slack adapter

- Status: accepted for the R4 contract slice
- Date: 2026-08-07

## Context

Relay needs to turn one human request into attributable work for several
models and return their replies to one conversation without treating either a
Slack message or a model statement as canonical authority. Slack Business+
improves administration and retention, but it does not remove the need for a
provider-neutral routing and review contract.

## Options considered

| Option | Cost | Safety evidence | Decision |
|---|---:|---|---|
| Connect a live Slack app first | Low direct cost | Weak; secrets, webhook replay, and provider behaviour are untested | Reject for now |
| Build a fake Slack and local dispatcher contract | Free | Strong deterministic tests for signing, replay, attribution, and authority boundaries | Adopt |
| Use a managed queue and hosted model routing now | Ongoing cost | Adds vendor and credential complexity before the local behaviour is known | Defer |

## Decision

Add two local-only, in-memory adapters:

1. a fake Slack adapter that verifies synthetic signed events, rejects stale or
   replayed deliveries, and projects updates to a stable task thread; and
2. a local Overseer dispatcher that creates named model assignments, accepts
   responses only after a claim, and emits a comparison packet that always
   requires human review.

Neither adapter invokes a model, contacts Slack, stores a live secret, or
creates a human decision. Both surface `network_actions_performed: []` and
`authority_granted: false` in their receipts.

## Consequences

- The contract is testable at no provider or API cost.
- A later local agent runner can execute Codex CLI, Grok CLI, or another
  explicitly configured adapter without changing Slack semantics.
- Live Slack remains an opt-in projection with a dedicated signing secret and
  a synthetic channel pilot.
- The comparison packet preserves response provenance but deliberately makes
  no automatic recommendation or approval.

## Next actions

1. Define the local model-runner request/claim/response protocol.
2. Add golden transcript normalization and redaction fixtures.
3. Pilot one Slack Events API application in a dedicated Relay channel after
   explicit credential configuration and a rollback plan.
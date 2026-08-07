# ADR-003: Overseer standing auto-pass policies and notifications

- Status: accepted for design; implement after R4 Overseer MVP human-queue path
- Date: 2026-08-07
- Relates to: ADR-002 (local Overseer dispatcher), protocol human-authority invariant

## Context

Relay keeps consequential acceptance under human authority. At scale, requiring an
interactive human decision for every clean, low-risk packet becomes the bottleneck.
Operators need:

1. **Predefined acceptable passes** — standing rules a human authors in advance so
   Overseer can auto-pass when conditions fully match; and
2. **Notifications** — when a packet is out of policy, ambiguous (“questionable”),
   or otherwise needs a human, the right people are notified and the item enters
   the human review queue.

These must not become “the model decides” or “silence equals approval.”

## Options considered

| Option | Cost | Safety evidence | Decision |
|---|---:|---|---|
| Always interactive human decision (ADR-002 MVP) | High human time | Strongest default safety | Keep for R4 MVP |
| Model majority vote auto-accepts | Low | Weak; shared prompts/bugs fake independence | Reject |
| Standing human-authored policy + mechanical evaluator + notify/queue on non-clean outcomes | Medium | Auditable; default-deny; policy hash bound at apply time | Adopt for R4+ scale layer |
| Channel emoji / Slack message as auto-pass | Low | Weak; projection becomes authority | Reject |

## Decision

### 1. Standing auto-pass is human-originated authority

- A **policy** is authored only by a human (or role with decision capability).
- Overseer **evaluates** the policy mechanically against a comparison / decision packet.
- A successful match may emit an **auto-pass record** that cites:
  - `policy_id` and **hash of the policy body at apply time**;
  - evidence / comparison packet hashes;
  - reason codes for the match;
  - evaluator actor (service/model runner), not as decision author.
- **Default deny:** no armed policy ⇒ packet always goes to the human queue
  (ADR-002 behaviour).
- **Opt-in:** policies are scoped (workspace, profile, risk ceiling, task type).
- **No self-approval loophole:** producer of evidence cannot be the sole
  “independent” check that unlocks auto-pass.
- **Risk ceiling:** high/critical (and hiring-class profiles) stay human-only
  unless a future dedicated profile and threat model explicitly allow otherwise.

### 2. Notifications and escalation are first-class

Under auto mode, every packet resolves to one of:

| Outcome | Action |
|---|---|
| **Hard pass** | Auto-pass record; optional soft “FYI / digest” notify |
| **Questionable** | Do **not** auto-pass; **notify** + human review queue |
| **Hard escalate** | **Notify** + require human review |

**Questionable** includes (non-exhaustive): material model disagreement; independence
or shared-context flags; incomplete evidence vs acceptance criteria; redaction
warnings; risk at policy edge; expired/superseded policy; optional audit sampling
of otherwise clean passes.

Notification kinds:

- **Escalation** — action required (human queue);
- **Questionable** — grey zone, hold for human;
- **Auto-pass receipt** — optional audit stream;
- **Policy health** — revoked, expired, misconfigured policies.

**Silence is never acceptance.** A missing notification or unread inbox item does
not create a decision. Delivery channels (local inbox, Slack, email, etc.) are
projections; they never become canonical authority (same rule as control rooms).

### 3. Relation to R4 MVP

- **R4 Overseer MVP** remains: normalize, compare, decision packets, **human
  approval queue only** (ADR-002).
- **Standing auto-pass + notification contract** is **R4.1 / post-MVP** once
  golden packets, redaction, and provenance tests exist.
- Live control rooms may **project** auto-pass and notify events later; they
  must not define or accept policies by message reaction alone.

### 4. Authority model (summary)

| Layer | Role |
|---|---|
| Policy author | Human — standing authority |
| Policy evaluator | Overseer service — mechanical match only |
| Packet content | Models propose / compare |
| Interactive exception | Named human when policy fails or is questionable |
| Canonical pass | Interactive human decision **or** auto-pass record bound to human-authored policy hash |

Humans decide the **rules**; Overseer may **execute** the rules at scale; humans
handle **exceptions**.

## Consequences

- Scale path without abandoning accountable acceptance.
- Auto-pass history remains rebuildable and attributable (policy snapshot hash).
- Product UX must distinguish **auto-pass (policy X)** from **human decision**.
- Protocol 0.1 decision rules may need a later, explicit extension for
  “human-originated standing policy” without allowing model-authored policy.
- Notification delivery adapters stay optional; the queue + reason codes are
  the portable contract.

## Next actions

1. Draft policy document schema and auto-pass / notify event shapes (synthetic fixtures only).
2. Define reason-code enum and default-deny evaluator tests.
3. Extend Overseer comparison packet with policy-evaluation outcome fields.
4. Spec local human inbox (and later Slack projection) for escalation/questionable only.
5. Amend protocol docs when implementation lands; do not change acceptance semantics before tests exist.

## Non-goals

- Autonomous scientific, hiring, or legal final decisions.
- Auto-pass from model self-review alone.
- Treating unread notifications as timeout-approval.
- Publishing live credentials or real private incident data in fixtures.

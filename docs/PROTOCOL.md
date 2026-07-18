# Relay protocol

## Record types

### Task

A task asks one bounded question. It declares an owner, reviewers, risk, inputs, constraints, and acceptance criteria. A task is coordination metadata, not evidence.

### Evidence bundle

An evidence bundle connects a claim to its method, exact commands, environment, artifacts, hashes, and limitations. Its status begins as `provisional`; reproduction and audit are separate events.

### Review

A review names its reviewer, independence status, evidence considered, findings, outcome, and AI disclosure. `independent: true` is a declared property that can be audited; it is not inferred from using a different brand of model.

### Decision

A decision records a gate outcome and rationale. In protocol `0.1`, the decision authority must be human. This prevents an automated reviewer from silently converting its own conclusion into canonical acceptance.

### Event

An event is an append-only envelope describing a state transition or material action. Events contain a sequence number, previous-event hash, actor, timestamp, payload, and their own deterministic hash.

## Task lifecycle

```text
draft -> ready -> claimed -> in_progress -> submitted -> under_review
                                                      |          |
                                                      v          v
                                                remediation   accepted
                                                      |
                                                      v
                                                  submitted

Any active state may become blocked. Rejected and cancelled are terminal.
```

The validator checks document shape and chain integrity. A future policy engine will enforce allowed state transitions and project-specific gates.

## Default evidence gate

1. The owner submits evidence against explicit acceptance criteria.
2. A reviewer who did not produce that evidence records a review.
3. High-risk claims require an independent reproduction bundle rather than commentary alone.
4. Conflicts and failed reproductions remain attached to the task.
5. A named human authority accepts, rejects, remediates, or defers the result.

## Deterministic hashing

Protocol `0.1` recursively sorts object keys, preserves array order, rejects non-finite numbers and unsupported values, serialises the resulting JSON without whitespace, and hashes its UTF-8 bytes with SHA-256.

This is the **Relay Canonical JSON 0.1** profile. It is intentionally labelled rather than presented as a complete implementation of an external canonicalisation standard. An event hash excludes the `event_hash` field itself.

## Invariants

- One task contains one primary question.
- Every material claim points to evidence or is labelled unsupported.
- Evidence preserves failures and exclusions as well as successful outputs.
- Prior penalties and data-fit metrics remain separable when applicable.
- AI involvement is disclosed at the review and decision boundary.
- A failed gate cannot be relabelled as acceptance without a new decision record.
- Rejected and superseded records remain discoverable.
- No actor approves its own work as independent review.

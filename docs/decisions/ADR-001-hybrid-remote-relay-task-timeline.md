# ADR-001: Hybrid Remote Relay task timeline

- Status: accepted for the remote prototype
- Date: 2026-08-07

## Context

Remote Relay originally chained records independently by `(workspace, task,
kind)`. That preserves append safety but does not give a cross-model reviewer a
single ordered view when one model writes a task and another writes a review.

## Decision

Keep the existing per-kind append precondition. For every newly accepted
record, commit a second server-owned task timeline entry in the same D1
transaction. The entry has a task-wide sequence, links to the prior timeline
hash, records the accepted record's content hash, and optionally names a causal
parent content hash. A non-task record defaults to the first task record in the
same scope when one exists.

The MCP response returns the timeline entry and `relay_list_task_timeline`
returns entries in task order. Idempotent replay returns the already-created
timeline entry.

## Consequences

- Models can continue independently with per-kind sequence numbers.
- The Overseer can compare one coherent, hash-linked task history.
- A duplicate task-wide sequence causes the whole D1 batch to fail; callers
  retry the same idempotent request.
- Existing records remain readable. Timeline coverage begins with migration
  `0002`; the prototype does not fabricate a backfill.
- This remains a coordination and review surface. Human decisions are not
  remotely writable, and the ITSM scientific canon remains outside this store.

---
description: Implement exactly one approved Project Relay handoff packet and return it for review.
---

Run `/relay-orient` first unless this session has already completed it.

Read @docs/ANTIGRAVITY_HANDOFF.md and take exactly the packet named by the user.
If no packet is named, recommend the smallest unblocked packet and wait for the
user to select it before editing.

Before editing, state the packet ID, role, acceptance criteria, expected files,
verification commands, and actions requiring separate approval.

Implement the smallest complete change with synthetic public-safe data. Preserve
all pre-existing changes. Run focused tests while iterating, then run
`npm run check` and `git diff --check`. Inspect the complete diff.

Return a walkthrough with files changed, exact observed results, failures,
limitations, exclusions, unresolved questions, and reviewer instructions.

Do not commit, push, publish, add credentials, install paid services, or perform
live GitHub writes unless the user separately and explicitly requests it.

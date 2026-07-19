# Roadmap

## M0 — protocol kernel

- Canonical schemas for task, event, evidence, review, and decision records
- Deterministic hashes and event-chain verification
- Synthetic reference workspace
- Public-boundary scanner and CI
- Read-only local MCP server

## M1 — local vertical slice — implementation candidate

- Policy-checked task transition engine implemented for the default lifecycle
- Evidence bundle CLI implemented without arbitrary command execution
- MCP task resource and bounded independent-review prompt implemented
- Deterministic gate and transition projection implemented for the console
- Windows and Linux conformance matrix configured
- Synthetic task covers submission, failed review, remediation, resubmission, pass review, and human acceptance

M1 becomes complete when the candidate passes both CI operating systems and receives review.

## M2 — GitHub collaboration adapter

- Least-privilege GitHub authentication
- Branch and pull-request proposal flow
- Issue and label projections
- Concurrency and retry handling
- Immutable command, environment, hash, and failure records

## M3 — research gates

- Blind reproduction packets
- Reviewer independence declarations
- Adversarial review and disagreement ledger
- Remediation loops and supersession graph
- Project-specific policy profiles, beginning with ITSM

## M4 — public console and integrations

- GitHub Pages read-only command centre
- MCP client guides for Codex, Claude, Gemini, and compatible tools
- Manual packet bridge for clients without GitHub or MCP access
- Notifications and human approval inbox

## M5 — optional managed service

- Hosted authentication and encrypted secrets
- Multi-tenant isolation and audit logs
- Usage controls, billing, support, and service-level objectives
- Published comparison against API-heavy orchestration approaches

Milestone order is intentional: the protocol and evidence gates must be testable before convenience automation can depend on them.

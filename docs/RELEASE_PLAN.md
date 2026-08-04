# Project Relay release route

This is the implementation route for the current public Relay repository. It turns the long-term M0-M5 roadmap into release-sized gates that can ship independently and remain useful without paid providers.

## Release principles

- The local Relay contracts and evidence chain are the product; Notion, Slack, GitHub, and model clients are replaceable projections or adapters.
- Every release keeps discovery/read paths separate from authenticated writes.
- A model can propose, compare, and draft, but only the named human authority can accept, publish, or execute a consequential decision.
- Premium services are optional accelerators. The portable local path remains the reference implementation.

## Release stages

| Stage | Status | Shipped content | Exit gate |
|---|---|---|---|
| R0 Foundation | Complete | M0/M1 protocol kernel, deterministic records, read-only MCP, policy gates, public-boundary checks | npm run check; canonical records rebuild and verify |
| R1 GitHub collaboration contract | Complete in this branch | Network-free GitHub adapter contract, deterministic proposal identity, causal links, stale/conflict handling, receipts, adversarial tests | 100% adapter contract tests; no credentials or network dependency |
| R2 Knowledge Hub contract | Complete in this branch | Provider-neutral projection model, local/fake adapter, inbox for untrusted model messages, Notion and Slack profile contracts | Projection replay is deterministic and cannot create authority |
| R3 Discovery CLI | Complete in this branch | Windows-first relay catalog and read-only scanner, standard/broad/custom locations, confirmation UI, JSON output, no config writes | CLI discovery/UI tests pass; scanner reads metadata only |
| R4 Overseer MVP | Next | Local transcript normalizer, comparison summaries, decision packets, task assignment, human approval queue | Golden fixtures for supported clients; redaction and provenance tests |
| R5 Notion control room | Planned after R4 | Opt-in Notion projection, dedicated Relay workspace/database mapping, page update receipts, rebuild/export path | User-approved OAuth/token flow; private-by-default and replayable |
| R6 Slack control room | Planned after R5 | Channel/thread projections, notifications, approval inbox, explicit command acknowledgements | Signed/attributed commands; no Slack message becomes canonical authority |
| R7 Live archive and bookshelf | Planned | Low-RAM watcher, append-only local archive, stale-topic cataloguing, retention/export controls | Crash recovery, bounded memory, opt-in paths, no process killing by default |
| R8 MCP/configuration installer | Planned | Per-client configuration discovery, dry-run merge plans, backups, rollback, install guidance | Explicit confirmation for each client; secret-safe config tests |
| R9 Multi-model routing | Planned | Provider adapters, round-table comparison, cost/latency policy, local LLM fallback, model capability registry | Provider failures isolate cleanly; user chooses final answer |
| R10 Hosted/premium options | Future | Managed sync, encrypted secrets, multi-tenant controls, billing and support | Separate threat model, privacy review, operational SLOs |

## Implementation pathways

The stages share one governed event/record contract but can be adopted through different control rooms:

1. **Local-first:** CLI + local archive + optional local LLM. This is the cheapest and most testable path and is the reference fallback.
2. **Notion:** a durable knowledge and task projection for users who already pay for Notion. It never replaces the local/Git canonical record.
3. **Slack:** a conversational control room for notifications, approvals, and task hand-offs. Commands remain explicit and attributable.
4. **GitHub:** reviewable proposals, issues, receipts, and public-safe status.
5. **Hosted:** an optional convenience layer after local contracts and privacy boundaries are proven.

## Current release decision

This branch is the **R1-R3 public-safe foundation release**. The next focused release is **R4 Overseer MVP**. It should compare existing local transcripts and produce a human-reviewable packet before any live Notion, Slack, MCP configuration, or provider-routing writes are enabled.

## Continuation rule

Do not skip a stage because a paid integration is available. Implement and test the provider-neutral contract first, then add the integration as a rebuildable projection with an explicit approval and rollback path.

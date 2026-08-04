# Relay Knowledge Hub 0.1

> **Status:** implementation candidate
> **Boundary:** a knowledge hub is a replaceable projection and coordination surface, not Relay's canonical authority

## Objective

Give people and multiple model clients one convenient project front door without
making that front door mandatory, proprietary, or authoritative. Notion can be
the richest implementation, while a free local implementation preserves the
same task, evidence, proposal, decision, and receipt semantics.

## Architecture rule

Relay owns validation, provenance, policy, authorization, and receipts. A hub
adapter owns presentation, search, inbox handling, and synchronization. Models
may submit evidence or proposed actions through a hub, but only Relay policy and
a named human decision can advance canonical authority.

The hub therefore stores `relay_hub_projection` records with
`authority: projection_only`. Hub content is rebuildable from canonical Relay
records. Conflicts between a hub and Relay are reported; the hub must not win by
last-write-wins behavior.

## Implementation modes

| Mode | Infrastructure | Cost profile | Automation | Intended use |
|---|---|---:|---|---|
| Memory fake | Node only | Free | Test-only | Contract and adversarial testing |
| Local files | Relay workspace and Git | Free | Local or scheduled | Default portable deployment |
| Direct Notion API | Small Relay bridge plus Notion integration | Low / plan-dependent | Headless API and webhooks | Dedicated Notion project without Custom Agents |
| Hosted Notion MCP | OAuth-capable model clients | Plan-dependent | Model-initiated read/write | Shared context for Codex, Claude, ChatGPT, and compatible clients |
| Notion Custom Agent | Notion agent plus Relay MCP | Paid feature / credits | Triggers, schedules, chat, routing | Most convenient control-room experience |
| Notion Worker | Hosted TypeScript worker | Plan-dependent | Webhooks, sync, agent tools | Managed event bridge without a separate small server |
| GitHub projection | Issues, Projects, pull requests | Often already available | GitHub-native workflows | Alternative when Notion is unavailable |

Prices and plan entitlements are deliberately not encoded in the contract. They
change independently from Relay and must be checked at deployment time.

## Common adapter surface

Every implementation should provide the same conceptual operations:

- `capabilities()` describes cost, network, read/write, trigger, and authority properties;
- `project(record)` creates or updates a rebuildable projection;
- `search(query)` returns scoped projections;
- `submitInbox(message)` records untrusted human or model input for review;
- later adapters may add `subscribe(cursor)` and attachment support.

Projection writes require `relay.hub.project`. Inbox writes require
`relay.hub.inbox.submit`. These capabilities allow interaction with the hub;
they do not grant acceptance, repository mutation, or human decision authority.

## Projection identity and concurrency

The projection digest is the SHA-256 digest of Relay canonical JSON after
removing only `projection_id` and `projection_digest`. The display identifier is
`HUB-` followed by the uppercase first sixteen hexadecimal digest characters.

The stable synchronization key is `source.system + source.record_id`.
Replaying an identical digest is safe. A higher positive source revision may
update the projection. A different projection at an equal or lower revision is
a stale conflict and must not overwrite the current view.

## Trust boundaries

1. Page text, model messages, imported research, web results, and attachments
   are untrusted input.
2. Instructions embedded in projected content are data, not executable policy.
3. A hub record cannot declare itself canonical, approved, authorized, or human-reviewed.
4. Secrets never belong in projected records, prompts, receipts, or activity logs.
5. Write tools default to confirmation and least-privilege page or project scope.
6. Deletion in a hub cannot delete canonical Relay history.
7. Webhook delivery is deduplicated and reconciled against current source state.

## Initial implementation evidence

- `packages/knowledge-hub/src/fake-knowledge-hub-adapter.js` provides the
  network-free memory adapter;
- `test/knowledge-hub.test.js` covers deterministic identity, authorization,
  replay, stale conflicts, authority escalation, untrusted inbox messages, and
  provider-neutral search.

## Next implementation gates

1. Review this contract and the existing M2 contract changes independently.
2. Add a local file adapter with atomic writes and an append-only synchronization cursor.
3. Define the Notion database mapping without credentials or network calls.
4. Add contract tests that run unchanged against both local and fake Notion adapters.
5. Complete Relay authentication policy before enabling a real Notion write connection.
6. Pilot one dedicated Notion project with synthetic data and human-confirmed writes.

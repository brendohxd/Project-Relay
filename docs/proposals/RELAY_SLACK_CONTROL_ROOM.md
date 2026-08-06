# Relay Slack Control Room 0.1

> **Status:** implementation profile candidate
> **Depends on:** Relay Knowledge Hub 0.1
> **Boundary:** Slack is a conversational projection and request surface, not a canonical record

## Role

Slack complements the Notion control room:

- Notion is the structured project and knowledge view;
- Slack is the real-time conversation, alert, mention, and response view;
- Relay remains the shared policy, provenance, routing, and receipt layer;
- Git and validated Relay records remain canonical.

Both control rooms can be enabled together or used independently. A Relay task
keeps the same identifier across Notion, Slack, local files, and GitHub.

## Suggested workspace mapping

| Slack surface | Relay purpose |
|---|---|
| `#relay-control` | New tasks, routing summaries, agent availability, and blockers |
| `#relay-research` | Manus and other research evidence notifications |
| `#relay-reviews` | Independent-review requests and remediation discussion |
| `#relay-approvals` | Human-confirmed proposal and decision requests |
| `#relay-audit` | Read-only execution receipts, conflicts, and failed actions |
| Task thread | Conversation associated with one stable Relay task ID |

Channel names are deployment defaults, not protocol requirements.

## Interaction model

1. A human mention, shortcut, message, or model response enters the Relay hub inbox.
2. Relay labels the message `untrusted_input` and assigns a deterministic message ID.
3. The router links it to an existing task or creates a draft task proposal.
4. Models claim work through their Relay adapters, not by editing Slack state.
5. Evidence and review summaries return to the task thread with canonical links.
6. Interactive buttons create signed-in human requests such as approve, reject,
   remediate, or defer.
7. Relay rechecks identity, capability, current task state, and proposal digest.
8. The resulting Relay decision and execution receipt are projected back to Slack.

A Slack reaction, emoji, ordinary message, channel role, or model-authored phrase
is never sufficient evidence of human approval.

## Implementation options

| Method | Convenience | Infrastructure | Notes |
|---|---:|---:|---|
| Manual packet and links | Basic | None beyond Slack | Free fallback with human relay |
| Incoming webhook notifications | Moderate | Small Relay bridge | Outbound alerts only |
| Slack MCP connection | High | OAuth-capable client | Model-initiated reads and messages |
| Slack application | High | Events/API service | Mentions, threads, buttons, identity mapping |
| Notion Custom Agent with Slack access | Highest | Paid features / credits | One agent can coordinate both control rooms |

Entitlements and pricing are deployment facts and are not encoded in Relay's
contract. Every method must pass the same adapter tests.

## Security requirements

- Scope access to dedicated Relay channels.
- Treat all message and attachment content as prompt-injection-capable input.
- Store no model, GitHub, Notion, or Relay secrets in Slack messages.
- Verify event signatures and reject replayed delivery identifiers.
- Map Slack identities to Relay actors explicitly; display names are insufficient.
- Require fresh confirmation for external writes and high-impact decisions.
- Keep the audit channel read-only for ordinary model identities.
- Reconcile missed or reordered events from Relay state rather than Slack history.
- Preserve links to full evidence instead of placing sensitive artifacts in messages.

## Contract evidence

`packages/knowledge-hub/src/control-room-profiles.js` declares local, Notion,
and Slack profiles with identical non-authority and confirmation defaults.
`test/control-room-profiles.test.js` verifies those shared boundaries and Slack's
conversation-specific capability declarations without network access.

The initial local contract is implemented in
`packages/knowledge-hub/src/fake-slack-adapter.js` and
`packages/knowledge-hub/src/local-overseer-dispatcher.js`. It verifies signed
synthetic inbound deliveries, replay and stale-delivery rejection, stable task
threads, named-model claims, untrusted model replies, and human-review-only
comparison packets. It makes no Slack, model-provider, or network write.

## Next gate

Connect the local dispatcher to an explicit local model-runner protocol and add
golden transcript/redaction fixtures. Only then create a dedicated Slack app,
configure its signing secret, and enable one synthetic control channel.
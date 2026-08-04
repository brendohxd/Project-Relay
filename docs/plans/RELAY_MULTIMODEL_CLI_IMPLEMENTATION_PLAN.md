# Project Relay Multi-Model CLI and Control-Room Implementation Plan

> **Status:** durable continuation plan
> **Primary interface name:** `relay` / `relayctl`
> **Target:** Windows-first, cross-platform, provider-neutral
> **Core rule:** Relay coordinates models and projections; models and control rooms do not grant themselves authority

## 1. Objective

Build a command-line frontend that can discover installed AI clients, catalogue
model providers, configure supported MCP clients safely, install optional Relay
implementations, route tasks between models, and project the same governed Relay
records into local files, Notion, Slack, and GitHub.

The system must remain useful without paid services. Premium Notion, Slack, and
provider APIs are convenience layers over the same portable contracts.

## 2. Current repository checkpoint

Repository:

```text
C:\Users\brend\OneDrive\Documents\Project Relay - Github
```

Observed branch before this plan:

```text
codex/m2-remote-relay-prototype
```

Existing uncommitted work includes the M2 fake GitHub adapter, its adversarial
tests, generated status updates, and the Knowledge Hub candidate. Do not discard,
reset, stage, commit, or mix these changes without reviewing their ownership.

The following pre-existing untracked file belongs to the user and must remain
untouched unless the user explicitly includes it:

```text
docs/clients/remote-mcp-prototype.md
```

Knowledge Hub evidence already created:

```text
docs/proposals/RELAY_KNOWLEDGE_HUB.md
packages/knowledge-hub/src/fake-knowledge-hub-adapter.js
test/knowledge-hub.test.js
```

The current full suite passes 73 tests, including the Slack profile files. The release-sized route and exit gates are maintained in docs/RELEASE_PLAN.md.

```text
docs/proposals/RELAY_SLACK_CONTROL_ROOM.md
packages/knowledge-hub/src/control-room-profiles.js
test/control-room-profiles.test.js
```

No Relay credentials or live Notion/Slack writes are part of this local contract work. Commit and push are performed only after the public-boundary and full validation gates pass.

## 3. Required operating boundaries

1. Use Node.js 24 or later and ESM.
2. Start with Node built-ins; propose dependencies before installing them.
3. Dependency changes require an explicit `y/n` confirmation from the user.
4. Discovery is read-only by default.
5. Show a configuration plan before modifying any client configuration.
6. Back up exact files before approved configuration changes.
7. Never overwrite an entire MCP configuration when a bounded merge is possible.
8. Never store credentials in Git, Notion, Slack, prompts, receipts, or logs.
9. Do not make authenticated calls or live writes without approval at action time.
10. All model, page, message, attachment, and web content is untrusted input.
11. A model cannot accept its own work or elevate its own authority.
12. Canonical Relay decisions remain attributable to a named human authority.
13. Control rooms are rebuildable projections, not canonical history.
14. Preserve the separation between Relay product records and ITSM scientific canon.

## 4. System architecture

```text
Human
  |
  +-- relay CLI / terminal UI
  +-- Notion Control Room
  +-- Slack Control Room
  +-- GitHub operational views
             |
             v
       Relay coordination layer
       - protocol validation
       - task/event state
       - identity and capability checks
       - routing and leases
       - proposal and approval gates
       - immutable receipts
             |
      +------+------+----------------+
      |             |                |
  model adapters  hub adapters   mutation adapters
      |             |                |
 Codex/Claude/   local/Notion/     GitHub and later
 Gemini/Kimi/    Slack/GitHub      external systems
 Manus/etc.
```

The CLI is a frontend and supervisor. The protocol package remains the kernel.

## 5. Connector taxonomy

Keep these concepts separate:

- **provider:** OpenAI, Anthropic, Google, Moonshot, Perplexity, xAI, etc.;
- **model:** a provider-specific model identifier and capability set;
- **client:** Codex, Claude Code, Cursor, Windsurf, VS Code, desktop apps, etc.;
- **transport:** MCP, API, compatible API, CLI, webhook, browser/manual packet;
- **control room:** local CLI, Notion, Slack, or GitHub;
- **adapter:** code translating one boundary into Relay records and receipts.

A client being installed does not prove authentication, invocation support, MCP
support, or authority. Each property is detected and reported separately.

## 6. Initial provider and client catalogue

Support catalogue entries for:

- OpenAI, ChatGPT, and Codex;
- Anthropic and Claude;
- Google Gemini;
- Moonshot/Kimi;
- Perplexity;
- Manus;
- xAI/Grok;
- Microsoft Copilot and GitHub Copilot;
- Amazon Q;
- Mistral;
- DeepSeek;
- Meta/Llama deployments;
- OpenRouter;
- Ollama;
- LM Studio;
- Cursor;
- Windsurf;
- Cline;
- Continue;
- Aider;
- OpenCode;
- VS Code MCP clients;
- generic MCP, generic CLI, generic webhook, and manual-packet clients.

Do not claim capabilities from brand names. Verify each current implementation
against official documentation when its adapter is built.

## 7. Standard connector manifest

Prefer declarative manifests over brand-specific core logic:

```json
{
  "manifest_version": "relay-connector/0.1",
  "connector_id": "kimi",
  "display_name": "Kimi",
  "kind": "model_provider",
  "publisher": "moonshot",
  "discovery": {
    "executables": [],
    "applications": [],
    "config_candidates": []
  },
  "transports": [
    "api",
    "openai_compatible",
    "manual_packet"
  ],
  "capabilities": {
    "invoke": "deployment_dependent",
    "mcp_client": "unknown",
    "attachments": "deployment_dependent",
    "streaming": "deployment_dependent",
    "background_execution": "unknown"
  },
  "configuration": {
    "scopes": [],
    "write_supported": false
  }
}
```

Allowed capability states:

```text
supported
unsupported
deployment_dependent
unknown
```

Unknown must fail closed rather than being treated as supported.

## 8. Generic transports

Implement generic transports before many branded adapters:

1. **MCP client:** a model/client connects to Relay's MCP server.
2. **Provider API:** Relay invokes a reviewed provider endpoint.
3. **OpenAI-compatible API:** reusable transport for compatible hosted/local APIs.
4. **CLI:** bounded subprocess invocation with explicit executable and arguments.
5. **Webhook:** asynchronous signed task and receipt delivery.
6. **Manual packet:** export a prompt/context packet and import a response packet.
7. **Local model:** explicit localhost endpoints such as Ollama or LM Studio.

Manual packet support is mandatory. It preserves participation by closed or
free-tier-limited products without browser automation or terms-of-service risk.

## 9. Proposed repository structure

```text
apps/relay-cli/
  src/index.js
  src/commands/
  src/output/
  src/setup/
  test/

packages/connector-registry/
  src/registry.js
  manifests/providers/
  manifests/clients/

packages/tool-discovery/
  src/scanner.js
  src/platform/windows.js
  src/platform/linux.js
  src/platform/macos.js
  src/adapters/

packages/config-planner/
  src/inspect.js
  src/plan.js
  src/apply.js
  src/rollback.js

packages/transports/
  src/mcp.js
  src/api.js
  src/openai-compatible.js
  src/cli.js
  src/webhook.js
  src/manual-packet.js

packages/knowledge-hub/
  src/fake-knowledge-hub-adapter.js
  src/local-file-adapter.js
  src/fake-notion-adapter.js
  src/fake-slack-adapter.js
  src/control-room-profiles.js

packages/installer/
  src/manifests.js
  src/verify.js
  src/plan.js
  src/execute.js

docs/connectors/
docs/control-rooms/
docs/plans/
test/contract/
```

Do not create all folders pre-emptively. Add them as their phases begin.

## 10. CLI command surface

### Diagnostics

```text
relay doctor
relay doctor --json
relay version
```

### Connector discovery

```text
relay connectors catalog
relay connectors scan
relay connectors list
relay connectors show <id>
relay connectors test <id>
relay connectors add-manifest <path>
```

### MCP configuration

```text
relay mcp scan
relay mcp show <client>
relay mcp plan <client> --server relay
relay mcp apply <plan-id>
relay mcp rollback <receipt-id>
```

### Implementations and control rooms

```text
relay hub profiles
relay hub init local
relay hub init notion
relay hub init slack
relay hub init hybrid
relay hub doctor <profile>
relay hub sync <profile>
```

### Dependencies

```text
relay deps check
relay deps plan
relay deps install <dependency>
relay deps rollback <receipt-id>
```

### Tasks and routing

```text
relay task create
relay task list
relay task show <task-id>
relay task route <task-id> --to <connector-list>
relay task route <task-id> --best-available
relay task watch <task-id>
relay task export <task-id> --transport manual-packet
relay task import <packet>
```

### Review and authority

```text
relay inbox
relay review request <task-id>
relay proposal show <proposal-id>
relay approve <proposal-id>
relay reject <proposal-id>
relay remediate <proposal-id>
relay receipts show <receipt-id>
```

Approval commands must display the exact actor, scope, digest, expected state,
and external effects before requesting confirmation.

## 11. Output contract

All read commands support human-readable and `--json` modes. Machine output must
be versioned and free of ANSI formatting. Errors use stable codes and nonzero
exit status. Secrets are redacted before either output mode.

Example discovery result:

```json
{
  "output_version": "relay-cli/0.1",
  "connector_id": "codex",
  "installed": true,
  "version": "observed-version",
  "executable": "observed-path",
  "authenticated": "unknown",
  "mcp_supported": true,
  "configuration_scopes": ["project", "user"],
  "relay_configured": false,
  "available_actions": ["inspect", "plan"]
}
```

## 12. Configuration discovery and mutation

Discovery order:

1. explicit CLI path supplied by the user;
2. documented project-level paths;
3. documented user-level paths;
4. executable lookup through platform mechanisms;
5. bounded known-application registry checks;
6. report unknown rather than recursively scanning broad user directories.

Mutation workflow:

```text
inspect -> parse -> normalize -> calculate bounded change -> show diff
-> user confirmation -> backup -> write temporary file -> validate
-> atomic replace -> smoke test -> receipt
```

Requirements:

- recognize JSON, JSONC, TOML, YAML, and client-specific formats;
- preserve comments and formatting when feasible;
- refuse writes when safe round-tripping is unavailable;
- record original and resulting SHA-256 digests;
- never copy credential values into receipts;
- permit project, user, and system scopes only when the client supports them;
- provide rollback using the exact verified backup.

## 13. Dependency installation framework

Use reviewed dependency manifests:

```json
{
  "manifest_version": "relay-dependency/0.1",
  "dependency_id": "node",
  "required_range": ">=24",
  "allowed_sources": ["official"],
  "verification": ["sha256", "platform_signature"],
  "silent_install_allowed": false,
  "confirmation_required": true
}
```

Installer flow:

```text
detect -> compare -> recommend -> show source and version -> y/n gate
-> download to isolated temp directory -> verify checksum/signature
-> install with bounded arguments -> refresh environment -> verify
-> record redacted receipt
```

Never provide a generic arbitrary-command installer. Never auto-upgrade major,
pre-release, or ambiguous versions. Reuse Relay's existing version-doctor rules.

## 14. Secret management

Preferred storage:

- Windows Credential Manager or DPAPI-backed store;
- macOS Keychain;
- Linux Secret Service when available;
- environment variables only for bounded runtime injection;
- provider-native OAuth stores when supported.

The canonical record stores only credential references and attribution metadata,
never tokens. Logs must redact token-shaped fields and known secret prefixes.

## 15. Knowledge Hub and control-room behavior

### Local

The free baseline uses deterministic files and Git. Implement atomic writes,
append-only cursors, crash recovery, export/import, and rebuild from canonical
Relay records.

### Notion

Use databases/data sources for Projects, Tasks, Agent Runs, Evidence, Reviews,
Proposals, Decisions, Receipts, Knowledge Inbox, and Agent Registry. Begin with
a fake adapter and synthetic content. The premium Custom Agent can later call a
Relay MCP server, but it remains a concierge rather than the authority.

### Slack

Use dedicated channels for control, research, reviews, approvals, and audit.
Use one thread per stable Relay task ID. Mentions, messages, reactions, and
interactive buttons become untrusted requests until Relay verifies identity,
capability, current state, and proposal digest.

### Hybrid

Notion is the durable knowledge/project view. Slack is the conversational and
alert view. Relay projects consistent identifiers and receipts into both.

## 16. Phased implementation

### Phase 0 - Preserve and verify the current checkpoint

Commands:

```powershell
npm run check
git diff --check
git status --short
```

Tasks:

- fix only failures attributable to the new Slack profile files;
- inspect all uncommitted M2 and Knowledge Hub changes;
- keep `docs/clients/remote-mcp-prototype.md` excluded unless authorized;
- do not commit until the user chooses the checkpoint scope.

Gate: full check passes and the working-tree ownership is documented.

### Phase 1 - Read-only CLI skeleton

Implement without new dependencies:

```text
relay doctor
relay hub profiles
relay connectors catalog
relay connectors scan
relay mcp scan
relay task list
relay task show
--json
```

Tests:

- deterministic JSON output;
- nonzero exit codes;
- unknown remains unknown;
- no writes during discovery;
- no credential leakage;
- Windows paths with spaces;
- missing tools handled normally.

Gate: read-only commands work from a clean synthetic fixture on Windows.

### Phase 2 - Registry and generic manual transport

Implement manifest validation, registry queries, capability negotiation, manual
packet export/import, and initial provider/client manifests.

Tests:

- malformed manifests rejected;
- duplicate connector IDs rejected;
- capability escalation rejected;
- packet digest verified;
- imported model output marked untrusted;
- provider-specific fields do not enter the protocol kernel.

Gate: Kimi, Perplexity, and any closed client can participate through packets.

### Phase 3 - MCP discovery and configuration planning

Implement client adapters incrementally, beginning with installed tools. Verify
current official configuration documentation before encoding paths.

Initial likely order:

1. Codex;
2. Claude Code/Desktop;
3. VS Code/GitHub Copilot;
4. Cursor;
5. Gemini-capable clients;
6. additional installed applications.

Start with `scan`, `show`, and `plan`. Do not implement `apply` until adversarial
round-trip tests pass.

Gate: plans show exact bounded diffs and do not write.

### Phase 4 - Safe configuration apply and rollback

Add confirmation-gated apply, verified backups, atomic replacement, smoke tests,
receipts, and rollback.

Tests:

- invalid existing syntax;
- comments and unknown keys preserved;
- concurrent edit after planning;
- symlink/reparse-point escape;
- permission failure;
- disk/write failure;
- interrupted replacement;
- rollback digest mismatch;
- credential redaction.

Gate: no supported fixture loses unrelated configuration or comments.

### Phase 5 - Knowledge Hub adapters

Order:

1. verify current generic/fake profile tests;
2. local file adapter;
3. fake Slack adapter;
4. fake Notion adapter;
5. shared adapter contract suite;
6. synthetic hybrid synchronization.

Fake Slack tests include signature failure, event replay, reordering, identity
mapping, false approvals, secrets, and delivery receipts.

Fake Notion tests include stale pages, duplicate webhooks, property drift,
permission loss, prompt injection, unsupported blocks, and reconciliation.

Gate: the same semantic contract passes for local, Slack, and Notion fakes.

### Phase 6 - Authentication and authorization

Complete M2-AUTH before live writes:

- stable Relay actor identities;
- provider identity mapping;
- least-privilege capabilities;
- credential references and secure storage;
- expiry, rotation, and revocation;
- fresh policy checks;
- human approval attribution;
- receipt signing or equivalent executor attribution;
- separation between proposal declarations and actual authorization.

Gate: threat model and adversarial tests pass without real credentials.

### Phase 7 - Installer framework

Implement detection and planning first. Add downloads and installation only for
reviewed dependencies after the user confirms each dependency class.

Gate: official source, checksum/signature, rollback/recovery, and post-install
verification are demonstrated in synthetic or isolated tests.

### Phase 8 - Live control-room pilots

Each step needs separate approval:

1. Slack outbound notification to a dedicated synthetic channel;
2. Notion read-only projection into a dedicated synthetic project;
3. Slack inbound task request;
4. Notion projection updates;
5. human approval request flow;
6. one model connector;
7. hybrid Slack/Notion reconciliation;
8. GitHub mutation only after all earlier gates.

Record every external action and cleanup/rollback method.

### Phase 9 - Multi-model router

Implement routing only after connector capabilities are trustworthy:

- explicit connector selection;
- best-available selection with explainable scoring;
- task leases and timeouts;
- parallel evidence requests;
- independence declarations;
- response import and validation;
- disagreement and remediation paths;
- cost/budget limits;
- cancellation;
- complete execution receipts.

Gate: synthetic multi-model workflow cannot silently accept its own result.

### Phase 10 - Interactive terminal UI

Build after CLI commands and JSON contracts stabilize. The TUI calls the same
command/service layer; it must not implement separate policy logic.

Views:

- project summary;
- connector health;
- task queue;
- agent runs;
- evidence/review status;
- approval inbox;
- receipts and failures;
- installation/configuration plans.

Gate: every TUI action has an equivalent auditable CLI operation.

### Phase 11 - Packaging and distribution

Options to evaluate:

- npm package with `bin` entry;
- standalone Node executable/bundle;
- signed Windows installer;
- portable archive;
- package-manager manifests.

Do not choose a distribution dependency until the dependency gate is approved.
Generate checksums, provenance, release notes, upgrade rules, and uninstall steps.

## 17. Adversarial test matrix

Every adapter should be tested for:

- malformed input;
- missing fields;
- canonical identity mismatch;
- duplicate/replayed requests;
- stale and reordered events;
- concurrency;
- partial failure;
- retry classification;
- permission loss;
- identity mismatch;
- capability escalation;
- prompt injection;
- secret leakage;
- path traversal;
- malicious configuration paths;
- unsupported provider behavior;
- network timeout and rate limit;
- external state divergence;
- rollback failure;
- receipt preservation;
- zero unauthorized actions.

## 18. Required CI matrix

Minimum:

```text
Windows + Node 24
Linux + Node 24
```

Later:

```text
macOS + Node 24
client-specific configuration fixtures
networkless adapter contract suite
opt-in live smoke tests with dedicated synthetic accounts
```

Live tests must never run in ordinary CI or against personal production spaces.

## 19. Definition of done

The overall system is complete only when:

1. A clean install can run fully locally without paid providers.
2. Installed tools are discovered without broad unsafe filesystem scanning.
3. Unsupported clients degrade to manual packets.
4. MCP configuration changes are planned, confirmed, backed up, validated, and reversible.
5. Dependencies are sourced and verified through explicit manifests and approval.
6. Local, Notion, Slack, and GitHub views preserve stable Relay identifiers.
7. Control-room conflicts never overwrite canonical Relay history.
8. Multiple models can submit separately attributable evidence.
9. Human authority remains required for canonical decisions and live writes.
10. Secrets do not appear in repository data, projections, prompts, or receipts.
11. Every external action produces a durable receipt.
12. Documentation lets a different model resume without relying on chat history.

## 20. Model allocation

- **Codex:** Node implementation, repository integration, tests, Windows behavior.
- **Claude:** contract review, MCP/client configuration review, threat modelling.
- **Manus Wide Research:** current provider/client capability matrix, official
  documentation links, pricing/plan volatility, and adversarial scenario generation.
- **Gemini/Grok/others:** independent design critique, parser/configuration edge cases,
  and attempts to violate authority boundaries.
- **Human owner:** dependency gates, credentials, external approvals, canonical decisions.

Research output is evidence, not automatically accepted implementation guidance.

## 21. Copyable prompts for continuation

### Builder prompt - immediate next phase

```text
Continue Project Relay using docs/plans/RELAY_MULTIMODEL_CLI_IMPLEMENTATION_PLAN.md.

Start at Phase 0. Read the plan and the referenced Knowledge Hub and Slack files.
Run npm run check, git diff --check, and git status --short. The Slack profile
files were added after the last verified 57-test checkpoint, so do not claim
they pass until verified.

Preserve all user changes. Do not modify docs/clients/remote-mcp-prototype.md.
Do not add dependencies, credentials, network calls, commits, pushes, or live
service changes without explicit approval. After Phase 0 passes, implement only
Phase 1's dependency-free, read-only CLI skeleton and its tests.
```

### Security reviewer prompt

```text
Review docs/plans/RELAY_MULTIMODEL_CLI_IMPLEMENTATION_PLAN.md as an adversarial
security and authority-boundary reviewer. Inspect existing Relay protocol,
Knowledge Hub, fake GitHub adapter, and tests. Identify concrete ways discovery,
configuration merging, dependency installation, model routing, Slack, Notion,
or manual packets could cause unauthorized writes, credential exposure, confused
deputy behavior, prompt injection, replay, or false human approval. Propose
testable requirements. Do not implement or use real credentials.
```

### Manus research prompt

```text
Research the current official integration capabilities of the provider/client
catalogue in docs/plans/RELAY_MULTIMODEL_CLI_IMPLEMENTATION_PLAN.md. For each,
record official documentation URLs, supported transports, MCP client/server
support, API availability, headless CLI availability, configuration scopes,
authentication method, free-tier constraints, automation restrictions, and
unknowns. Separate provider, model, client, and transport. Do not infer support
from brand marketing. Return structured JSON plus a concise uncertainty report.
Do not provide credentials or recommend bypassing product restrictions.
```

### Independent contract-test prompt

```text
Using docs/plans/RELAY_MULTIMODEL_CLI_IMPLEMENTATION_PLAN.md, design adversarial
contract tests for Phase 1 through Phase 5. Keep all tests network-free and use
synthetic paths, identities, messages, credentials, configurations, and events.
Do not invent authority semantics that conflict with Relay's protocol. Clearly
separate adopted tests from speculative provider-specific behavior.
```

## 22. Decisions intentionally deferred

- final CLI package name;
- TUI library;
- configuration parsing dependencies;
- remote hosting provider;
- credential-vault library;
- provider API SDKs;
- Notion and Slack production authentication;
- connector marketplace and signing format;
- receipt-signing mechanism;
- pricing and billing features;
- public distribution channel.

Resolve each only when its phase requires it. Avoid premature dependency or
vendor lock-in.

## 23. Immediate next action

Run Phase 0 only. If it passes, create a clean reviewable checkpoint before
starting the CLI skeleton. If the user authorizes a commit, exclude the
user-owned remote MCP prototype unless explicitly included.

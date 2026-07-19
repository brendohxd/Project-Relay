# Architecture

## Design objective

Project Relay turns fragmented multi-model work into a traceable sequence of questions, submissions, evidence, independent reviews, and human decisions. It is provider-neutral: a participant may operate through an MCP-capable client, GitHub, a local tool, or a manually relayed packet as long as the resulting record satisfies the same protocol.

## Source of truth

The canonical record consists of:

1. validated Relay JSON documents;
2. content-addressed evidence artifacts or immutable external references;
3. append-only events committed to Git;
4. the commit graph that records accepted changes.

GitHub Issues, pull requests, labels, notifications, and the web console are operational views. They may be rebuilt from the canonical record and must not introduce facts that exist nowhere else.

## Components

### Protocol package

Owns schemas, canonical JSON encoding, document validation, evidence hashes, and event-chain verification. It contains no provider-specific model logic.

### MCP server

Provides a stable tool surface for MCP-capable clients. The first release is local, stdio-based, and read-only. It validates documents, inspects tasks, verifies workspaces, and prepares proposed events without committing them.

### GitHub adapter — planned

Will translate approved proposals into branches, commits, pull requests, labels, and review requests. It is intentionally separate from the protocol and will use least-privilege GitHub permissions.

### Policy engine

The local default policy derives task state from append-only events, enforces allowed transitions, verifies linked evidence and reviews, preserves remediation, and requires a human-authored decision for acceptance. It does not assess scientific truth; it checks whether required process evidence exists. Project-specific profiles remain planned.

### Web console

A static, read-only projection designed for GitHub Pages. It consumes a generated state snapshot containing derived state, transition history, and gate results, and holds no credentials. Any future write action must leave Pages and enter an authenticated service or GitHub flow.

## Trust boundaries

```text
untrusted prompts, models, files, web pages
                   |
            schema validation
                   |
        policy and capability checks
                   |
           proposed repository change
                   |
          independent/human review
                   |
              canonical record
```

Schema validity does not imply factual validity. A hash does not imply honest provenance. Multiple models are not automatically independent when they share prompts, sources, or derived outputs. Relay records these limitations rather than claiming to eliminate them.

## Repository layout

```text
apps/console/       read-only static console
apps/mcp-server/    local MCP integration
packages/protocol/  validation and provenance kernel
schemas/            canonical document contracts
scripts/            repository validation and projections
examples/           synthetic, public-safe workspaces
docs/               design and operating rules
```

## Concurrency model

Agents do not edit one canonical file in place. Work is proposed through isolated branches or event files with unique identifiers. Git provides optimistic concurrency; pull requests expose conflicts. Sequence numbers and previous-event hashes detect missing or reordered events inside a task chain.

## Deployment boundary

GitHub Pages can host the console but cannot safely hold provider keys or perform privileged server-side operations. Remote MCP, authentication, billing, and multi-tenancy require a separate service boundary and are not disguised as static-site features.

# Project Relay

Project Relay is an evidence-governed coordination layer for multiple AI systems and human reviewers. It uses a Git repository as a shared, inspectable record while MCP provides a provider-neutral integration surface.

> **Status:** pre-alpha public scaffold. The name is a working title, the protocol is unstable, and no production deployment is implied.

## Why it exists

Multi-model work usually fragments across chats, vendors, local tools, and copied prompts. Relay gives that work a common protocol:

- one explicit question per task;
- named owners, reviewers, and decision authorities;
- immutable evidence references and reproducible commands;
- independent review before acceptance;
- recorded disagreement instead of silent consensus;
- human approval for consequential decisions;
- no requirement for every model to share one vendor API.

Relay coordinates work. It does **not** decide whether a scientific claim is true, replace peer review, or make model output trustworthy by default.

## Architecture at a glance

```text
AI clients / humans / IDE agents
              |
          MCP interface
              |
     Relay protocol + policy
              |
 append-only events and evidence
              |
        Git repository
              |
 read-only web console / GitHub UI
```

The canonical record is validated JSON plus referenced artifacts in Git history. Issues, labels, dashboards, and the Pages console are projections of that record, never alternate sources of truth.

## Current public milestone

This repository starts with:

- JSON Schemas for tasks, events, evidence, reviews, and decisions;
- deterministic canonicalisation and SHA-256 provenance helpers;
- an append-only event-chain verifier;
- a read-only MCP server for inspection, validation, and event preparation;
- a static console suitable for a future GitHub Pages deployment;
- CI and a public-boundary scanner.

GitHub write automation, remote MCP transport, authentication, and hosted multi-tenant operation are deliberately deferred until their threat models are reviewed.

## Quick start

Requires Node.js 24 or newer.

```bash
npm install
npm run check
npm run mcp
```

The MCP process uses stdio and reads the workspace specified by `RELAY_WORKSPACE` (the current directory by default):

```json
{
  "mcpServers": {
    "project-relay": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/Project-Relay", "run", "mcp"],
      "env": {
        "RELAY_WORKSPACE": "/absolute/path/to/a/relay-workspace"
      }
    }
  }
}
```

Use `examples/minimal` as the first workspace.

## Safety and publication boundary

This public repository must never contain credentials, private datasets, unpublished ITSM material, personal information, confidential prompts, or commercial records. `.gitignore` is not a security boundary: releases must be exported from a separate private workspace using an explicit allowlist and reviewed as if every commit were permanent.

See [Publication Boundary](docs/PUBLICATION_BOUNDARY.md) and [Security](SECURITY.md) before contributing.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Protocol and decision gates](docs/PROTOCOL.md)
- [Public/private publication boundary](docs/PUBLICATION_BOUNDARY.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Licence status](LICENSE-STATUS.md)

## Licence status

No open-source licence has been selected yet. Publication on GitHub does not grant permission to reuse the work beyond rights provided by GitHub's terms. See [LICENSE-STATUS.md](LICENSE-STATUS.md).

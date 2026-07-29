# Google Antigravity Integration Guide

This guide describes how to configure, connect, and verify Google Antigravity with Project Relay using the local read-only Model Context Protocol (MCP) server.

## Overview

Project Relay exposes a local, stdio-based MCP server (`apps/mcp-server/src/index.js`). It lets AI clients, including Google Antigravity, inspect Relay tasks, read task packets, validate documents against JSON Schemas, verify workspace integrity, and construct prepared event hashes.

> **Important Boundary Rule:** The MCP server is strictly **read-only and non-mutating**. The `relay_prepare_event` tool calculates SHA-256 event digests and validates payload structures, but it **never** writes files to disk, modifies Git state, or invokes remote APIs.

---

## Environment Requirements

- **Node.js**: Version 24.0.0 or higher.
- **Operating System**: Windows 10/11 (PowerShell / Command Prompt), Linux, or macOS.
- **Protocol version**: `0.1.0`; the project is pre-alpha.
- **Current roadmap milestone**: M2. Recheck `project/status.json` for current state.

---

## Configuration

Open **Agent panel -> ... -> MCP Servers -> Manage MCP Servers -> View raw config**.
Antigravity supports global configuration at `~/.gemini/config/mcp_config.json`
and workspace-local configuration at `.agents/mcp_config.json`. Prefer the
workspace-local file for Relay, and never commit a personal absolute path. See the
[Antigravity MCP documentation](https://antigravity.google/docs/mcp).

### Windows Configuration (Absolute Paths)

```json
{
  "mcpServers": {
    "project-relay": {
      "command": "npm",
      "args": [
        "--prefix",
        "C:\\absolute\\path\\to\\Project Relay - Github",
        "run",
        "mcp"
      ],
      "env": {
        "RELAY_WORKSPACE": "C:\\absolute\\path\\to\\Project Relay - Github"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `RELAY_WORKSPACE` | Absolute path to the Relay workspace containing `relay/tasks` and evidence. | `process.cwd()` |
| `RELAY_PROJECT_STATUS` | Path to canonical project status file. | `project/status.json` |
| `RELAY_PROJECT_STATUS_SCHEMA` | Path to project status JSON schema. | `project/status.schema.json` |

---

## MCP Surface Capabilities

The Relay MCP server exposes the following tools, resources, and prompt templates:

### Tools

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `relay_list_tasks` | `{}` | Lists summaries of all Relay tasks present in the configured workspace (`relay/tasks`). |
| `relay_get_task` | `{ id: string }` | Reads and validates a single task document by its identifier (e.g. `TSK-2026-0001`). |
| `relay_validate_document` | `{ kind: DocumentKind, document: object }` | Validates a proposed document against canonical schemas (`task`, `event`, `evidence`, `review`, `decision`) without writing to disk. |
| `relay_verify_workspace` | `{}` | Runs full workspace verification, checking document validity and event-chain hash integrity. |
| `relay_prepare_event` | `{ taskId, sequence, type, actor, payload, ... }` | Validates and returns a prepared event object with its computed SHA-256 `event_hash`. **Does not write to disk.** |
| `relay_get_project_status` | `{}` | Reads and validates the canonical roadmap, milestone status, and operational pilot summaries from `project/status.json`. |

### Resources

| URI Template | Title | Description |
| :--- | :--- | :--- |
| `relay://tasks/{id}` | Relay task packet | Reads full task details, including events, evidence bundles, reviews, decisions, derived state, and policy gate results. |
| `relay://project/status` | Project Relay status | Reads the validated project status snapshot (`project/status.json`). |

### Prompts

| Prompt Name | Arguments | Description |
| :--- | :--- | :--- |
| `relay_review_task` | `taskId: string` | Prepares an independent-review prompt incorporating the full task packet, enforcing review constraints (e.g., mandatory AI disclosure, non-author reviewer, preserving disagreement). |

---

## Verification & Usage

### 1. Verify Node.js and Workspace Health

Before running the MCP server, verify local system readiness:

```powershell
node --version
npm run doctor
```

### 2. Test Workspace Integrity

Run the full check suite to ensure schemas and synthetic fixtures (`examples/minimal`, `examples/m1`) pass:

```powershell
npm run check
```

### 3. Verify MCP Server Execution

You can launch the MCP server manually to confirm stdio initialization. It is
not an HTTP server: a successful manual launch normally waits silently for an
MCP client on standard input. Press `Ctrl+C` after confirming it stays running.

```powershell
npm run mcp
```

---

## Troubleshooting

- **Error: `Invalid Relay task identifier`**: Ensure the task ID follows the Relay pattern (e.g., `TSK-2026-0001`).
- **Error: `Relay task not found`**: Confirm `RELAY_WORKSPACE` points to the workspace root containing `relay/tasks/`.
- **Node Version Warnings**: Ensure `node --version` returns `v24.0.0` or newer.

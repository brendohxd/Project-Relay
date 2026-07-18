# Security policy

Project Relay is pre-alpha and must not yet be used to control production systems, hold secrets, or make autonomous consequential changes.

## Supported versions

There are no supported production versions. Security fixes apply to the current `main` branch until a release policy is published.

## Reporting a vulnerability

Do not disclose a vulnerability in a public issue. Use GitHub's private vulnerability reporting for this repository when it is enabled. If it is unavailable, contact the maintainer privately through their GitHub profile and disclose only enough information to establish contact.

## Security invariants

- Model output and repository content are untrusted input.
- Credentials never appear in Relay documents, events, prompts, logs, or commits.
- Filesystem access is constrained to an explicitly configured workspace.
- Read, draft, write, publish, and execute are distinct capabilities.
- Consequential writes require an authenticated actor and an applicable approval policy.
- A model cannot approve its own submission or satisfy an independent-review gate.
- Hashes provide integrity evidence, not truth, authorship, or safety.
- Public Git history is treated as permanent disclosure.

## Current attack surface

The initial MCP server is stdio-only and read-only with respect to the workspace. It can prepare a proposed event but does not write it, invoke GitHub, run supplied commands, or call model-provider APIs. Those capabilities require separate threat models before implementation.

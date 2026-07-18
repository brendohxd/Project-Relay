# Contributing

Project Relay is in protocol-design pre-alpha. Small, reviewable contributions are preferred.

## Before opening a change

1. Read `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, and `docs/PUBLICATION_BOUNDARY.md`.
2. Keep one question or behavioural change per pull request.
3. Do not include confidential research, credentials, personal information, or copied proprietary prompts.
4. Add or update tests for protocol behaviour.
5. Run `npm run check`.

## Commit and review requirements

- Explain the invariant being changed, not only the files edited.
- Record compatibility implications when a schema changes.
- Do not weaken a validation rule merely to make a fixture pass.
- A contributor must not be the sole reviewer of evidence they produced.
- Generated claims must disclose meaningful AI assistance.

## Schema compatibility

Schemas use semantic versions in `schema_version`. Until `1.0.0`, breaking changes are allowed but must include migration notes. After `1.0.0`, breaking changes require a new major protocol version.

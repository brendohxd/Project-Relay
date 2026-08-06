# Remote Relay MCP prototype

This package is a deliberately constrained remote interoperability test for
Project Relay. It exposes a stateless Streamable HTTP MCP endpoint backed by
Cloudflare D1.

## Boundary

- Target endpoint: `https://relay.itsm-cosmology.com/mcp`.
- Initial deployment: a private `workers.dev` test URL.
- Stored data: synthetic, public-safe Relay records only.
- Writable kinds: task, event, evidence, and review.
- Hybrid task timeline: each accepted record is also committed to an immutable,
  task-scoped cross-kind timeline. Per-kind append chains remain intact, while
  the timeline supplies an ordered comparison surface for multiple models.
- Human decision writes: disabled.
- ITSM equations, datasets, results, manuscripts, and scientific decisions:
  prohibited.
- The `.org` scientific publication surface is untouched.

The prototype uses pre-shared bearer tokens solely for the first private
interoperability test. Production use requires the reviewed OAuth 2.1 path.

## Local setup

Create the D1 database, then replace the placeholder database ID in
`wrangler.jsonc`:

```powershell
npm --workspace @project-relay/remote-mcp-server exec wrangler d1 create project-relay-prototype
```

Apply the schema locally:

```powershell
npm --workspace @project-relay/remote-mcp-server exec wrangler d1 migrations apply RELAY_DB --local
```

Configure `RELAY_CLIENT_KEYS` as a Wrangler secret. Its JSON object is keyed
by the SHA-256 digest of each client's bearer token:

```json
{
  "<sha256-of-token>": {
    "actor_id": "model:codex",
    "actor_type": "model",
    "capabilities": ["relay.read", "relay.write"]
  }
}
```

Never commit the tokens, their local plaintext values, or the secret JSON.
Give each client its own random token. The endpoint rejects anonymous access.

For an additive client rollout, configure `RELAY_ADDITIONAL_CLIENT_KEYS` with
 the same JSON shape. The Worker combines it with the primary mapping, allowing
 a new client to be enabled without replacing the existing secret or disrupting
 an already connected client. Duplicate token hashes resolve to the primary
 mapping; do not reuse credentials between clients.

Run locally:

```powershell
npm --workspace @project-relay/remote-mcp-server run dev
```

Deploy only after local tests, a threat-model review, creation of the real D1
binding, and explicit approval. Moving DNS to Cloudflare and attaching the
custom domain are later operations and must preserve the existing
`www.itsm-cosmology.com` GitHub Pages record.

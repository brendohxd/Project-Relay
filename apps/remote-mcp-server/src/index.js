import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

import { createRelayService, sha256Text } from "./core.js";
import { D1RelayStore } from "./d1-store.js";

const VERSION = "0.1.0";
const recordKind = z.enum(["task", "event", "evidence", "review"]);

function result(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError
  };
}

async function authenticate(request, clientsJson) {
  if (!clientsJson) throw Object.assign(new Error("RELAY_CLIENT_KEYS is not configured"), { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]{24,256})$/.exec(header);
  if (!match) throw Object.assign(new Error("Bearer authorization required"), { status: 401 });
  let clients;
  try {
    clients = JSON.parse(clientsJson);
  } catch {
    throw Object.assign(new Error("RELAY_CLIENT_KEYS is invalid"), { status: 503 });
  }
  const tokenHash = await sha256Text(match[1]);
  const principal = clients[tokenHash];
  if (!principal || typeof principal.actor_id !== "string" || !Array.isArray(principal.capabilities)) {
    throw Object.assign(new Error("unknown Relay client"), { status: 403 });
  }
  return {
    actorId: principal.actor_id,
    actorType: principal.actor_type ?? "model",
    capabilities: principal.capabilities
  };
}

function createServer(env, principal) {
  const server = new McpServer({ name: "project-relay-remote-prototype", version: VERSION });
  const service = createRelayService({ store: new D1RelayStore(env.RELAY_DB) });

  server.registerTool(
    "relay_remote_status",
    {
      description: "Return the authenticated Relay prototype boundary and capabilities.",
      inputSchema: {}
    },
    async () => result({
      version: VERSION,
      stage: env.RELAY_STAGE ?? "prototype",
      storage: "Cloudflare D1",
      transport: "Streamable HTTP",
      actor: { id: principal.actorId, type: principal.actorType },
      capabilities: principal.capabilities,
      writable_kinds: ["task", "event", "evidence", "review"],
      human_decision_writes_enabled: false,
      target_endpoint: "https://relay.itsm-cosmology.com/mcp",
      publication_boundary: "Synthetic and public-safe Relay records only; ITSM scientific canon remains separate."
    })
  );

  server.registerTool(
    "relay_list_records",
    {
      description: "List recent records from one authorized Relay workspace.",
      inputSchema: {
        workspaceId: z.string(),
        taskId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional()
      }
    },
    async (input) => {
      try {
        return result({ records: await service.list(input, principal) });
      } catch (error) {
        return result({ error: error.message, code: error.code ?? "READ_FAILED" }, true);
      }
    }
  );

  server.registerTool(
    "relay_get_record",
    {
      description: "Read one record by workspace and record identifier.",
      inputSchema: { workspaceId: z.string(), recordId: z.string() }
    },
    async (input) => {
      try {
        return result({ record: await service.get(input, principal) });
      } catch (error) {
        return result({ error: error.message, code: error.code ?? "READ_FAILED" }, true);
      }
    }
  );

  server.registerTool(
    "relay_append_record",
    {
      description: "Append one validated, idempotent, public-safe Relay record. Human decision records are not writable.",
      inputSchema: {
        workspaceId: z.string(),
        kind: recordKind,
        taskId: z.string().optional(),
        sequence: z.number().int().positive(),
        expectedPreviousHash: z.string().nullable().optional(),
        idempotencyKey: z.string(),
        document: z.record(z.string(), z.unknown())
      }
    },
    async (input) => {
      try {
        return result(await service.append(input, principal));
      } catch (error) {
        return result({
          error: error.message,
          code: error.code ?? "WRITE_FAILED",
          observed: error.observed ?? null,
          network_actions_performed: []
        }, true);
      }
    }
  );

  return server;
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "project-relay-remote-prototype", stage: env.RELAY_STAGE ?? "prototype" });
    }
    if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });

    try {
      const principal = await authenticate(request, env.RELAY_CLIENT_KEYS);
      return createMcpHandler(() => createServer(env, principal))(request, env, context);
    } catch (error) {
      return Response.json({ error: error.message }, {
        status: error.status ?? 500,
        headers: { "www-authenticate": "Bearer realm=\"Project Relay prototype\"" }
      });
    }
  }
};

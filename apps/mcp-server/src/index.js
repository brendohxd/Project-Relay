import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  DOCUMENT_KINDS,
  createRegistry,
  eventDigest,
  readDocuments,
  validateWorkspace
} from "@project-relay/protocol";
import { z } from "zod";

const VERSION = "0.1.0";
const workspace = path.resolve(process.env.RELAY_WORKSPACE ?? process.cwd());
const taskIdPattern = /^[A-Z][A-Z0-9_-]{1,31}-[0-9]{4,}$/;
const eventTypes = [
  "task.created",
  "task.ready",
  "task.claimed",
  "task.started",
  "task.submitted",
  "review.requested",
  "review.recorded",
  "reproduction.recorded",
  "remediation.requested",
  "decision.recorded",
  "task.blocked",
  "task.cancelled",
  "record.superseded"
];

const actorSchema = z.object({
  id: z.string().min(2).max(128),
  type: z.enum(["human", "model", "service"]),
  role: z.string().min(2).max(100),
  provider: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(200).optional()
});

const registryPromise = createRegistry();
const server = new McpServer({ name: "project-relay", version: VERSION });

function result(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError
  };
}

server.registerTool(
  "relay_list_tasks",
  {
    title: "List Relay tasks",
    description: "List task summaries from the configured read-only Relay workspace.",
    inputSchema: {}
  },
  async () => {
    const registry = await registryPromise;
    const loaded = await readDocuments(path.join(workspace, "relay/tasks"));
    const tasks = loaded.documents.map(({ document, file }) => ({
      id: document.id,
      title: document.title,
      state: document.state,
      risk: document.risk,
      valid: registry.validate("task", document).valid,
      file: path.relative(workspace, file)
    }));
    return result({ workspace, tasks, issues: loaded.issues });
  }
);

server.registerTool(
  "relay_get_task",
  {
    title: "Get Relay task",
    description: "Read and validate one task by its Relay identifier.",
    inputSchema: { id: z.string() }
  },
  async ({ id }) => {
    if (!taskIdPattern.test(id)) {
      return result({ error: "Invalid Relay task identifier" }, true);
    }

    try {
      const document = JSON.parse(
        await readFile(path.join(workspace, "relay/tasks", `${id}.json`), "utf8")
      );
      const validation = (await registryPromise).validate("task", document);
      return result({ document, validation }, !validation.valid);
    } catch (error) {
      return result({ error: error.message, id }, true);
    }
  }
);

server.registerTool(
  "relay_validate_document",
  {
    title: "Validate Relay document",
    description: "Validate a proposed Relay document without writing it.",
    inputSchema: {
      kind: z.enum(DOCUMENT_KINDS),
      document: z.record(z.string(), z.unknown())
    }
  },
  async ({ kind, document }) => {
    const validation = (await registryPromise).validate(kind, document);
    return result(validation, !validation.valid);
  }
);

server.registerTool(
  "relay_verify_workspace",
  {
    title: "Verify Relay workspace",
    description: "Validate all Relay documents and event chains in the configured workspace.",
    inputSchema: {}
  },
  async () => {
    const verification = await validateWorkspace(workspace);
    return result(verification, !verification.valid);
  }
);

server.registerTool(
  "relay_prepare_event",
  {
    title: "Prepare Relay event",
    description:
      "Prepare and hash a proposed event without writing or committing it. A client or human must still review and publish it.",
    inputSchema: {
      taskId: z.string().regex(taskIdPattern),
      sequence: z.number().int().positive(),
      type: z.enum(eventTypes),
      actor: actorSchema,
      previousEventHash: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
      payload: z.record(z.string(), z.unknown())
    }
  },
  async ({ taskId, sequence, type, actor, previousEventHash, payload }) => {
    const event = {
      schema_version: VERSION,
      id: `EVT-${randomUUID()}`,
      task_id: taskId,
      sequence,
      type,
      actor,
      occurred_at: new Date().toISOString(),
      previous_event_hash: previousEventHash ?? null,
      payload,
      event_hash: ""
    };
    event.event_hash = eventDigest(event);

    const validation = (await registryPromise).validate("event", event);
    return result({ event, validation }, !validation.valid);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

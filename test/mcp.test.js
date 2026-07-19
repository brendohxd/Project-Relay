import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP exposes the M1 task resource and bounded review prompt", async () => {
  const client = new Client({ name: "project-relay-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("apps/mcp-server/src/index.js")],
    cwd: process.cwd(),
    env: { ...process.env, RELAY_WORKSPACE: path.resolve("examples/m1") },
    stderr: "pipe"
  });

  try {
    await client.connect(transport);
    const resources = await client.listResources();
    assert.ok(resources.resources.some((item) => item.uri === "relay://project/status"));
    const projectResource = await client.readResource({ uri: "relay://project/status" });
    const projectStatus = JSON.parse(projectResource.contents[0].text);
    assert.equal(projectStatus.summary.current_milestone, "M1");
    assert.equal(projectStatus.pilots[0].visibility, "operational-summary-only");

    const statusTool = await client.callTool({ name: "relay_get_project_status", arguments: {} });
    assert.equal(statusTool.isError, false);
    assert.equal(statusTool.structuredContent.summary.current_milestone, "M1");
    const templates = await client.listResourceTemplates();
    assert.ok(
      templates.resourceTemplates.some(
        (template) => template.uriTemplate === "relay://tasks/{id}"
      )
    );

    const resource = await client.readResource({ uri: "relay://tasks/RELAY-1001" });
    const packet = JSON.parse(resource.contents[0].text);
    assert.equal(packet.policy.derived_state, "accepted");
    assert.equal(packet.policy.valid, true);

    const prompts = await client.listPrompts();
    assert.ok(prompts.prompts.some((prompt) => prompt.name === "relay_review_task"));
    const prompt = await client.getPrompt({
      name: "relay_review_task",
      arguments: { taskId: "RELAY-1001" }
    });
    assert.match(prompt.messages[0].content.text, /Do not make or imply the final human decision/);

    const prepared = await client.callTool({
      name: "relay_prepare_event",
      arguments: {
        taskId: "RELAY-1001",
        sequence: 13,
        type: "record.superseded",
        actor: {
          id: "service:relay-test",
          type: "service",
          role: "fixture",
          capabilities: ["relay.event.prepare"]
        },
        previousEventHash: "a".repeat(64),
        causalLinks: [
          {
            relation: "supersedes",
            targetEventId: "EVT-m1event00011",
            note: "Synthetic MCP coverage"
          }
        ],
        payload: {}
      }
    });
    assert.equal(prepared.structuredContent.validation.valid, true);
    assert.deepEqual(prepared.structuredContent.event.actor.capabilities, ["relay.event.prepare"]);
    assert.equal(
      prepared.structuredContent.event.causal_links[0].target_event_id,
      "EVT-m1event00011"
    );
  } finally {
    await client.close();
  }
});

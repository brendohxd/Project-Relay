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
  } finally {
    await client.close();
  }
});

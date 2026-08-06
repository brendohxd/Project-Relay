import assert from "node:assert/strict";
import test from "node:test";

import { createRelayService, MemoryRelayStore } from "../src/core.js";
import { createSlackProjector, formatSlackProjection } from "../src/slack-projector.js";

const writer = { actorId: "model:grok", actorType: "model", capabilities: ["relay.read", "relay.write", "relay.slack.project"] };
const otherWriter = { actorId: "model:codex", actorType: "model", capabilities: ["relay.read", "relay.write", "relay.slack.project"] };

function record() {
  return { record_id: "REV-7001", kind: "review", task_scope: "RELAY-7001", actor: { id: "model:grok" }, document: { id: "REV-7001", assessment: "safe <untrusted> summary" }, content_hash: "a".repeat(64) };
}

test("Slack projector stays disabled without a configured token and channel allowlist", async () => {
  const projector = createSlackProjector({ botToken: undefined, allowedChannelsJson: undefined, fetchImpl: () => assert.fail("must not call Slack") });
  await assert.rejects(projector({ record: record(), channelId: "G0123456789" }), (error) => error.code === "SLACK_NOT_CONFIGURED");
});

test("Slack projector posts plain text only to an approved channel", async () => {
  let request;
  const projector = createSlackProjector({ botToken: "xoxb-test-secret", allowedChannelsJson: JSON.stringify(["G0123456789"]), fetchImpl: async (url, init) => {
    request = { url, init };
    return Response.json({ ok: true, ts: "1710000000.000001", message: { thread_ts: "1710000000.000001" } });
  } });
  const receipt = await projector({ record: record(), channelId: "G0123456789" });
  assert.equal(request.url, "https://slack.com/api/chat.postMessage");
  assert.equal(request.init.headers.authorization, "Bearer xoxb-test-secret");
  assert.deepEqual(JSON.parse(request.init.body), { channel: "G0123456789", text: formatSlackProjection(record()), mrkdwn: false, unfurl_links: false, unfurl_media: false });
  assert.equal(receipt.message_ts, "1710000000.000001");
});

test("Slack projector rejects non-allowlisted channels before calling Slack", async () => {
  const projector = createSlackProjector({ botToken: "xoxb-test-secret", allowedChannelsJson: JSON.stringify(["G0123456789"]), fetchImpl: () => assert.fail("must not call Slack") });
  await assert.rejects(projector({ record: record(), channelId: "C0123456789" }), (error) => error.code === "SLACK_CHANNEL_FORBIDDEN");
});

test("a model cannot project another model's Relay record", async () => {
  const relay = createRelayService({ store: new MemoryRelayStore(), clock: () => "2026-08-07T00:00:00.000Z" });
  await relay.append({ workspaceId: "relay-test", kind: "review", sequence: 1, expectedPreviousHash: null, idempotencyKey: "grok:relay-7001:review", document: { id: "REV-7001", assessment: "safe" } }, writer);
  await assert.rejects(relay.projectRecordToSlack({ workspaceId: "relay-test", recordId: "REV-7001", channelId: "G0123456789" }, otherWriter, async () => assert.fail("must not project")), (error) => error.code === "RECORD_NOT_OWNED");
});
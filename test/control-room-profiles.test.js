import test from "node:test";
import assert from "node:assert/strict";

import {
  getControlRoomProfile,
  listControlRoomProfiles
} from "../packages/knowledge-hub/src/control-room-profiles.js";

test("local, Notion, and Slack are interchangeable control-room profiles", () => {
  assert.deepEqual(
    listControlRoomProfiles().map((profile) => profile.id),
    ["local", "notion", "slack"]
  );
});

test("every control room is a non-authoritative projection", () => {
  for (const profile of listControlRoomProfiles()) {
    assert.equal(profile.canonical_authority, false, profile.id);
    assert.equal(profile.write_confirmation_default, true, profile.id);
    assert.ok(profile.outbound.includes("projection"), profile.id);
  }
});

test("Slack declares conversation and interactive request capabilities", () => {
  const slack = getControlRoomProfile("slack");
  assert.ok(slack.strengths.includes("threaded-response"));
  assert.ok(slack.surfaces.includes("interactive-actions"));
  assert.ok(slack.inbound.includes("events"));
  assert.ok(slack.outbound.includes("interactive-request"));
});

test("control-room profile reads cannot mutate shared definitions", () => {
  const profile = getControlRoomProfile("slack");
  profile.strengths.push("canonical-authority");
  assert.equal(getControlRoomProfile("slack").strengths.includes("canonical-authority"), false);
});

test("unknown control-room profiles fail closed", () => {
  assert.throws(() => getControlRoomProfile("unknown"), /unknown control-room profile/);
});

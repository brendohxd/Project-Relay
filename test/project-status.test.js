import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deriveProjectStatus,
  loadProjectStatus,
  renderProjectStatus,
  validateStatusSemantics
} from "../scripts/project-status-lib.mjs";

const source = JSON.parse(await readFile("project/status.json", "utf8"));

test("canonical project status validates and identifies the current milestone", async () => {
  const status = await loadProjectStatus();
  assert.equal(status.milestones[0].summary.state, "complete");
  assert.equal(status.summary.current_milestone, "M2");
  assert.equal(status.summary.counts.blocked, 0);
});

test("generated status preserves the ITSM publication boundary", () => {
  const markdown = renderProjectStatus(deriveProjectStatus(source));
  assert.match(markdown, /operational-summary-only/);
  assert.match(markdown, /ITSM equations, claims, datasets, results, manuscripts/);
});

test("semantic validation rejects unsupported state claims and duplicate ids", () => {
  const invalid = structuredClone(source);
  invalid.milestones[0].items[0].evidence = [];
  invalid.pilots[0].items[3].blocker = undefined;
  invalid.milestones[2].items[2].id = invalid.milestones[0].items[1].id;
  invalid.milestones[5].items[0].rationale = undefined;
  const messages = validateStatusSemantics(invalid).map(({ message }) => message);
  assert.ok(messages.some((message) => message.includes("done items require")));
  assert.ok(messages.some((message) => message.includes("blocked items require")));
  assert.ok(messages.some((message) => message.includes("duplicate id")));
  assert.ok(messages.some((message) => message.includes("deferred items require")));
});

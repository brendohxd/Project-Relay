import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { TOOL_CATALOG } from "../apps/relay-cli/src/catalog.js";
import { discoveryRoots, scanTools } from "../apps/relay-cli/src/scanner.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "relay-cli-discovery-"));
  const home = path.join(root, "User");
  const localAppData = path.join(home, "AppData", "Local");
  const roamingAppData = path.join(home, "AppData", "Roaming");
  const programFiles = path.join(root, "Program Files");
  const programFilesX86 = path.join(root, "Program Files (x86)");
  await Promise.all([home, localAppData, roamingAppData, programFiles, programFilesX86].map((directory) => mkdir(directory, { recursive: true })));
  return {
    root,
    home,
    environment: {
      LOCALAPPDATA: localAppData,
      APPDATA: roamingAppData,
      ProgramFiles: programFiles,
      "ProgramFiles(x86)": programFilesX86,
      PATH: ""
    }
  };
}

test("connector catalogue covers major hosted, desktop, editor, and local tools", () => {
  const ids = new Set(TOOL_CATALOG.map(({ id }) => id));
  for (const required of ["codex", "claude", "gemini", "kimi", "perplexity", "manus", "grok", "cursor", "windsurf", "vscode", "ollama", "lm-studio"]) {
    assert.equal(ids.has(required), true, required);
  }
});

test("standard discovery identifies known application and nested MCP locations without reading contents", async (context) => {
  const sample = await fixture();
  context.after(() => rm(sample.root, { recursive: true, force: true }));
  const kimi = path.join(sample.environment.LOCALAPPDATA, "Kimi");
  const cursor = path.join(sample.home, ".cursor");
  await mkdir(path.join(kimi, "User Data"), { recursive: true });
  await mkdir(cursor, { recursive: true });
  await writeFile(path.join(cursor, "mcp.json"), "THIS IS DELIBERATELY NOT JSON AND MUST NOT BE READ", "utf8");

  const report = await scanTools({ home: sample.home, environment: sample.environment });
  const ids = new Set(report.tools.map(({ tool_id }) => tool_id));
  const cursorResult = report.tools.find(({ tool_id }) => tool_id === "cursor");

  assert.equal(ids.has("kimi"), true);
  assert.equal(ids.has("cursor"), true);
  assert.ok(cursorResult.findings.some(({ kind }) => kind === "mcp_config_candidate"));
  assert.deepEqual(report.privacy, { file_contents_read: false, symbolic_links_followed: false });
});

test("custom locations are detected by application names", async (context) => {
  const sample = await fixture();
  context.after(() => rm(sample.root, { recursive: true, force: true }));
  const custom = path.join(sample.root, "Portable Apps", "Perplexity Portable");
  await mkdir(custom, { recursive: true });

  const report = await scanTools({
    home: sample.home,
    environment: sample.environment,
    customLocations: [custom]
  });

  assert.ok(report.tools.some(({ tool_id }) => tool_id === "perplexity"));
  assert.deepEqual(report.unmatched_custom_locations, []);
});

test("unrecognised custom locations are reported instead of guessed", async (context) => {
  const sample = await fixture();
  context.after(() => rm(sample.root, { recursive: true, force: true }));
  const custom = path.join(sample.root, "Mystery Application");
  await mkdir(custom, { recursive: true });

  const report = await scanTools({ home: sample.home, environment: sample.environment, customLocations: [custom] });
  assert.deepEqual(report.unmatched_custom_locations, [path.resolve(custom)]);
});

test("broad user-folder discovery requires explicit confirmation", async () => {
  await assert.rejects(() => scanTools({ scope: "broad" }), /BROAD_SCAN_CONFIRMATION_REQUIRED/);
});

test("standard roots exclude personal folders while confirmed broad roots include them", async (context) => {
  const sample = await fixture();
  context.after(() => rm(sample.root, { recursive: true, force: true }));
  const standard = discoveryRoots({ home: sample.home, environment: sample.environment });
  const broad = discoveryRoots({ home: sample.home, environment: sample.environment, scope: "broad" });

  assert.equal(standard.includes(path.join(sample.home, "Desktop")), false);
  assert.equal(broad.includes(path.resolve(sample.home, "Desktop")), true);
  assert.equal(broad.includes(path.resolve(sample.environment.APPDATA)), true);
});

test("scan limits reject unbounded values", async () => {
  await assert.rejects(() => scanTools({ maxDepth: 99 }), /maxDepth/);
  await assert.rejects(() => scanTools({ maxEntries: 1000000 }), /maxEntries/);
});

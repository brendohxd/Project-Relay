import test from "node:test";
import assert from "node:assert/strict";

import {
  renderBanner,
  renderDiscoveryReport,
  terminalCapabilities
} from "../apps/relay-cli/src/terminal-ui.js";

const report = {
  scope: "standard",
  scanned_roots: ["C:\\Program Files"],
  limits: { max_depth: 2, max_entries: 15000 },
  truncated: false,
  privacy: { file_contents_read: false, symbolic_links_followed: false },
  tools: [{
    tool_id: "kimi",
    display_name: "Kimi",
    transports: ["manual-packet"],
    process_names: ["Kimi.exe"],
    findings: [{
      path: "C:\\Apps\\Kimi",
      kind: "application_or_data_directory",
      detected_tools: [{ tool_id: "kimi", confidence: "high" }]
    }]
  }],
  unmatched_custom_locations: []
};

test("terminal UI renders a visual discovery dashboard", () => {
  const rendered = renderDiscoveryReport(report, { color: true, unicode: true });
  assert.match(rendered, /PROJECT RELAY/);
  assert.match(rendered, /SCAN SUMMARY/);
  assert.match(rendered, /METADATA ONLY/);
  assert.match(rendered, /Kimi/);
  assert.match(rendered, /\u001b\[/);
});

test("non-colour output contains no ANSI escapes", () => {
  const rendered = renderDiscoveryReport(report, { color: false, unicode: true });
  assert.doesNotMatch(rendered, /\u001b\[/);
});

test("NO_COLOR and redirected output disable colour", () => {
  assert.deepEqual(
    terminalCapabilities({ stdout: { isTTY: true }, environment: { NO_COLOR: "1" } }),
    { color: false, unicode: true }
  );
  assert.equal(terminalCapabilities({ stdout: { isTTY: false }, environment: {} }).color, false);
});

test("dumb terminals receive an ASCII banner", () => {
  const capabilities = terminalCapabilities({ stdout: { isTTY: true }, environment: { TERM: "dumb" } });
  assert.equal(capabilities.unicode, false);
  assert.match(renderBanner(capabilities), /^=== PROJECT RELAY/);
});

const ANSI = Object.freeze({
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  magenta: "\u001b[35m",
  red: "\u001b[31m"
});

function painter(enabled) {
  return (style, value) => enabled ? `${ANSI[style]}${value}${ANSI.reset}` : String(value);
}

function visibleLength(value) {
  return String(value).replaceAll(/\u001b\[[0-9;]*m/g, "").length;
}

function pad(value, width) {
  return String(value) + " ".repeat(Math.max(0, width - visibleLength(value)));
}

function box(title, rows, { color, width = 76 }) {
  const paint = painter(color);
  const inner = width - 2;
  const heading = ` ${title} `;
  const top = `╭${heading}${"─".repeat(Math.max(0, inner - heading.length))}╮`;
  const body = rows.map((row) => `│${pad(` ${row}`, inner)}│`);
  return [paint("cyan", top), ...body, paint("cyan", `╰${"─".repeat(inner)}╯`)].join("\n");
}

export function terminalCapabilities({ stdout = process.stdout, environment = process.env } = {}) {
  return {
    color: Boolean(stdout.isTTY) && environment.NO_COLOR === undefined && environment.TERM !== "dumb",
    unicode: environment.TERM !== "dumb"
  };
}

export function renderBanner(capabilities) {
  const paint = painter(capabilities.color);
  if (!capabilities.unicode) return paint("cyan", "=== PROJECT RELAY :: AI TOOL DISCOVERY ===");
  return box("PROJECT RELAY", [
    paint("bold", "AI Tool Discovery and Control Centre"),
    paint("dim", "Provider-neutral • metadata-only scan • no changes without approval")
  ], { color: capabilities.color });
}

export function renderScanStart(scope, capabilities) {
  const paint = painter(capabilities.color);
  const icon = capabilities.unicode ? "◌" : "*";
  return `${paint("cyan", icon)} Scanning ${paint("bold", scope)} locations within configured limits...`;
}

export function renderCatalog(catalogue, capabilities) {
  const paint = painter(capabilities.color);
  const lines = [renderBanner(capabilities), "", paint("bold", `CONNECTOR CATALOGUE  ${catalogue.tools.length} tools`), ""];
  for (const tool of catalogue.tools) {
    const icon = capabilities.unicode ? "◆" : ">";
    lines.push(`${paint("magenta", icon)} ${paint("bold", tool.name)} ${paint("dim", `[${tool.id}]`)}`);
    lines.push(`  ${paint("dim", "transports")}  ${tool.transports.join("  •  ")}`);
  }
  return lines.join("\n");
}

export function renderDiscoveryReport(report, capabilities) {
  const paint = painter(capabilities.color);
  const privacy = report.privacy.file_contents_read ? paint("red", "CONTENT READ") : paint("green", "METADATA ONLY");
  const state = report.truncated ? paint("yellow", "LIMIT REACHED") : paint("green", "COMPLETE");
  const lines = [
    renderBanner(capabilities),
    "",
    box("SCAN SUMMARY", [
      `Scope       ${paint("bold", report.scope.toUpperCase())}`,
      `Privacy     ${privacy}`,
      `Roots       ${report.scanned_roots.length}`,
      `Limits      depth ${report.limits.max_depth} • entries ${report.limits.max_entries}`,
      `Status      ${state}`,
      `Detected    ${paint("bold", report.tools.length)} tool${report.tools.length === 1 ? "" : "s"}`
    ], { color: capabilities.color }),
    ""
  ];

  if (report.tools.length === 0) lines.push(paint("yellow", "○ No recognised tools were found."));
  for (const tool of report.tools) {
    const icon = capabilities.unicode ? "●" : "+";
    lines.push(`${paint("green", icon)} ${paint("bold", tool.display_name)} ${paint("dim", `[${tool.tool_id}]`)}`);
    lines.push(`  ${paint("dim", "transfer")}  ${tool.transports.join("  •  ")}`);
    lines.push(`  ${paint("dim", "restart")}   ${tool.process_names.length ? tool.process_names.join(", ") : "not declared"}`);
    for (const found of tool.findings) {
      const confidence = found.detected_tools.find(({ tool_id: id }) => id === tool.tool_id)?.confidence ?? "unknown";
      const badgeStyle = confidence === "high" ? "green" : confidence === "medium" ? "yellow" : "dim";
      lines.push(`    ${paint(badgeStyle, confidence.toUpperCase().padEnd(6))} ${found.kind}`);
      lines.push(`           ${paint("dim", found.path)}`);
    }
    lines.push("");
  }

  if (report.unmatched_custom_locations.length > 0) {
    lines.push(paint("yellow", "UNRECOGNISED CUSTOM LOCATIONS"));
    for (const location of report.unmatched_custom_locations) lines.push(`  ? ${location}`);
    lines.push("");
  }
  lines.push(paint("dim", "No changes applied • MCP setup, process restart, and archive ingestion require separate approval"));
  return lines.join("\n");
}

import { lstat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { TOOL_CATALOG } from "./catalog.js";

const MCP_NAMES = new Set(["mcp.json", "mcp_config.json", "claude_desktop_config.json"]);
const CONVERSATION_MARKERS = ["history", "session", "conversation", "chat", "workspaceStorage", "projects", "tasks"];

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.resolve(value)))];
}

function templateValues({ environment, home }) {
  return {
    home,
    localAppData: environment.LOCALAPPDATA,
    roamingAppData: environment.APPDATA,
    programFiles: environment.ProgramFiles,
    programFilesX86: environment["ProgramFiles(x86)"]
  };
}

function expandTemplate(template, values) {
  let expanded = template;
  for (const [name, value] of Object.entries(values)) {
    if (!value && expanded.includes(`{${name}}`)) return null;
    expanded = expanded.replaceAll(`{${name}}`, value ?? "");
  }
  return path.normalize(expanded);
}

async function exists(target) {
  try {
    return await lstat(target);
  } catch {
    return null;
  }
}

async function expandWildcard(candidate) {
  if (!candidate?.endsWith("*")) return [candidate];
  const parent = path.dirname(candidate);
  const prefix = path.basename(candidate).slice(0, -1).toLowerCase();
  try {
    const entries = await readdir(parent, { withFileTypes: true });
    return entries
      .filter((entry) => entry.name.toLowerCase().startsWith(prefix))
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

function detectTools(target) {
  const normalized = target.toLowerCase().replaceAll("_", " ").replaceAll("-", " ");
  const basename = path.basename(target).toLowerCase();
  const matches = [];
  for (const tool of TOOL_CATALOG) {
    let score = 0;
    for (const alias of tool.aliases) {
      if (basename.includes(alias.toLowerCase())) score += 4;
      else if (normalized.includes(alias.toLowerCase())) score += 1;
    }
    if (tool.executables.some((name) => basename === name.toLowerCase())) score += 8;
    if (tool.markers.some((name) => basename === name.toLowerCase())) score += 3;
    if (score > 0) matches.push({ tool_id: tool.id, display_name: tool.name, confidence: score >= 8 ? "high" : score >= 4 ? "medium" : "low", score });
  }
  return matches.sort((left, right) => right.score - left.score || left.tool_id.localeCompare(right.tool_id));
}

function classify(target, stats) {
  const name = path.basename(target).toLowerCase();
  if (stats.isFile() && (name.endsWith(".exe") || name.endsWith(".cmd"))) return "executable";
  if (MCP_NAMES.has(name) || name.includes("mcp")) return "mcp_config_candidate";
  if (CONVERSATION_MARKERS.some((marker) => name.includes(marker.toLowerCase()))) return "conversation_store_candidate";
  if (["settings.json", "config.json", "config.toml", "config.yaml"].includes(name)) return "config_candidate";
  return stats.isDirectory() ? "application_or_data_directory" : "related_file";
}

function finding(target, stats, source, forcedTool = null) {
  const detected = forcedTool
    ? [{ tool_id: forcedTool.id, display_name: forcedTool.name, confidence: "high", score: 10 }]
    : detectTools(target);
  return {
    path: path.resolve(target),
    source,
    kind: classify(target, stats),
    detected_tools: detected.map(({ score: ignored, ...match }) => (void ignored, match)),
    content_read: false
  };
}

async function boundedWalk(root, { source, maxDepth, budget, results }) {
  const rootStats = await exists(root);
  if (!rootStats) return;
  const queue = [{ target: root, depth: 0, stats: rootStats }];
  while (queue.length > 0 && budget.remaining > 0) {
    const current = queue.shift();
    budget.remaining -= 1;
    if (detectTools(current.target).length > 0) {
      results.push(finding(current.target, current.stats, source));
    }
    if (!current.stats.isDirectory() || current.stats.isSymbolicLink() || current.depth >= maxDepth) continue;
    let entries;
    try {
      entries = await readdir(current.target, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (budget.remaining <= 0) break;
      if (entry.isSymbolicLink()) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const target = path.join(current.target, entry.name);
      queue.push({ target, depth: current.depth + 1, stats: entry });
    }
  }
}

export function discoveryRoots({ environment = process.env, home = os.homedir(), scope = "standard" } = {}) {
  const standard = unique([
    environment.ProgramFiles,
    environment["ProgramFiles(x86)"],
    environment.LOCALAPPDATA && path.join(environment.LOCALAPPDATA, "Programs")
  ]);
  if (scope !== "broad") return standard;
  return unique([
    ...standard,
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    environment.LOCALAPPDATA,
    environment.APPDATA
  ]);
}

export async function scanTools({
  environment = process.env,
  home = os.homedir(),
  scope = "standard",
  broadAuthorized = false,
  customLocations = [],
  maxDepth = scope === "broad" ? 4 : 2,
  maxEntries = scope === "broad" ? 50000 : 15000
} = {}) {
  if (!new Set(["standard", "broad"]).has(scope)) throw new RangeError(`unknown scan scope: ${scope}`);
  if (scope === "broad" && !broadAuthorized) {
    throw new Error("BROAD_SCAN_CONFIRMATION_REQUIRED");
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 8) throw new RangeError("maxDepth must be between 0 and 8");
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 250000) throw new RangeError("maxEntries must be between 1 and 250000");

  const results = [];
  const knownBudget = { remaining: Math.min(maxEntries, 10000) };
  const values = templateValues({ environment, home });
  for (const tool of TOOL_CATALOG) {
    for (const location of tool.locations) {
      const expanded = expandTemplate(location, values);
      for (const candidate of await expandWildcard(expanded)) {
        if (!candidate) continue;
        const stats = await exists(candidate);
        if (stats) {
          results.push(finding(candidate, stats, "known-location", tool));
          if (stats.isDirectory()) {
            await boundedWalk(candidate, { source: "known-location", maxDepth: Math.min(maxDepth + 1, 4), budget: knownBudget, results });
          }
        }
      }
    }
    const pathParts = String(environment.PATH ?? "").split(path.delimiter).filter(Boolean);
    for (const directory of pathParts) {
      for (const executable of tool.executables) {
        const candidate = path.join(directory, executable);
        const stats = await exists(candidate);
        if (stats?.isFile()) results.push(finding(candidate, stats, "path", tool));
      }
    }
  }

  const budget = { remaining: maxEntries };
  const scannedRoots = [];
  for (const root of discoveryRoots({ environment, home, scope })) {
    scannedRoots.push(root);
    await boundedWalk(root, { source: scope === "broad" ? "broad-root" : "program-root", maxDepth, budget, results });
  }
  for (const custom of unique(customLocations)) {
    scannedRoots.push(custom);
    await boundedWalk(custom, { source: "custom", maxDepth, budget, results });
  }

  const deduplicated = [...new Map(results.map((entry) => [entry.path.toLowerCase(), entry])).values()]
    .sort((left, right) => left.path.localeCompare(right.path));
  const tools = TOOL_CATALOG.map((tool) => {
    const matches = deduplicated.filter((entry) => entry.detected_tools.some(({ tool_id: id }) => id === tool.id));
    return {
      tool_id: tool.id,
      display_name: tool.name,
      detected: matches.length > 0,
      transports: tool.transports,
      process_names: tool.processNames,
      findings: matches
    };
  }).filter(({ detected }) => detected);

  return {
    report_version: "relay-discovery/0.1",
    platform: process.platform,
    scope,
    scanned_roots: unique(scannedRoots),
    limits: { max_depth: maxDepth, max_entries: maxEntries },
    truncated: budget.remaining === 0,
    privacy: { file_contents_read: false, symbolic_links_followed: false },
    tools,
    unmatched_custom_locations: unique(customLocations).filter((custom) => !deduplicated.some((entry) => entry.source === "custom" && entry.path.startsWith(path.resolve(custom))))
  };
}

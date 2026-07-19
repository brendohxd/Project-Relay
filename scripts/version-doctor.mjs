import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { classifyUpdate, compareVersions, parseVersion, readDependencyInventory } from "./version-doctor-lib.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "check";
if (!new Set(["check", "update"]).has(mode)) {
  console.error("Usage: npm run versions:check | npm run versions:update");
  process.exit(2);
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Version metadata request failed (${response.status}): ${url}`);
  return response.json();
}

async function registryLatest(packageName) {
  const metadata = await getJson(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`);
  if (!parseVersion(metadata.version)) throw new Error(`Registry returned an invalid version for ${packageName}`);
  return metadata.version;
}

async function latestNodeLts() {
  try {
    const releases = await getJson("https://nodejs.org/dist/index.json");
    return releases.find((release) => release.lts && parseVersion(release.version))?.version.replace(/^v/, "") ?? null;
  } catch {
    return null;
  }
}

function runNpm(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is unavailable; run this command through npm.");
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: rootDirectory,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed with exit code ${result.status}.`);
}

function assertCleanWorktree() {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: rootDirectory, encoding: "utf8" }).trim();
  if (status) throw new Error("Refusing to update dependencies because the Git worktree is not clean. Commit or stash changes first.");
}

function installUpdate(item) {
  const args = ["install", "--save-exact", "--ignore-scripts"];
  if (item.dependencyType === "devDependencies") args.push("--save-dev");
  if (item.dependencyType === "optionalDependencies") args.push("--save-optional");
  if (item.workspace) args.push("--workspace", item.workspace);
  args.push(`${item.name}@${item.latest}`);
  runNpm(args);
}

const { inventory, rootManifest } = await readDependencyInventory(rootDirectory);
const registryNames = [...new Set([...inventory.filter((item) => item.queryVersion).map((item) => item.name), "npm"])];
const latestEntries = await Promise.all(registryNames.map(async (name) => [name, await registryLatest(name)]));
const latestByName = new Map(latestEntries);
const updates = [];
for (const item of inventory) {
  if (!item.queryVersion) {
    updates.push({ ...item, latest: "unknown", advisable: false, reason: "non-exact dependency requires manual review" });
    continue;
  }
  const latest = latestByName.get(item.name);
  const classification = classifyUpdate(item.current, latest);
  if (compareVersions(item.current, latest) < 0) updates.push({ ...item, latest, ...classification });
}

const currentNode = process.versions.node;
const currentNpm = process.env.npm_config_user_agent?.match(/npm\/([^ ]+)/)?.[1] ?? "unknown";
const configuredNpm = String(rootManifest.packageManager ?? "").replace(/^npm@/, "") || null;
const availableNode = await latestNodeLts();
const availableNpm = latestByName.get("npm");

console.log("Project Relay version doctor");
console.log(`Node: current ${currentNode}; project requirement ${rootManifest.engines?.node ?? "unspecified"}; latest LTS ${availableNode ?? "unavailable"}`);
console.log(`npm: current ${currentNpm}; project configuration ${configuredNpm ?? "unspecified"}; latest ${availableNpm}`);
if (availableNode && compareVersions(currentNode, availableNode) < 0) {
  console.log(`- [MANUAL REVIEW] Node.js ${currentNode} -> ${availableNode} (runtime installation is platform-specific)`);
}
if (currentNpm !== "unknown" && compareVersions(currentNpm, availableNpm) < 0) {
  console.log(`- [MANUAL REVIEW] global npm ${currentNpm} -> ${availableNpm} (global tool update)`);
}
if (configuredNpm && currentNpm !== "unknown" && compareVersions(configuredNpm, currentNpm) !== 0) {
  console.log(`- [MANUAL REVIEW] packageManager metadata ${configuredNpm} differs from active npm ${currentNpm}`);
}

if (updates.length === 0) {
  console.log("Dependencies: all direct registry dependencies are current.");
  process.exit(0);
}

console.log("\nAvailable dependency updates:");
for (const item of updates) {
  const label = item.advisable ? "RECOMMENDED" : "MANUAL REVIEW";
  console.log(`- [${label}] ${item.name}: ${item.current} -> ${item.latest} (${item.reason}; ${item.workspace ?? "root"})`);
}

const advisable = updates.filter((item) => item.advisable);
if (mode === "check") {
  console.log(`\nRecommended automatic updates: ${advisable.length}`);
  console.log("Run `npm run versions:update` to review and optionally apply them.");
  process.exit(0);
}

if (advisable.length === 0) {
  console.log("\nNo conservative updates are eligible for automatic installation.");
  process.exit(0);
}

assertCleanWorktree();
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = (await terminal.question(`\nApply ${advisable.length} recommended update(s), regenerate the lockfile, and run checks? [y/N] `)).trim().toLowerCase();
terminal.close();
if (!new Set(["y", "yes"]).has(answer)) {
  console.log("No changes made.");
  process.exit(0);
}

for (const item of advisable) installUpdate(item);
runNpm(["run", "check"]);
runNpm(["audit", "--audit-level=moderate"]);
console.log("\nUpdates applied and verified. Review `git diff`; nothing was committed or pushed.");

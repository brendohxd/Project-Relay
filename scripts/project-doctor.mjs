import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateWorkspace } from "@project-relay/protocol";
import { DOCTOR_STATUS, summarizeDoctor } from "./project-doctor-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const record = (name, status, measurement, suggestion) =>
  checks.push({ name, status, measurement, ...(suggestion ? { suggestion } : {}) });

const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const requiredNodeMajor = Number(String(manifest.engines?.node ?? "").match(/(\d+)/)?.[1]);
const currentNodeMajor = Number(process.versions.node.split(".")[0]);
record(
  "node-runtime",
  currentNodeMajor >= requiredNodeMajor ? DOCTOR_STATUS.PASS : DOCTOR_STATUS.FAIL,
  "current " + process.versions.node + "; required " + (manifest.engines?.node ?? "unknown"),
  currentNodeMajor < requiredNodeMajor ? "Install a supported Node.js runtime." : undefined
);

try {
  const version = execFileSync("git", ["--version"], { cwd: root, encoding: "utf8" }).trim();
  record("git-runtime", DOCTOR_STATUS.PASS, version);
} catch (error) {
  const inaccessible = error.code === "EPERM";
  record(
    "git-runtime",
    inaccessible ? DOCTOR_STATUS.UNKNOWN : DOCTOR_STATUS.FAIL,
    error.message,
    inaccessible
      ? "The environment blocked the Git probe; unknown is not a pass."
      : "Install Git and make it available on PATH."
  );
}

try {
  await access(path.join(root, "package-lock.json"));
  record("dependency-lock", DOCTOR_STATUS.PASS, "package-lock.json present");
} catch {
  record("dependency-lock", DOCTOR_STATUS.FAIL, "package-lock.json missing", "Regenerate and review the npm lockfile.");
}

for (const workspaceName of ["examples/minimal", "examples/m1"]) {
  try {
    const result = await validateWorkspace(path.join(root, workspaceName));
    const recordCount = Object.values(result.counts).reduce((total, count) => total + count, 0);
    record(
      "workspace:" + workspaceName,
      result.valid ? DOCTOR_STATUS.PASS : DOCTOR_STATUS.FAIL,
      result.valid ? recordCount + " validated records" : result.issues.length + " validation issue(s)",
      result.valid ? undefined : "Run npm run validate for issue details."
    );
  } catch (error) {
    record(
      "workspace:" + workspaceName,
      DOCTOR_STATUS.UNKNOWN,
      error.message,
      "Inspect the workspace manually; unknown is not a pass."
    );
  }
}

try {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
  const changed = status ? status.split(/\r?\n/).length : 0;
  record(
    "worktree",
    changed === 0 ? DOCTOR_STATUS.PASS : DOCTOR_STATUS.WARN,
    changed === 0 ? "clean" : changed + " changed path(s)",
    changed === 0 ? undefined : "Review changes before dependency updates, releases, or publication."
  );
} catch (error) {
  record(
    "worktree",
    DOCTOR_STATUS.UNKNOWN,
    error.message,
    "Inspect Git status manually; unknown is not a pass."
  );
}

console.log("Project Relay local doctor");
for (const check of checks) {
  console.log("- [" + check.status + "] " + check.name + ": " + check.measurement);
  if (check.suggestion) console.log("  " + check.suggestion);
}
const summary = summarizeDoctor(checks);
console.log(
  "Summary: " +
    summary.counts.PASS +
    " pass, " +
    summary.counts.WARN +
    " warn, " +
    summary.counts.FAIL +
    " fail, " +
    summary.counts.UNKNOWN +
    " unknown."
);
process.exitCode = summary.exitCode;

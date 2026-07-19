import fs from "node:fs/promises";
import path from "node:path";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value).trim().replace(/^v/, ""));
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  };
}

export function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  if (!left || !right) throw new Error(`Cannot compare non-semver values: ${leftValue}, ${rightValue}`);
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

export function classifyUpdate(currentValue, latestValue) {
  const current = parseVersion(currentValue);
  const latest = parseVersion(latestValue);
  if (!current || !latest) {
    return { advisable: false, reason: "non-semver version requires manual review" };
  }
  if (compareVersions(currentValue, latestValue) >= 0) {
    return { advisable: false, reason: "already current" };
  }
  if (latest.prerelease) {
    return { advisable: false, reason: "prerelease requires manual review" };
  }
  if (latest.major !== current.major) {
    return { advisable: false, reason: "major update requires manual review" };
  }
  if (current.major === 0 && latest.minor !== current.minor) {
    return { advisable: false, reason: "pre-1.0 minor update requires manual review" };
  }
  return {
    advisable: true,
    reason: current.major === 0 ? "compatible pre-1.0 patch update" : "compatible same-major update"
  };
}

export async function readDependencyInventory(rootDirectory) {
  const rootManifestPath = path.join(rootDirectory, "package.json");
  const rootManifest = JSON.parse(await fs.readFile(rootManifestPath, "utf8"));
  const manifests = [{ path: rootManifestPath, workspace: null, manifest: rootManifest }];

  for (const pattern of rootManifest.workspaces ?? []) {
    if (!pattern.endsWith("/*")) throw new Error(`Unsupported workspace pattern: ${pattern}`);
    const workspaceRoot = path.join(rootDirectory, pattern.slice(0, -2));
    let entries = [];
    try {
      entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const manifestPath = path.join(workspaceRoot, entry.name, "package.json");
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        manifests.push({ path: manifestPath, workspace: manifest.name, manifest });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  const internalPackages = new Set(manifests.map(({ manifest }) => manifest.name).filter(Boolean));
  const inventory = [];
  for (const entry of manifests) {
    for (const dependencyType of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, current] of Object.entries(entry.manifest[dependencyType] ?? {})) {
        if (internalPackages.has(name)) continue;
        inventory.push({
          name,
          current,
          queryVersion: parseVersion(current) ? current : null,
          dependencyType,
          manifestPath: entry.path,
          workspace: entry.workspace
        });
      }
    }
  }
  return { inventory, rootManifest };
}

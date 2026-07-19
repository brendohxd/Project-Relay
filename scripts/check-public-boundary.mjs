import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const forbiddenSegments = new Set([
  "private",
  "confidential",
  "secrets",
  "local-data",
  "unpublished",
  "research-private",
  "commercial-private"
]);
const forbiddenNames = [/^\.env(?:\.|$)/i, /\.(?:pem|p12|pfx)$/i, /(?:^|[-_.])private[-_.]?key$/i];
const secretPatterns = [
  { name: "private key block", pattern: /-{5}BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-{5}/ },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: "OpenAI-style key", pattern: /sk-[A-Za-z0-9_-]{32,}/ },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ }
];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "coverage"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (entry.isFile()) files.push(path.relative(root, target));
  }
  return files;
}

async function candidateFiles() {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: root }
    );
    const publicFiles = output.toString("utf8").split("\0").filter(Boolean);
    return publicFiles.length > 0 ? publicFiles : walk(root);
  } catch {
    return walk(root);
  }
}

const failures = [];
for (const relative of await candidateFiles()) {
  const normal = relative.replaceAll("\\", "/");
  const segments = normal.toLowerCase().split("/");
  const base = path.basename(normal);

  if (segments.some((segment) => forbiddenSegments.has(segment))) {
    failures.push(`${normal}: forbidden private path segment`);
    continue;
  }
  if (forbiddenNames.some((pattern) => pattern.test(base))) {
    failures.push(`${normal}: forbidden credential-like filename`);
    continue;
  }

  const metadata = await stat(path.join(root, relative));
  if (metadata.size > 2_000_000) {
    failures.push(`${normal}: exceeds the 2 MB public-source limit`);
    continue;
  }

  const content = await readFile(path.join(root, relative));
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(text)) failures.push(`${normal}: possible ${name}`);
  }
}

if (failures.length > 0) {
  console.error("Public-boundary check failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Public-boundary check passed.");
}

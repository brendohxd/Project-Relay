import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const pairs = [
  ["apps/console/home.html", "docs/index.html"],
  ["apps/console/gpt-style.css", "docs/gpt-style.css"],
  ["apps/console/status/index.html", "docs/status/index.html"],
  ["apps/console/roadmap/index.html", "docs/roadmap/index.html"],
  ["apps/console/control-rooms/index.html", "docs/control-rooms/index.html"],
  ["apps/console/architecture/index.html", "docs/architecture/index.html"],
  ["apps/console/start/index.html", "docs/start/index.html"],
  ["apps/console/app.js", "docs/app.js"],
  ["apps/console/styles.css", "docs/styles.css"],
  ["apps/console/state/index.json", "docs/state/index.json"],
  ["apps/console/favicon.svg", "docs/favicon.svg"]
];

async function listFiles(root) {
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(root);
  return out.sort();
}

const stale = [];
for (const [source, generated] of pairs) {
  const [left, right] = await Promise.all([readFile(source), readFile(generated)]);
  if (!left.equals(right)) stale.push(generated);
}
if ((await readFile("docs/.nojekyll", "utf8")) !== "") stale.push("docs/.nojekyll");

const assetRoot = "apps/console/assets";
const docsAssetRoot = "docs/assets";
try {
  await stat(docsAssetRoot);
  const sources = await listFiles(assetRoot);
  for (const source of sources) {
    const rel = path.relative(assetRoot, source);
    const generated = path.join(docsAssetRoot, rel);
    const [left, right] = await Promise.all([readFile(source), readFile(generated)]);
    if (!left.equals(right)) stale.push(generated.replaceAll("\\", "/"));
  }
} catch {
  stale.push("docs/assets");
}

if (stale.length > 0) {
  console.error(`Pages bundle is stale: ${stale.join(", ")}. Run npm run pages:build.`);
  process.exit(1);
}
console.log("GitHub Pages bundle is current.");

import { readFile } from "node:fs/promises";

const pairs = [
  ["apps/console/index.html", "docs/index.html"],
  ["apps/console/app.js", "docs/app.js"],
  ["apps/console/styles.css", "docs/styles.css"],
  ["apps/console/state/index.json", "docs/state/index.json"]
];
const stale = [];
for (const [source, generated] of pairs) {
  const [left, right] = await Promise.all([readFile(source), readFile(generated)]);
  if (!left.equals(right)) stale.push(generated);
}
if ((await readFile("docs/.nojekyll", "utf8")) !== "") stale.push("docs/.nojekyll");
if (stale.length > 0) {
  console.error(`Pages bundle is stale: ${stale.join(", ")}. Run npm run pages:build.`);
  process.exit(1);
}
console.log("GitHub Pages bundle is current.");

import { copyFile, mkdir, writeFile } from "node:fs/promises";

await mkdir("docs/state", { recursive: true });
await Promise.all([
  copyFile("apps/console/index.html", "docs/index.html"),
  copyFile("apps/console/app.js", "docs/app.js"),
  copyFile("apps/console/styles.css", "docs/styles.css"),
  copyFile("apps/console/state/index.json", "docs/state/index.json"),
  writeFile("docs/.nojekyll", "", "utf8")
]);
console.log("Wrote GitHub Pages bundle to docs/.");

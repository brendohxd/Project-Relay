import { copyFile, mkdir, writeFile } from "node:fs/promises";

await mkdir("docs/state", { recursive: true });
await Promise.all(
  ["docs/status", "docs/roadmap", "docs/control-rooms", "docs/architecture"].map((path) =>
    mkdir(path, { recursive: true })
  )
);
await Promise.all([
  copyFile("apps/console/home.html", "docs/index.html"),
  copyFile("apps/console/gpt-style.css", "docs/gpt-style.css"),
  copyFile("apps/console/status/index.html", "docs/status/index.html"),
  copyFile("apps/console/roadmap/index.html", "docs/roadmap/index.html"),
  copyFile("apps/console/control-rooms/index.html", "docs/control-rooms/index.html"),
  copyFile("apps/console/architecture/index.html", "docs/architecture/index.html"),
  copyFile("apps/console/app.js", "docs/app.js"),
  copyFile("apps/console/styles.css", "docs/styles.css"),
  copyFile("apps/console/state/index.json", "docs/state/index.json"),
  writeFile("docs/.nojekyll", "", "utf8")
]);
console.log("Wrote GitHub Pages bundle to docs/.");

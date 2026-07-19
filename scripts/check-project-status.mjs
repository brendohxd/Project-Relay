import { readFile } from "node:fs/promises";

import { loadProjectStatus, renderProjectStatus } from "./project-status-lib.mjs";

try {
  const status = await loadProjectStatus();
  const actual = await readFile("STATUS.md", "utf8");
  const expected = renderProjectStatus(status);
  if (actual !== expected) {
    console.error("STATUS.md is stale. Run npm run build:status.");
    process.exit(1);
  }
  console.log("Project status is valid and STATUS.md is current.");
} catch (error) {
  console.error(error.message);
  if (error.issues) console.error(JSON.stringify(error.issues, null, 2));
  process.exit(1);
}

import { writeFile } from "node:fs/promises";

import { loadProjectStatus, renderProjectStatus } from "./project-status-lib.mjs";

const status = await loadProjectStatus();
await writeFile("STATUS.md", renderProjectStatus(status), "utf8");
console.log("Wrote STATUS.md");

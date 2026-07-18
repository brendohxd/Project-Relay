import path from "node:path";

import { validateWorkspace } from "@project-relay/protocol";

const workspace = path.resolve(process.argv[2] ?? ".");
const result = await validateWorkspace(workspace);

if (result.valid) {
  console.log(`Relay workspace is valid: ${workspace}`);
  console.log(JSON.stringify(result.counts, null, 2));
} else {
  console.error(`Relay workspace is invalid: ${workspace}`);
  console.error(JSON.stringify(result.issues, null, 2));
  process.exitCode = 1;
}

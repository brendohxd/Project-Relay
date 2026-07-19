import path from "node:path";

import { validateWorkspace } from "@project-relay/protocol";

const workspaces = process.argv.slice(2);
if (workspaces.length === 0) workspaces.push(".");

for (const workspaceArgument of workspaces) {
  const workspace = path.resolve(workspaceArgument);
  const result = await validateWorkspace(workspace);

  if (result.valid) {
    console.log(`Relay workspace is valid: ${workspace}`);
    console.log(JSON.stringify(result.counts, null, 2));
  } else {
    console.error(`Relay workspace is invalid: ${workspace}`);
    console.error(JSON.stringify(result.issues, null, 2));
    process.exitCode = 1;
  }
}

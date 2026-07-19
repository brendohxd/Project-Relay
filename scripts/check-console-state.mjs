import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "project-relay-state-"));
const generated = path.join(temporaryDirectory, "index.json");
const expected = path.resolve("apps/console/state/index.json");

try {
  execFileSync(
    process.execPath,
    ["scripts/build-console-state.mjs", "examples/m1", generated],
    { cwd: process.cwd(), stdio: "inherit" }
  );
  const [generatedContent, expectedContent] = await Promise.all([
    readFile(generated),
    readFile(expected)
  ]);
  if (!generatedContent.equals(expectedContent)) {
    console.error("Console state is stale. Run npm run build:state and commit the result.");
    process.exitCode = 1;
  } else {
    console.log("Console state is deterministic and current.");
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

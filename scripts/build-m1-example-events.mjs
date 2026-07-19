import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { eventDigest } from "@project-relay/protocol";

const directory = path.resolve("examples/m1/relay/events");
const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
let previousEventHash = null;

for (const name of names) {
  const file = path.join(directory, name);
  const event = JSON.parse(await readFile(file, "utf8"));
  event.previous_event_hash = previousEventHash;
  event.event_hash = "";
  event.event_hash = eventDigest(event);
  previousEventHash = event.event_hash;
  await writeFile(file, `${JSON.stringify(event, null, 2)}\n`, "utf8");
}

console.log(`Rebuilt ${names.length} synthetic M1 event hashes.`);

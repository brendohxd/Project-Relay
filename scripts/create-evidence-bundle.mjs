import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildEvidenceBundle } from "./evidence-bundle-lib.mjs";

function usage() {
  console.error(
    "Usage: npm run evidence:create -- --manifest <manifest.json> --output <bundle.json> [--force]"
  );
}

function parseArguments(args) {
  const options = { force: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--force") options.force = true;
    else if (argument === "--manifest" || argument === "--output") {
      options[argument.slice(2)] = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (!options.manifest || !options.output) {
    usage();
    process.exitCode = 2;
  } else {
    const output = path.resolve(options.output);
    if (!options.force) {
      try {
        await access(output);
        throw new Error(`Refusing to overwrite existing file: ${output}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }

    const { bundle, validation } = await buildEvidenceBundle(options.manifest);
    if (!validation.valid) {
      console.error(JSON.stringify(validation.errors, null, 2));
      process.exitCode = 1;
    } else {
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
      console.log(`Wrote validated evidence bundle: ${output}`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

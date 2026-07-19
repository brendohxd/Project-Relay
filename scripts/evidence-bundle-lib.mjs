import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { createRegistry } from "@project-relay/protocol";

async function artifactRecord(manifestDirectory, artifact) {
  const source = path.resolve(manifestDirectory, artifact.path);
  const content = await readFile(source);
  const metadata = await stat(source);
  return {
    uri: artifact.uri,
    sha256: createHash("sha256").update(content).digest("hex"),
    media_type: artifact.media_type,
    size_bytes: metadata.size
  };
}

export async function buildEvidenceBundle(manifestFile) {
  const manifestPath = path.resolve(manifestFile);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error("Evidence manifest must declare at least one artifact");
  }
  for (const artifact of manifest.artifacts) {
    if (!artifact.path || !artifact.uri || !artifact.media_type) {
      throw new Error("Each artifact requires path, uri, and media_type");
    }
  }

  const artifacts = await Promise.all(
    manifest.artifacts.map((artifact) => artifactRecord(path.dirname(manifestPath), artifact))
  );
  const bundle = { ...manifest, artifacts };
  const validation = (await createRegistry()).validate("evidence", bundle);
  return { bundle, validation };
}

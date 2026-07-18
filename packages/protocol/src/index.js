import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SCHEMA_DIRECTORY = path.resolve(moduleDirectory, "../../../schemas");

export const DOCUMENT_KINDS = Object.freeze([
  "task",
  "event",
  "evidence",
  "review",
  "decision"
]);

const DOCUMENT_LOCATIONS = Object.freeze({
  task: "relay/tasks",
  event: "relay/events",
  evidence: "relay/evidence",
  review: "relay/reviews",
  decision: "relay/decisions"
});

const schemaId = (kind) => `https://project-relay.dev/schemas/${kind}.schema.json`;

export async function createRegistry(schemaDirectory = DEFAULT_SCHEMA_DIRECTORY) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  for (const kind of DOCUMENT_KINDS) {
    const source = await readFile(path.join(schemaDirectory, `${kind}.schema.json`), "utf8");
    ajv.addSchema(JSON.parse(source));
  }

  return {
    validate(kind, document) {
      if (!DOCUMENT_KINDS.includes(kind)) {
        return {
          valid: false,
          errors: [{ instancePath: "", message: `unknown document kind: ${kind}` }]
        };
      }

      const validator = ajv.getSchema(schemaId(kind));
      if (!validator) {
        throw new Error(`Schema was not registered for ${kind}`);
      }

      const valid = validator(document);
      return {
        valid: Boolean(valid),
        errors: valid
          ? []
          : (validator.errors ?? []).map(({ instancePath, keyword, message, params }) => ({
              instancePath,
              keyword,
              message,
              params
            }))
      };
    }
  };
}

export function canonicalJson(value) {
  if (value === null) return "null";

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Relay canonical JSON does not support non-finite numbers");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        if (value[key] === undefined) {
          throw new TypeError(`Relay canonical JSON does not support undefined at key ${key}`);
        }
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      });
    return `{${entries.join(",")}}`;
  }

  throw new TypeError(`Relay canonical JSON does not support ${typeof value}`);
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function eventDigest(event) {
  const { event_hash: ignored, ...unsignedEvent } = event;
  void ignored;
  return sha256Canonical(unsignedEvent);
}

export function verifyEventChain(events) {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const errors = [];
  let previous = null;
  let expectedSequence = 1;

  for (const event of ordered) {
    if (event.sequence !== expectedSequence) {
      errors.push({
        event_id: event.id,
        message: `expected sequence ${expectedSequence}, received ${event.sequence}`
      });
    }

    if (event.previous_event_hash !== previous) {
      errors.push({
        event_id: event.id,
        message: `previous_event_hash does not match sequence ${event.sequence - 1}`
      });
    }

    const calculated = eventDigest(event);
    if (event.event_hash !== calculated) {
      errors.push({
        event_id: event.id,
        message: `event_hash mismatch; calculated ${calculated}`
      });
    }

    previous = event.event_hash;
    expectedSequence += 1;
  }

  return { valid: errors.length === 0, errors };
}

async function directoryExists(directory) {
  try {
    await access(directory);
    return true;
  } catch {
    return false;
  }
}

export async function readDocuments(directory) {
  if (!(await directoryExists(directory))) return { documents: [], issues: [] };

  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const documents = [];
  const issues = [];

  for (const name of names) {
    const file = path.join(directory, name);
    try {
      const document = JSON.parse(await readFile(file, "utf8"));
      documents.push({ file, document });
    } catch (error) {
      issues.push({ file, message: `invalid JSON: ${error.message}` });
    }
  }

  return { documents, issues };
}

export async function validateWorkspace(workspace, options = {}) {
  const root = path.resolve(workspace);
  const registry = await createRegistry(options.schemaDirectory);
  const issues = [];
  const counts = Object.fromEntries(DOCUMENT_KINDS.map((kind) => [kind, 0]));
  const events = [];

  for (const kind of DOCUMENT_KINDS) {
    const location = path.join(root, DOCUMENT_LOCATIONS[kind]);
    const loaded = await readDocuments(location);
    issues.push(...loaded.issues);
    counts[kind] = loaded.documents.length;

    for (const { file, document } of loaded.documents) {
      const result = registry.validate(kind, document);
      if (!result.valid) {
        issues.push({ file, message: "schema validation failed", errors: result.errors });
      } else if (kind === "event") {
        events.push(document);
      }
    }
  }

  const eventsByTask = Map.groupBy(events, (event) => event.task_id);
  for (const [taskId, taskEvents] of eventsByTask) {
    const chain = verifyEventChain(taskEvents);
    for (const error of chain.errors) {
      issues.push({ file: `event-chain:${taskId}`, message: error.message, event_id: error.event_id });
    }
  }

  return {
    valid: issues.length === 0,
    workspace: root,
    counts,
    issues
  };
}

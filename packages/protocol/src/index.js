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

export const TASK_TRANSITIONS = Object.freeze({
  draft: Object.freeze(["ready", "blocked", "cancelled"]),
  ready: Object.freeze(["claimed", "blocked", "cancelled"]),
  claimed: Object.freeze(["in_progress", "blocked", "cancelled"]),
  in_progress: Object.freeze(["submitted", "blocked", "cancelled"]),
  submitted: Object.freeze(["under_review", "blocked", "cancelled"]),
  under_review: Object.freeze(["remediation", "accepted", "rejected", "blocked", "cancelled"]),
  remediation: Object.freeze(["submitted", "blocked", "cancelled"]),
  blocked: Object.freeze([]),
  accepted: Object.freeze([]),
  rejected: Object.freeze([]),
  cancelled: Object.freeze([])
});

const EVENT_TARGET_STATES = Object.freeze({
  "task.created": "draft",
  "task.ready": "ready",
  "task.claimed": "claimed",
  "task.started": "in_progress",
  "task.submitted": "submitted",
  "review.requested": "under_review",
  "remediation.requested": "remediation",
  "task.blocked": "blocked",
  "task.cancelled": "cancelled"
});

const DECISION_TARGET_STATES = Object.freeze({
  accept: "accepted",
  reject: "rejected",
  remediate: "remediation",
  defer: "blocked"
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
  const seenEventIds = new Set();
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

    for (const link of event.causal_links ?? []) {
      if (link.target_event_id === event.id) {
        errors.push({
          event_id: event.id,
          message: "causal link cannot target its containing event"
        });
      } else if (!seenEventIds.has(link.target_event_id)) {
        errors.push({
          event_id: event.id,
          message: `causal link target ${link.target_event_id} must be an earlier event in the task chain`
        });
      }
    }

    seenEventIds.add(event.id);

    previous = event.event_hash;
    expectedSequence += 1;
  }

  return { valid: errors.length === 0, errors };
}

function policyIssue(code, message, details = {}) {
  return { code, message, ...details };
}

function isAtOrBefore(record, event) {
  return Date.parse(record.created_at) <= Date.parse(event.occurred_at);
}

export function evaluateTaskPolicy({ task, events = [], evidence = [], reviews = [], decisions = [] }) {
  const taskEvents = events
    .filter((event) => event.task_id === task.id)
    .sort((left, right) => left.sequence - right.sequence);
  const taskEvidence = evidence.filter((record) => record.task_id === task.id);
  const taskReviews = reviews.filter((record) => record.task_id === task.id);
  const taskDecisions = decisions.filter((record) => record.task_id === task.id);
  const evidenceById = new Map(taskEvidence.map((record) => [record.id, record]));
  const reviewsById = new Map(taskReviews.map((record) => [record.id, record]));
  const decisionsById = new Map(taskDecisions.map((record) => [record.id, record]));
  const issues = [];
  const history = [];
  let state = null;

  for (const review of taskReviews) {
    for (const evidenceId of review.evidence_ids) {
      if (!evidenceById.has(evidenceId)) {
        issues.push(
          policyIssue(
            "review.evidence_missing",
            `Review ${review.id} references missing evidence ${evidenceId}`,
            { review_id: review.id }
          )
        );
      }
    }
    if (review.independent && review.reviewer.id === task.owner.id) {
      issues.push(
        policyIssue(
          "review.self_review",
          `Task owner ${task.owner.id} cannot provide independent review`,
          { review_id: review.id }
        )
      );
    }
  }

  const evidenceHashes = new Map(taskEvidence.map((record) => [sha256Canonical(record), record.id]));
  for (const decision of taskDecisions) {
    for (const reviewId of decision.review_ids) {
      if (!reviewsById.has(reviewId)) {
        issues.push(
          policyIssue(
            "decision.review_missing",
            `Decision ${decision.id} references missing review ${reviewId}`,
            { decision_id: decision.id }
          )
        );
      }
    }
    for (const hash of decision.evidence_hashes) {
      if (!evidenceHashes.has(hash)) {
        issues.push(
          policyIssue(
            "decision.evidence_missing",
            `Decision ${decision.id} references an unknown evidence hash`,
            { decision_id: decision.id }
          )
        );
      }
    }
  }

  for (const event of taskEvents) {
    let targetState = EVENT_TARGET_STATES[event.type] ?? null;
    let linkedDecision;

    if (event.type === "decision.recorded") {
      linkedDecision = decisionsById.get(event.payload.decision_id);
      if (!linkedDecision) {
        issues.push(
          policyIssue("event.decision_missing", `Event ${event.id} references a missing decision`, {
            event_id: event.id
          })
        );
      } else {
        targetState = DECISION_TARGET_STATES[linkedDecision.outcome];
        if (!isAtOrBefore(linkedDecision, event)) {
          issues.push(
            policyIssue(
              "event.decision_not_recorded",
              `Decision ${linkedDecision.id} was created after event ${event.id}`,
              { event_id: event.id }
            )
          );
        }
      }
    }

    if (!targetState) {
      if (event.type === "review.recorded") {
        const review = reviewsById.get(event.payload.review_id);
        if (!review) {
          issues.push(
            policyIssue("event.review_missing", `Event ${event.id} references a missing review`, {
              event_id: event.id
            })
          );
        } else if (!isAtOrBefore(review, event)) {
          issues.push(
            policyIssue(
              "event.review_not_recorded",
              `Review ${review.id} was created after event ${event.id}`,
              { event_id: event.id }
            )
          );
        }
      }
      continue;
    }

    const fromState = state;
    if (event.type === "task.created") {
      if (state !== null) {
        issues.push(
          policyIssue(
            "transition.duplicate_creation",
            `Task ${task.id} has more than one creation transition`,
            { event_id: event.id }
          )
        );
      }
    } else if (!state || !TASK_TRANSITIONS[state]?.includes(targetState)) {
      issues.push(
        policyIssue(
          "transition.not_allowed",
          `Transition ${state ?? "none"} -> ${targetState} is not allowed`,
          { event_id: event.id }
        )
      );
    }

    if (event.payload.from_state !== undefined && event.payload.from_state !== fromState) {
      issues.push(
        policyIssue(
          "transition.from_state_mismatch",
          `Event ${event.id} declares from_state ${event.payload.from_state}, expected ${fromState}`,
          { event_id: event.id }
        )
      );
    }
    const declaredTarget = event.payload.to_state ?? event.payload.state;
    if (declaredTarget !== undefined && declaredTarget !== targetState) {
      issues.push(
        policyIssue(
          "transition.to_state_mismatch",
          `Event ${event.id} declares target ${declaredTarget}, expected ${targetState}`,
          { event_id: event.id }
        )
      );
    }

    if (
      event.type !== "task.created" &&
      (event.payload.from_state === undefined || event.payload.to_state === undefined)
    ) {
      issues.push(
        policyIssue(
          "transition.state_declaration_required",
          `Event ${event.id} must declare from_state and to_state`,
          { event_id: event.id }
        )
      );
    }

    if (event.type === "task.submitted" || event.type === "review.requested") {
      const linkedEvidenceIds = event.payload.evidence_ids;
      if (!Array.isArray(linkedEvidenceIds) || linkedEvidenceIds.length === 0) {
        issues.push(
          policyIssue(
            "gate.evidence_required",
            `${event.type} requires at least one linked evidence bundle`,
            { event_id: event.id }
          )
        );
      } else {
        for (const evidenceId of linkedEvidenceIds) {
          const record = evidenceById.get(evidenceId);
          if (!record || !isAtOrBefore(record, event)) {
            issues.push(
              policyIssue(
                "gate.evidence_unavailable",
                `Evidence ${evidenceId} was not available for event ${event.id}`,
                { event_id: event.id }
              )
            );
          }
        }
      }
    }

    if (event.type === "remediation.requested") {
      const review = reviewsById.get(event.payload.review_id);
      if (
        !review ||
        !isAtOrBefore(review, event) ||
        !["fail", "remediation"].includes(review.outcome)
      ) {
        issues.push(
          policyIssue(
            "gate.remediation_review_required",
            "Remediation requires a linked fail or remediation review",
            { event_id: event.id }
          )
        );
      }
    }

    if (linkedDecision?.outcome === "accept") {
      const passingReview = linkedDecision.review_ids
        .map((id) => reviewsById.get(id))
        .find(
          (review) =>
            review?.outcome === "pass" &&
            review.independent &&
            review.reviewer.id !== task.owner.id &&
            isAtOrBefore(review, event)
        );
      if (!passingReview) {
        issues.push(
          policyIssue(
            "gate.independent_review_required",
            "Acceptance requires a referenced independent pass review by someone other than the task owner",
            { event_id: event.id }
          )
        );
      } else {
        const decisionEvidenceIds = new Set(
          linkedDecision.evidence_hashes.map((hash) => evidenceHashes.get(hash)).filter(Boolean)
        );
        if (!passingReview.evidence_ids.some((id) => decisionEvidenceIds.has(id))) {
          issues.push(
            policyIssue(
              "gate.reviewed_evidence_required",
              "Acceptance decision must hash evidence considered by its independent pass review",
              { event_id: event.id }
            )
          );
        }
      }
    }

    state = targetState;
    history.push({
      sequence: event.sequence,
      event_id: event.id,
      type: event.type,
      from_state: fromState,
      to_state: targetState,
      occurred_at: event.occurred_at
    });
  }

  if (state !== task.state) {
    issues.push(
      policyIssue(
        "task.state_mismatch",
        `Task document state ${task.state} does not match derived state ${state ?? "none"}`
      )
    );
  }

  const independentPass = taskReviews.some(
    (review) =>
      review.outcome === "pass" &&
      review.independent &&
      review.reviewer.id !== task.owner.id
  );
  const remediationReviewExists = taskReviews.some((review) =>
    ["fail", "remediation"].includes(review.outcome)
  );
  const remediationEventExists = taskEvents.some(
    (event) => event.type === "remediation.requested"
  );
  const humanDecision = taskDecisions.some((decision) => decision.authority.type === "human");

  return {
    valid: issues.length === 0,
    task_id: task.id,
    derived_state: state,
    history,
    gates: {
      evidence_present: taskEvidence.length > 0,
      independent_review: independentPass,
      remediation_recorded: !remediationReviewExists || remediationEventExists,
      human_decision: humanDecision,
      final_state_consistent: state === task.state
    },
    issues
  };
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
  const documentsByKind = Object.fromEntries(DOCUMENT_KINDS.map((kind) => [kind, []]));

  for (const kind of DOCUMENT_KINDS) {
    const location = path.join(root, DOCUMENT_LOCATIONS[kind]);
    const loaded = await readDocuments(location);
    issues.push(...loaded.issues);
    counts[kind] = loaded.documents.length;

    for (const { file, document } of loaded.documents) {
      const result = registry.validate(kind, document);
      if (!result.valid) {
        issues.push({ file, message: "schema validation failed", errors: result.errors });
      } else {
        documentsByKind[kind].push(document);
        if (kind === "event") events.push(document);
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

  const taskIds = new Set(documentsByKind.task.map((task) => task.id));
  for (const kind of ["event", "evidence", "review", "decision"]) {
    for (const document of documentsByKind[kind]) {
      if (!taskIds.has(document.task_id)) {
        issues.push({
          file: `${kind}:${document.id}`,
          message: `references missing task ${document.task_id}`
        });
      }
    }
  }

  const policy = {};
  for (const task of documentsByKind.task) {
    const evaluation = evaluateTaskPolicy({
      task,
      events: documentsByKind.event,
      evidence: documentsByKind.evidence,
      reviews: documentsByKind.review,
      decisions: documentsByKind.decision
    });
    policy[task.id] = evaluation;
    for (const error of evaluation.issues) {
      issues.push({ file: `policy:${task.id}`, message: error.message, ...error });
    }
  }

  return {
    valid: issues.length === 0,
    workspace: root,
    counts,
    policy,
    issues
  };
}

export async function readTaskPacket(workspace, taskId) {
  const root = path.resolve(workspace);
  const loaded = {};
  for (const kind of DOCUMENT_KINDS) {
    loaded[kind] = (
      await readDocuments(path.join(root, DOCUMENT_LOCATIONS[kind]))
    ).documents.map(({ document }) => document);
  }
  const task = loaded.task.find((candidate) => candidate.id === taskId);
  if (!task) return null;
  const related = (records) => records.filter((record) => record.task_id === taskId);
  const packet = {
    task,
    events: related(loaded.event).sort((left, right) => left.sequence - right.sequence),
    evidence: related(loaded.evidence),
    reviews: related(loaded.review),
    decisions: related(loaded.decision)
  };
  return { ...packet, policy: evaluateTaskPolicy(packet) };
}

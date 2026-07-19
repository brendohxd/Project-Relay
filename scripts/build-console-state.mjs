import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { readDocuments, readTaskPacket, validateWorkspace } from "@project-relay/protocol";
import { loadProjectStatus } from "./project-status-lib.mjs";

const workspaceArgument = process.argv[2] ?? "examples/minimal";
const outputArgument = process.argv[3] ?? "apps/console/state/index.json";
const workspace = path.resolve(workspaceArgument);
const output = path.resolve(outputArgument);
const projectStatusFile = path.resolve(process.argv[4] ?? "project/status.json");
const projectStatusSchema = path.resolve("project/status.schema.json");

const verification = await validateWorkspace(workspace);
if (!verification.valid) {
  console.error(JSON.stringify(verification.issues, null, 2));
  process.exit(1);
}

async function load(kind) {
  const plural = {
    task: "tasks",
    evidence: "evidence",
    review: "reviews",
    decision: "decisions"
  }[kind];
  return (await readDocuments(path.join(workspace, "relay", plural))).documents.map(
    ({ document }) => document
  );
}

const [tasks, evidence, reviews, decisions, project] = await Promise.all([
  load("task"),
  load("evidence"),
  load("review"),
  load("decision"),
  loadProjectStatus(projectStatusFile, projectStatusSchema)
]);
const packets = new Map(
  (
    await Promise.all(
      tasks.map(async (task) => [task.id, await readTaskPacket(workspace, task.id)])
    )
  )
);

const countFor = (records, taskId) => records.filter((record) => record.task_id === taskId).length;
const snapshot = {
  protocol_version: "0.1.0",
  generated_from: workspaceArgument.replaceAll("\\", "/"),
  project,
  summary: {
    tasks: tasks.length,
    active: tasks.filter((task) => !["accepted", "rejected", "cancelled"].includes(task.state)).length,
    evidence_bundles: evidence.length,
    reviews: reviews.length,
    decisions: decisions.length,
    failed_gates: [...packets.values()].reduce(
      (total, packet) =>
        total + Object.values(packet.policy.gates).filter((satisfied) => !satisfied).length,
      0
    )
  },
  tasks: tasks
    .map((task) => {
      const packet = packets.get(task.id);
      return {
        id: task.id,
        title: task.title,
        question: task.question,
        state: task.state,
        derived_state: packet.policy.derived_state,
        policy_valid: packet.policy.valid,
        gates: packet.policy.gates,
        history: packet.policy.history,
        risk: task.risk,
        owner: task.owner,
        reviewer_count: task.reviewers.length,
        evidence_count: countFor(evidence, task.id),
        review_count: countFor(reviews, task.id),
        decision_count: countFor(decisions, task.id)
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id))
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(process.cwd(), output)}`);

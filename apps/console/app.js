const elements = {
  projectStage: document.querySelector("#project-stage"),
  currentMilestone: document.querySelector("#current-milestone"),
  roadmapComplete: document.querySelector("#roadmap-complete"),
  roadmapBlocked: document.querySelector("#roadmap-blocked"),
  roadmapDeferred: document.querySelector("#roadmap-deferred"),
  milestoneRows: document.querySelector("#milestone-rows"),
  pilotRows: document.querySelector("#pilot-rows"),
  projectUpdated: document.querySelector("#project-updated"),
  tasks: document.querySelector("#metric-tasks"),
  active: document.querySelector("#metric-active"),
  evidence: document.querySelector("#metric-evidence"),
  reviews: document.querySelector("#metric-reviews"),
  decisions: document.querySelector("#metric-decisions"),
  rows: document.querySelector("#task-rows"),
  source: document.querySelector("#source-note"),
  error: document.querySelector("#load-error"),
  version: document.querySelector("#protocol-version")
};

function cell(className, text) {
  const node = document.createElement("span");
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function taskCell(label, className, text) {
  const node = document.createElement("span");
  node.className = "task-cell";
  node.dataset.label = label;
  node.setAttribute("role", "cell");
  node.append(cell(className, text));
  return node;
}

function stateLabel(state) {
  return state.replaceAll("_", " ");
}

function renderMilestone(milestone) {
  const card = document.createElement("article");
  card.className = `milestone-card milestone-${milestone.summary.state}`;
  const heading = document.createElement("div");
  heading.className = "milestone-heading";
  const name = document.createElement("div");
  const id = cell("milestone-id", milestone.id);
  const title = document.createElement("h3");
  title.textContent = milestone.title;
  name.append(id, title);
  heading.append(name, cell(`badge badge-${milestone.summary.state}`, stateLabel(milestone.summary.state)));
  const progress = document.createElement("p");
  progress.className = "milestone-progress";
  progress.textContent = `${milestone.summary.completed}/${milestone.summary.actionable} actionable items complete`;
  const list = document.createElement("ul");
  list.className = "roadmap-items";
  for (const item of milestone.items) {
    const row = document.createElement("li");
    row.className = `roadmap-item item-${item.state}`;
    row.append(cell("item-marker", item.state === "done" ? "✓" : item.state === "blocked" ? "!" : "·"));
    const detail = document.createElement("span");
    const itemTitle = document.createElement("strong");
    itemTitle.textContent = item.title;
    detail.append(itemTitle, cell("item-state", stateLabel(item.state)));
    if (item.blocker) detail.append(cell("item-note", item.blocker.summary));
    else if (item.next_action && item.state !== "done") detail.append(cell("item-note", item.next_action));
    row.append(detail);
    list.append(row);
  }
  card.append(heading, progress, list);
  return card;
}

function renderPilot(pilot) {
  const card = document.createElement("article");
  card.className = "pilot-card";
  const heading = document.createElement("div");
  heading.className = "pilot-heading";
  const title = document.createElement("h3");
  title.textContent = pilot.name;
  heading.append(title, cell("badge badge-boundary", pilot.visibility));
  const boundary = document.createElement("p");
  boundary.className = "pilot-boundary";
  boundary.textContent = pilot.boundary;
  const progress = document.createElement("p");
  progress.className = "pilot-progress";
  progress.textContent = `${pilot.summary.completed}/${pilot.summary.actionable} operational gates complete · ${pilot.summary.counts.blocked} blocked`;
  card.append(heading, boundary, progress);
  return card;
}

function renderTask(task) {
  const row = document.createElement("article");
  row.className = "task-row";
  row.setAttribute("role", "row");
  const title = document.createElement("span");
  title.className = "task-title";
  title.setAttribute("role", "cell");
  const strong = document.createElement("strong");
  strong.textContent = task.title;
  const small = document.createElement("small");
  small.textContent = `${task.id} · ${task.history.length} transitions · policy ${task.policy_valid ? "valid" : "failed"}`;
  title.append(strong, small);
  row.append(
    title,
    taskCell("State", `badge badge-state ${task.policy_valid ? "" : "badge-policy-failed"}`, stateLabel(task.derived_state)),
    taskCell("Risk", `badge badge-risk-${task.risk}`, task.risk),
    taskCell("Evidence", "", String(task.evidence_count)),
    taskCell("Reviews", "", String(task.review_count))
  );
  const gates = document.createElement("div");
  gates.className = "task-gates";
  for (const [name, satisfied] of Object.entries(task.gates)) {
    gates.append(cell(`gate ${satisfied ? "gate-pass" : "gate-fail"}`, `${satisfied ? "✓" : "×"} ${stateLabel(name)}`));
  }
  row.append(gates);
  return row;
}

try {
  const response = await fetch("./state/index.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`State request failed with ${response.status}`);
  const state = await response.json();
  const project = state.project;

  elements.projectStage.textContent = project.project.stage;
  elements.currentMilestone.textContent = project.summary.current_milestone ?? "complete";
  elements.roadmapComplete.textContent = `${project.summary.completed}/${project.summary.actionable}`;
  elements.roadmapBlocked.textContent = project.summary.counts.blocked;
  elements.roadmapDeferred.textContent = project.summary.counts.deferred;
  elements.projectUpdated.textContent = `updated · ${project.updated_at}`;
  elements.milestoneRows.replaceChildren(...project.milestones.map(renderMilestone));
  elements.pilotRows.replaceChildren(...project.pilots.map(renderPilot));

  elements.tasks.textContent = state.summary.tasks;
  elements.active.textContent = state.summary.active;
  elements.evidence.textContent = state.summary.evidence_bundles;
  elements.reviews.textContent = state.summary.reviews;
  elements.decisions.textContent = state.summary.decisions;
  elements.source.textContent = `source · ${state.generated_from}`;
  elements.version.textContent = `Protocol ${state.protocol_version}`;
  elements.rows.replaceChildren(...state.tasks.map(renderTask));
} catch (error) {
  elements.source.textContent = "state unavailable";
  elements.error.hidden = false;
  elements.error.textContent = `${error.message}. Serve this directory over HTTP rather than opening index.html directly.`;
}

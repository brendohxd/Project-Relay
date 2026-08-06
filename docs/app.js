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

function setText(node, value) {
  if (node) node.textContent = value;
}

try {
  // Resolve against the script location so status/ and root pages both work.
  const response = await fetch(new URL("./state/index.json", import.meta.url), { cache: "no-store" });
  if (!response.ok) throw new Error(`State request failed with ${response.status}`);
  const state = await response.json();
  const project = state.project;

  setText(elements.projectStage, project.project.stage);
  setText(elements.currentMilestone, project.summary.current_milestone ?? "complete");
  setText(elements.roadmapComplete, `${project.summary.completed}/${project.summary.actionable}`);
  setText(elements.roadmapBlocked, project.summary.counts.blocked);
  setText(elements.roadmapDeferred, project.summary.counts.deferred);
  setText(elements.projectUpdated, `updated · ${project.updated_at}`);
  if (elements.milestoneRows) {
    elements.milestoneRows.replaceChildren(...project.milestones.map(renderMilestone));
  }
  if (elements.pilotRows) {
    elements.pilotRows.replaceChildren(...project.pilots.map(renderPilot));
  }

  setText(elements.tasks, state.summary.tasks);
  setText(elements.active, state.summary.active);
  setText(elements.evidence, state.summary.evidence_bundles);
  setText(elements.reviews, state.summary.reviews);
  setText(elements.decisions, state.summary.decisions);
  setText(elements.source, `source · ${state.generated_from}`);
  setText(elements.version, `Protocol ${state.protocol_version}`);
  if (elements.rows) {
    elements.rows.replaceChildren(...state.tasks.map(renderTask));
  }
} catch (error) {
  setText(elements.source, "state unavailable");
  if (elements.error) {
    elements.error.hidden = false;
    elements.error.textContent = `${error.message}. Serve this directory over HTTP rather than opening index.html directly.`;
  }
}

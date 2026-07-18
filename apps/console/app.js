const elements = {
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

function renderTask(task) {
  const row = document.createElement("article");
  row.className = "task-row";
  row.setAttribute("role", "row");

  const title = document.createElement("span");
  title.className = "task-title";
  const strong = document.createElement("strong");
  strong.textContent = task.title;
  const small = document.createElement("small");
  small.textContent = task.id;
  title.append(strong, small);

  row.append(
    title,
    cell("badge badge-state", task.state.replaceAll("_", " ")),
    cell(`badge badge-risk-${task.risk}`, task.risk),
    cell("", String(task.evidence_count)),
    cell("", String(task.review_count))
  );
  return row;
}

try {
  const response = await fetch("./state/index.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`State request failed with ${response.status}`);
  const state = await response.json();

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

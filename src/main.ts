import "./styles.css";
import { formatMoney, padBounds, polygonArea, polygonCentroid, projectBounds } from "./geometry";
import { sampleProject } from "./sample-project";
import { PLOT_STATUSES, type PlotProject, type PlotRecord, type PlotStatus, type Point2 } from "./types";
import { Plot3DView } from "./view3d";

const STORAGE_KEY = "plot-visualizer-project-v1";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

let project = loadProject();
let selectedPlotId = project.plots[0]?.id;
let mode: "2d" | "3d" = "2d";
let drawing = false;
let draftPoints: Point2[] = [];
let renderedMode: "2d" | "3d" | undefined;
let view3d: Plot3DView | undefined;
const visibleStatuses = new Set<PlotStatus>(PLOT_STATUSES);

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">PV</div>
        <div>
          <strong>Plot Visualizer</strong>
          <span id="project-name"></span>
        </div>
      </div>

      <div class="topbar-actions">
        <div class="segmented" aria-label="View mode">
          <button type="button" data-mode="2d">2D</button>
          <button type="button" data-mode="3d">3D</button>
        </div>
        <button type="button" class="button primary" id="draw-plot">Draw plot</button>
        <button type="button" class="button" id="upload-plan">Plan image</button>
        <button type="button" class="button" id="import-project">Import</button>
        <button type="button" class="button" id="export-project">Export</button>
      </div>
    </header>

    <main class="workspace">
      <section class="stage-panel">
        <div class="stage-toolbar">
          <div id="status-filters" class="status-filters"></div>
          <div class="stage-tools">
            <span id="drawing-hint" class="drawing-hint"></span>
            <button type="button" class="text-button" id="new-project">New blank</button>
            <button type="button" class="text-button" id="clear-background">Clear plan</button>
            <button type="button" class="text-button" id="reset-demo">Reset demo</button>
          </div>
        </div>
        <div id="stage" class="stage" aria-label="Plot visualizer canvas"></div>
      </section>

      <aside id="sidebar" class="sidebar"></aside>
    </main>

    <input id="plan-input" type="file" accept="image/png,image/jpeg,image/webp" hidden />
    <input id="project-input" type="file" accept="application/json,.json" hidden />
  </div>
`;

const projectName = getElement("project-name");
const stage = getElement("stage");
const sidebar = getElement("sidebar");
const statusFilters = getElement("status-filters");
const drawingHint = getElement("drawing-hint");
const planInput = getElement("plan-input") as HTMLInputElement;
const projectInput = getElement("project-input") as HTMLInputElement;

app.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-mode]");
  if (!target) return;

  const nextMode = target.dataset.mode;
  if (nextMode !== "2d" && nextMode !== "3d") return;
  mode = nextMode;
  drawing = false;
  draftPoints = [];
  render();
});

getElement("draw-plot").addEventListener("click", () => {
  if (mode !== "2d") mode = "2d";
  drawing = !drawing;
  if (!drawing) draftPoints = [];
  render();
});

getElement("upload-plan").addEventListener("click", () => planInput.click());
getElement("import-project").addEventListener("click", () => projectInput.click());
getElement("export-project").addEventListener("click", exportProject);

getElement("new-project").addEventListener("click", () => {
  const requestedName = window.prompt("Project name", "Untitled Plot Project");
  if (requestedName === null) return;
  const name = requestedName.trim() || "Untitled Plot Project";

  project = {
    id: `${slugify(name)}-${Date.now().toString(36)}`,
    name,
    currency: "IDR",
    unitScaleM: 1,
    plots: [],
  };
  selectedPlotId = undefined;
  drawing = false;
  draftPoints = [];
  saveProject();
  render();
});

getElement("clear-background").addEventListener("click", () => {
  project.backgroundImage = undefined;
  saveProject();
  render();
});

getElement("reset-demo").addEventListener("click", () => {
  if (!window.confirm("Replace the current local project with the sample project?")) return;
  project = structuredClone(sampleProject);
  selectedPlotId = project.plots[0]?.id;
  drawing = false;
  draftPoints = [];
  saveProject();
  render();
});

planInput.addEventListener("change", () => {
  const file = planInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result !== "string") return;
    project.backgroundImage = reader.result;
    saveProject();
    render();
  });
  reader.readAsDataURL(file);
  planInput.value = "";
});

projectInput.addEventListener("change", async () => {
  const file = projectInput.files?.[0];
  if (!file) return;

  try {
    const nextProject = JSON.parse(await file.text()) as unknown;
    if (!isPlotProject(nextProject)) throw new Error("Invalid Plot Visualizer project JSON.");
    project = nextProject;
    selectedPlotId = project.plots[0]?.id;
    drawing = false;
    draftPoints = [];
    saveProject();
    render();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Unable to import project.");
  } finally {
    projectInput.value = "";
  }
});

statusFilters.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-status-filter]");
  const status = button?.dataset.statusFilter as PlotStatus | undefined;
  if (!status || !PLOT_STATUSES.includes(status)) return;

  if (visibleStatuses.has(status)) visibleStatuses.delete(status);
  else visibleStatuses.add(status);
  render();
});

sidebar.addEventListener("click", (event) => {
  const selectButton = (event.target as HTMLElement).closest<HTMLElement>("[data-select-plot]");
  if (selectButton?.dataset.selectPlot) {
    selectedPlotId = selectButton.dataset.selectPlot;
    render();
    return;
  }

  const deleteButton = (event.target as HTMLElement).closest<HTMLElement>("[data-delete-plot]");
  if (deleteButton?.dataset.deletePlot) {
    project.plots = project.plots.filter((plot) => plot.id !== deleteButton.dataset.deletePlot);
    selectedPlotId = project.plots[0]?.id;
    saveProject();
    render();
  }
});

sidebar.addEventListener("change", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-field]");
  const plot = selectedPlot();
  const field = input?.dataset.field;
  if (!plot || !input || !field) return;

  switch (field) {
    case "label":
      plot.label = input.value.trim() || plot.id;
      break;
    case "status":
      if (PLOT_STATUSES.includes(input.value as PlotStatus)) plot.status = input.value as PlotStatus;
      break;
    case "areaM2":
      plot.areaM2 = Math.max(Number(input.value) || 0, 0);
      break;
    case "price":
      plot.price = input.value === "" ? undefined : Math.max(Number(input.value) || 0, 0);
      break;
    case "facing":
      plot.facing = input.value.trim() || undefined;
      break;
    case "dimensions":
      plot.dimensions = input.value.trim() || undefined;
      break;
    case "extrusionM":
      plot.extrusionM = Math.max(Number(input.value) || 0.08, 0.08);
      break;
    case "notes":
      plot.notes = input.value.trim() || undefined;
      break;
  }

  saveProject();
  render();
});

window.addEventListener("keydown", (event) => {
  if (!drawing) return;

  if (event.key === "Enter") {
    event.preventDefault();
    finishDrawing();
  } else if (event.key === "Escape") {
    drawing = false;
    draftPoints = [];
    render();
  }
});

render();

function render(): void {
  projectName.textContent = project.name;
  renderModeButtons();
  renderFilters();
  renderSidebar();

  const drawButton = getElement("draw-plot");
  drawButton.classList.toggle("active", drawing);
  drawButton.textContent = drawing ? "Cancel drawing" : "Draw plot";

  drawingHint.textContent = drawing
    ? draftPoints.length < 3
      ? "Click at least 3 corners · Enter to finish · Esc to cancel"
      : "Continue clicking corners · Enter or double-click to finish"
    : mode === "2d"
      ? "Select a plot to edit inventory"
      : "Drag to orbit · scroll to zoom · click a plot";

  if (mode === "2d") {
    if (renderedMode !== "2d") {
      view3d?.dispose();
      view3d = undefined;
      stage.replaceChildren();
      renderedMode = "2d";
    }
    render2D();
    return;
  }

  if (renderedMode !== "3d") {
    stage.replaceChildren();
    const host = document.createElement("div");
    host.className = "three-host";
    stage.append(host);
    view3d = new Plot3DView(host, (plotId) => {
      selectedPlotId = plotId;
      render();
    });
    renderedMode = "3d";
  }

  view3d?.render(project, selectedPlotId, visibleStatuses);
}

function renderModeButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderFilters(): void {
  statusFilters.innerHTML = PLOT_STATUSES.map((status) => {
    const count = project.plots.filter((plot) => plot.status === status).length;
    const active = visibleStatuses.has(status);
    return `
      <button
        type="button"
        class="status-filter status-${status} ${active ? "active" : ""}"
        data-status-filter="${status}"
        aria-pressed="${String(active)}"
      >
        <span></span>
        ${titleCase(status)}
        <strong>${count}</strong>
      </button>
    `;
  }).join("");
}

function renderSidebar(): void {
  const plot = selectedPlot();
  const visibleCount = project.plots.filter((item) => visibleStatuses.has(item.status)).length;
  const availableCount = project.plots.filter((item) => item.status === "available").length;

  const plotRows = project.plots.map((item) => `
    <button
      type="button"
      class="inventory-row ${item.id === selectedPlotId ? "selected" : ""}"
      data-select-plot="${escapeHtml(item.id)}"
    >
      <span class="status-dot status-${item.status}"></span>
      <span>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.dimensions ?? `${Math.round(item.areaM2)} m²`)}</small>
      </span>
      <em>${titleCase(item.status)}</em>
    </button>
  `).join("");

  sidebar.innerHTML = `
    <section class="sidebar-section project-summary">
      <div>
        <span class="eyebrow">Project inventory</span>
        <h2>${escapeHtml(project.name)}</h2>
      </div>
      <div class="summary-grid">
        <div><strong>${project.plots.length}</strong><span>Total plots</span></div>
        <div><strong>${availableCount}</strong><span>Available</span></div>
        <div><strong>${visibleCount}</strong><span>Shown</span></div>
      </div>
    </section>

    ${plot ? selectedPlotEditor(plot) : `
      <section class="sidebar-section empty-selection">
        <strong>No plot selected</strong>
        <span>Choose a plot in the map or inventory list.</span>
      </section>
    `}

    <section class="sidebar-section inventory-section">
      <div class="section-heading">
        <span class="eyebrow">Inventory</span>
        <span>${project.plots.length} records</span>
      </div>
      <div class="inventory-list">${plotRows || '<p class="empty-copy">No plots yet. Use “Draw plot” to create one.</p>'}</div>
    </section>
  `;
}

function selectedPlotEditor(plot: PlotRecord): string {
  return `
    <section class="sidebar-section plot-editor">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Selected plot</span>
          <h3>${escapeHtml(plot.label)}</h3>
        </div>
        <span class="status-pill status-${plot.status}">${titleCase(plot.status)}</span>
      </div>

      <div class="price-line">${escapeHtml(formatMoney(plot.price, project.currency))}</div>

      <div class="form-grid">
        <label>
          <span>Label</span>
          <input data-field="label" value="${escapeHtml(plot.label)}" />
        </label>
        <label>
          <span>Status</span>
          <select data-field="status">
            ${PLOT_STATUSES.map((status) => `<option value="${status}" ${status === plot.status ? "selected" : ""}>${titleCase(status)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Area (m²)</span>
          <input type="number" min="0" step="0.01" data-field="areaM2" value="${plot.areaM2}" />
        </label>
        <label>
          <span>Price</span>
          <input type="number" min="0" step="1" data-field="price" value="${plot.price ?? ""}" />
        </label>
        <label>
          <span>Facing</span>
          <input data-field="facing" value="${escapeHtml(plot.facing ?? "")}" placeholder="North" />
        </label>
        <label>
          <span>Dimensions</span>
          <input data-field="dimensions" value="${escapeHtml(plot.dimensions ?? "")}" placeholder="12 × 20 m" />
        </label>
        <label>
          <span>3D height (m)</span>
          <input type="number" min="0.08" step="0.1" data-field="extrusionM" value="${plot.extrusionM ?? 0.5}" />
        </label>
        <label class="full">
          <span>Notes</span>
          <textarea data-field="notes" rows="2" placeholder="Corner plot, promo, restrictions…">${escapeHtml(plot.notes ?? "")}</textarea>
        </label>
      </div>

      <div class="geometry-readout">
        <span>Geometry area</span>
        <strong>${(polygonArea(plot.polygon) * project.unitScaleM ** 2).toFixed(1)} m²</strong>
        <span>Vertices</span>
        <strong>${plot.polygon.length}</strong>
      </div>

      <button type="button" class="danger-button" data-delete-plot="${escapeHtml(plot.id)}">Delete plot</button>
    </section>
  `;
}

function render2D(): void {
  const bounds = padBounds(projectBounds(project), 0.1);
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const fontSize = Math.max(Math.min(Math.max(width, height) * 0.027, 3.5), 1.5);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("plot-svg");
  if (drawing) svg.classList.add("drawing");
  svg.setAttribute("viewBox", `${bounds.minX} ${bounds.minY} ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const background = project.backgroundImage
    ? `<image class="plan-image" href="${escapeHtml(project.backgroundImage)}" x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />`
    : "";

  const plots = project.plots
    .filter((plot) => visibleStatuses.has(plot.status))
    .map((plot) => {
      const centroid = polygonCentroid(plot.polygon);
      const points = plot.polygon.map((point) => `${point.x},${point.y}`).join(" ");
      const selected = plot.id === selectedPlotId ? "selected" : "";

      return `
        <g class="plot-group ${selected}" data-plot-id="${escapeHtml(plot.id)}">
          <polygon class="plot-shape status-${plot.status}" points="${points}" />
          <text
            class="plot-label"
            x="${centroid.x}"
            y="${centroid.y}"
            font-size="${fontSize}"
            text-anchor="middle"
            dominant-baseline="middle"
          >${escapeHtml(plot.label)}</text>
        </g>
      `;
    })
    .join("");

  const draft = draftPoints.length
    ? `
      <polyline class="draft-line" points="${draftPoints.map((point) => `${point.x},${point.y}`).join(" ")}" />
      ${draftPoints.map((point) => `<circle class="draft-point" cx="${point.x}" cy="${point.y}" r="${fontSize * 0.35}" />`).join("")}
    `
    : "";

  svg.innerHTML = `
    <defs>
      <pattern id="minor-grid" width="5" height="5" patternUnits="userSpaceOnUse">
        <path d="M 5 0 L 0 0 0 5" class="minor-grid-line" />
      </pattern>
    </defs>
    <rect class="canvas-base" x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" />
    <rect class="canvas-grid" x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" fill="url(#minor-grid)" />
    ${background}
    ${plots}
    ${draft}
  `;

  svg.querySelectorAll<SVGGElement>("[data-plot-id]").forEach((group) => {
    group.addEventListener("click", (event) => {
      if (drawing) return;
      event.stopPropagation();
      const id = group.dataset.plotId;
      if (!id) return;
      selectedPlotId = id;
      render();
    });
  });

  svg.addEventListener("click", (event) => {
    if (!drawing || event.detail > 1) return;
    const point = eventToSvgPoint(svg, event);
    draftPoints.push(roundPoint(point));
    render();
  });

  svg.addEventListener("dblclick", (event) => {
    if (!drawing) return;
    event.preventDefault();
    finishDrawing();
  });

  stage.replaceChildren(svg);
}

function finishDrawing(): void {
  if (!drawing || draftPoints.length < 3) return;

  const nextId = uniquePlotId();
  const geometryArea = polygonArea(draftPoints) * project.unitScaleM ** 2;
  const plot: PlotRecord = {
    id: nextId,
    label: nextId,
    status: "available",
    polygon: draftPoints.map((point) => ({ ...point })),
    areaM2: Number(geometryArea.toFixed(2)),
    extrusionM: 0.5,
  };

  project.plots.push(plot);
  selectedPlotId = nextId;
  visibleStatuses.add("available");
  draftPoints = [];
  drawing = false;
  saveProject();
  render();
}

function selectedPlot(): PlotRecord | undefined {
  return project.plots.find((plot) => plot.id === selectedPlotId);
}

function uniquePlotId(): string {
  let number = project.plots.length + 1;
  let id = `P-${String(number).padStart(2, "0")}`;
  const ids = new Set(project.plots.map((plot) => plot.id));

  while (ids.has(id)) {
    number += 1;
    id = `P-${String(number).padStart(2, "0")}`;
  }

  return id;
}

function eventToSvgPoint(svg: SVGSVGElement, event: MouseEvent): Point2 {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function roundPoint(point: Point2): Point2 {
  return {
    x: Number(point.x.toFixed(2)),
    y: Number(point.y.toFixed(2)),
  };
}

function exportProject(): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(project.name)}.plot.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function loadProject(): PlotProject {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(sampleProject);
    const parsed = JSON.parse(saved) as unknown;
    return isPlotProject(parsed) ? parsed : structuredClone(sampleProject);
  } catch {
    return structuredClone(sampleProject);
  }
}

function saveProject(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // Large embedded plan images can exceed localStorage. Export remains available.
  }
}

function isPlotProject(value: unknown): value is PlotProject {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlotProject>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.currency !== "string" ||
    typeof candidate.unitScaleM !== "number" ||
    !Array.isArray(candidate.plots)
  ) {
    return false;
  }

  return candidate.plots.every((plot) => {
    if (!plot || typeof plot !== "object") return false;
    const record = plot as Partial<PlotRecord>;
    return (
      typeof record.id === "string" &&
      typeof record.label === "string" &&
      typeof record.status === "string" &&
      PLOT_STATUSES.includes(record.status as PlotStatus) &&
      typeof record.areaM2 === "number" &&
      Array.isArray(record.polygon) &&
      record.polygon.length >= 3 &&
      record.polygon.every(
        (point) =>
          !!point &&
          typeof point === "object" &&
          typeof (point as Point2).x === "number" &&
          typeof (point as Point2).y === "number",
      )
    );
  });
}

function titleCase(value: string): string {
  return value.replace(/(^|[-_ ])\w/g, (match) => match.toUpperCase());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "plot-project";
}

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

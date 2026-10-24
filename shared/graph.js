// The diagram model shared by the browser and the API: validation and Mermaid export.

export const KINDS = ["client", "service", "function", "database", "cache", "queue", "storage", "external", "ai", "other"];
export const COLORS = ["red", "orange", "amber", "green", "teal", "blue", "purple", "pink", "gray"];

const MAX_NODES = 80;
const MAX_EDGES = 160;

const cleanText = (value, max = 60) => String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

function cleanId(value) {
  const id = String(value ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);
  return /^[A-Za-z]/.test(id) ? id : id ? `n_${id}` : "";
}

export function emptyGraph() {
  return { direction: "LR", nodes: [], edges: [], groups: [] };
}

// Coerces anything (model output, a share link, old storage) into a well-formed graph.
export function sanitizeGraph(input) {
  const raw = input && typeof input === "object" ? input : {};
  const graph = emptyGraph();
  graph.direction = raw.direction === "TB" ? "TB" : "LR";

  const groupIds = new Set();
  for (const g of Array.isArray(raw.groups) ? raw.groups : []) {
    const id = cleanId(g?.id);
    if (!id || groupIds.has(id)) continue;
    groupIds.add(id);
    graph.groups.push({ id, label: cleanText(g.label, 40) || id });
  }

  const nodeIds = new Set();
  for (const n of (Array.isArray(raw.nodes) ? raw.nodes : []).slice(0, MAX_NODES)) {
    const id = cleanId(n?.id);
    if (!id || nodeIds.has(id) || groupIds.has(id)) continue;
    nodeIds.add(id);
    const group = cleanId(n.group);
    graph.nodes.push({
      id,
      label: cleanText(n.label) || id,
      kind: KINDS.includes(n.kind) ? n.kind : "other",
      tech: cleanText(n.tech, 40),
      color: COLORS.includes(n.color) ? n.color : null,
      group: groupIds.has(group) ? group : null,
    });
  }

  // Drop groups nobody belongs to.
  const usedGroups = new Set(graph.nodes.map((n) => n.group).filter(Boolean));
  graph.groups = graph.groups.filter((g) => usedGroups.has(g.id));

  const edgeKeys = new Set();
  for (const e of (Array.isArray(raw.edges) ? raw.edges : []).slice(0, MAX_EDGES)) {
    const from = cleanId(e?.from);
    const to = cleanId(e?.to);
    if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) continue;
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    graph.edges.push({ from, to, label: cleanText(e.label, 40), style: e.style === "dashed" ? "dashed" : "solid" });
  }
  return graph;
}

export const edgeId = (e) => `${e.from}->${e.to}`;

// ---- Mermaid export (GitHub renders this natively) ----

const SHAPES = {
  client: ["([", "])"],
  database: ["[(", ")]"],
  cache: ["[(", ")]"],
  storage: ["[(", ")]"],
  queue: ["[[", "]]"],
  external: ["{{", "}}"],
  function: ["[/", "/]"],
};

const MERMAID_COLORS = {
  red: "fill:#fbe4e1,stroke:#c4473a", orange: "fill:#fbe9dc,stroke:#c9652f", amber: "fill:#fbf0d7,stroke:#b9861c",
  green: "fill:#e5f2e3,stroke:#4f8a45", teal: "fill:#dff1ee,stroke:#2f8578", blue: "fill:#e2ecf8,stroke:#3c6fb0",
  purple: "fill:#ece6f7,stroke:#7354b0", pink: "fill:#f8e3ed,stroke:#b5487c", gray: "fill:#eeede8,stroke:#7a786f",
};

const quote = (text) => `"${String(text).replace(/"/g, "#quot;")}"`;

export function toMermaid(graph) {
  const lines = [`flowchart ${graph.direction}`];
  const nodeLine = (n) => {
    const [open, close] = SHAPES[n.kind] || ["[", "]"];
    const label = n.tech ? `${n.label}<br/><small>${n.tech}</small>` : n.label;
    return `${n.id}${open}${quote(label)}${close}`;
  };
  for (const n of graph.nodes.filter((n) => !n.group)) lines.push(`  ${nodeLine(n)}`);
  for (const g of graph.groups) {
    lines.push(`  subgraph ${g.id}[${quote(g.label)}]`);
    for (const n of graph.nodes.filter((n) => n.group === g.id)) lines.push(`    ${nodeLine(n)}`);
    lines.push("  end");
  }
  for (const e of graph.edges) {
    const arrow = e.style === "dashed" ? "-.->" : "-->";
    lines.push(`  ${e.from} ${arrow}${e.label ? `|${quote(e.label)}|` : ""} ${e.to}`);
  }
  const used = [...new Set(graph.nodes.map((n) => n.color).filter(Boolean))];
  for (const color of used) {
    lines.push(`  classDef ${color} ${MERMAID_COLORS[color]}`);
    lines.push(`  class ${graph.nodes.filter((n) => n.color === color).map((n) => n.id).join(",")} ${color}`);
  }
  return lines.join("\n");
}

// Compact text form of the graph for prompts (no positions, no UI state).
export function graphForPrompt(graph) {
  return JSON.stringify(graph);
}

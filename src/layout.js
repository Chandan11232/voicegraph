// ELK is ~1.4 MB, so it loads on first layout instead of with the page.
let elkPromise;
const getElk = () => (elkPromise ||= import("elkjs/lib/elk.bundled.js").then(({ default: ELK }) => new ELK()));

export const DEFAULT_SIZE = { width: 220, height: 68 };
export const GROUP_PAD = { top: 44, side: 22, bottom: 22 };

const sizeOf = (sizes, id) => sizes[id] || DEFAULT_SIZE;

// Full automatic layout (layered, groups as compound nodes). Returns absolute positions by node id.
export async function autoLayout(graph, sizes) {
  const toElk = (n) => ({ id: n.id, ...sizeOf(sizes, n.id) });
  const root = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": graph.direction === "TB" ? "DOWN" : "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.nodeNode": "44",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    },
    children: [
      ...graph.nodes.filter((n) => !n.group).map(toElk),
      ...graph.groups.map((g) => ({
        id: `group:${g.id}`,
        layoutOptions: { "elk.padding": `[top=${GROUP_PAD.top},left=${GROUP_PAD.side},bottom=${GROUP_PAD.bottom},right=${GROUP_PAD.side}]` },
        children: graph.nodes.filter((n) => n.group === g.id).map(toElk),
      })),
    ],
    edges: graph.edges.map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] })),
  };

  const result = await (await getElk()).layout(root);
  const positions = {};
  const walk = (node, ox, oy) => {
    for (const child of node.children || []) {
      const x = ox + (child.x || 0);
      const y = oy + (child.y || 0);
      if (child.id.startsWith("group:")) walk(child, x, y);
      else positions[child.id] = { x, y };
    }
  };
  walk(result, 0, 0);
  return positions;
}

const overlaps = (a, b, gap = 24) =>
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

// Keeps nodes the user already has where they are; only new nodes get placed.
// New nodes take their spot from a full layout, shifted to line up with the existing nodes,
// then nudged until they don't overlap anything.
export async function placeNodes(graph, prevPositions, sizes, { force = false } = {}) {
  const existing = graph.nodes.filter((n) => prevPositions[n.id]);
  const fresh = graph.nodes.filter((n) => !prevPositions[n.id]);
  const layout = await autoLayout(graph, sizes);

  if (force || existing.length === 0 || fresh.length > existing.length) return layout;
  if (fresh.length === 0) {
    return Object.fromEntries(graph.nodes.map((n) => [n.id, prevPositions[n.id]]));
  }

  const positions = Object.fromEntries(existing.map((n) => [n.id, prevPositions[n.id]]));
  const neighbours = (id) => graph.edges.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : []));

  for (const node of fresh) {
    // Offset = how far the user's arrangement sits from the auto layout, measured on nearby placed nodes.
    const anchors = neighbours(node.id).filter((id) => positions[id] && layout[id]);
    const refs = anchors.length ? anchors : existing.map((n) => n.id);
    const dx = refs.reduce((s, id) => s + (positions[id].x - layout[id].x), 0) / refs.length;
    const dy = refs.reduce((s, id) => s + (positions[id].y - layout[id].y), 0) / refs.length;
    const size = sizeOf(sizes, node.id);
    const box = { x: layout[node.id].x + dx, y: layout[node.id].y + dy, ...size };

    const others = () => Object.entries(positions).map(([id, p]) => ({ ...p, ...sizeOf(sizes, id) }));
    for (let i = 0; i < 40 && others().some((o) => overlaps(box, o)); i++) {
      if (graph.direction === "TB") box.x += size.width / 2 + 12;
      else box.y += size.height / 2 + 12;
    }
    positions[node.id] = { x: box.x, y: box.y };
  }
  return positions;
}

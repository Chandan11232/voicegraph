import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, MiniMap, MarkerType, useReactFlow } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { nodeTypes } from "./components/nodes.jsx";
import { Icon } from "./icons.jsx";
import { callApi } from "./api.js";
import { placeNodes, DEFAULT_SIZE, GROUP_PAD } from "./layout.js";
import { emptyGraph, sanitizeGraph, toMermaid, edgeId } from "../shared/graph.js";
import { loadStore, saveStore, makeDoc, makeSampleDoc, readSharedDoc, shareUrl } from "./storage.js";
import {
  matchLocalCommand, SUGGESTIONS_EMPTY, SUGGESTIONS_SAMPLE, SUGGESTIONS_GENERIC, SUGGESTIONS_AFTER_REVIEW, EVERYTHING_YOU_CAN_SAY,
} from "./commands.js";
import { resolveNodes, parseCount, parseOrdinal, findDocByTitle } from "./match.js";

const AUTO_RUN_DELAY_MS = 900;
const MAX_UNDO = 60;
const MAX_LOG = 60;
const NO_MATCH = Symbol("no-match");
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };
const KIND_COLORS = {
  client: "#3c6fb0", service: "#c9552f", function: "#a87410", database: "#3f7f45", cache: "#c0392b",
  queue: "#7354b0", storage: "#2f8578", external: "#6f6d64", ai: "#9b3fb5", other: "#8a887f",
};

function initStore() {
  let store = loadStore() || { current: null, docs: {} };
  const shared = readSharedDoc();
  if (shared) {
    store.docs[shared.id] = shared;
    store.current = shared.id;
    history.replaceState(null, "", "/app");
  } else if (new URLSearchParams(location.search).get("sample")) {
    const sample = Object.values(store.docs).find((d) => d.isSample) || makeSampleDoc();
    store.docs[sample.id] = sample;
    store.current = sample.id;
    history.replaceState(null, "", "/app");
  }
  if (!store.current) {
    const sample = makeSampleDoc();
    store = { current: sample.id, docs: { [sample.id]: sample } };
  }
  return store;
}

function labelList(graph, ids) {
  const labels = ids.map((id) => graph.nodes.find((n) => n.id === id)?.label).filter(Boolean);
  if (labels.length > 3) return `${labels.slice(0, 2).join(", ")} and ${labels.length - 2} more`;
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0] || "it";
}

// Rendered ids for merged two-way arrows look like "a<->b"; the graph stores "a->b" and "b->a".
const expandEdgeIds = (ids) => ids.flatMap((id) => {
  if (!id.includes("<->")) return [id];
  const [a, b] = id.split("<->");
  return [`${a}->${b}`, `${b}->${a}`];
});

const snapshot = (doc) => ({ graph: doc.graph, positions: doc.positions });

function download(href, filename) {
  const a = Object.assign(document.createElement("a"), { href, download: filename });
  a.click();
}

const slug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram";

export default function App() {
  const rf = useReactFlow();
  const [store, setStore] = useState(initStore);
  const doc = store.docs[store.current];
  const [sizes, setSizes] = useState({});
  const [selection, setSelection] = useState([]);
  const [selectedEdges, setSelectedEdges] = useState([]);
  const [busy, setBusy] = useState(null);
  const [findings, setFindings] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [toast, setToast] = useState(null);
  const [menu, setMenu] = useState(null); // "docs" | "export" | null
  const [sayAllOpen, setSayAllOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [prefs, setPrefs] = useState(() => {
    try { return { autoRun: true, speak: false, ...JSON.parse(localStorage.getItem("saydiagram:prefs") || "{}") }; } catch { return { autoRun: true, speak: false }; }
  });

  const docRef = useRef(doc);
  docRef.current = doc;
  const storeRef = useRef(store);
  storeRef.current = store;
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const historyRef = useRef({});
  const dragStart = useRef(null);
  const commandRef = useRef(null);
  const autoTimer = useRef(null);
  const queuedRef = useRef(null);
  const [pendingRun, setPendingRun] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const logRef = useRef(null);

  const archSelection = selection.filter((id) => !id.startsWith("group:"));

  // ---- Persistence ----

  useEffect(() => {
    const t = setTimeout(() => saveStore(store), 250);
    return () => clearTimeout(t);
  }, [store]);

  useEffect(() => {
    try { localStorage.setItem("saydiagram:prefs", JSON.stringify(prefs)); } catch {}
  }, [prefs]);

  // ---- Doc updates ----

  const hist = (id) => (historyRef.current[id] ||= { undo: [], redo: [] });

  const setDocFields = useCallback((fields) => {
    setStore((s) => {
      const cur = s.docs[s.current];
      return { ...s, docs: { ...s.docs, [cur.id]: { ...cur, ...fields, updatedAt: Date.now() } } };
    });
  }, []);

  // Records an undo step, then applies the change.
  const commit = useCallback((fields) => {
    const cur = docRef.current;
    const h = hist(cur.id);
    h.undo = [...h.undo, snapshot(cur)].slice(-MAX_UNDO);
    h.redo = [];
    setDocFields(fields);
    if (fields.graph) setFindings(null);
  }, [setDocFields]);

  const addLog = useCallback((...entries) => {
    setStore((s) => {
      const cur = s.docs[s.current];
      return { ...s, docs: { ...s.docs, [cur.id]: { ...cur, log: [...(cur.log || []), ...entries].slice(-MAX_LOG) } } };
    });
  }, []);

  const showToast = useCallback((text) => {
    setToast({ text, key: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const speak = useCallback((text) => {
    if (!prefs.speak || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }, [prefs.speak]);

  const animate = useCallback(() => {
    setAnimating(true);
    setTimeout(() => setAnimating(false), 600);
  }, []);

  const fitSoon = useCallback((opts = {}) => {
    setTimeout(() => rf.fitView({ duration: 600, padding: 0.22, maxZoom: 1.4, ...opts }), 80);
  }, [rf]);

  const focusCommand = useCallback(() => setTimeout(() => commandRef.current?.focus(), 0), []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [doc.log?.length]);

  // Switching diagrams: reset per-diagram UI state and frame the new one.
  useEffect(() => {
    setSelection([]);
    setSelectedEdges([]);
    setFindings(null);
    fitSoon({ duration: 0 });
  }, [doc.id, fitSoon]);

  // Lay out any nodes that have no position yet (sample, shared links, old saves).
  useEffect(() => {
    const missing = doc.graph.nodes.some((n) => !doc.positions[n.id]);
    if (!missing) return;
    let cancelled = false;
    placeNodes(doc.graph, doc.positions, sizesRef.current).then((positions) => {
      if (cancelled) return;
      setDocFields({ positions });
      fitSoon({ duration: 0 });
    });
    return () => { cancelled = true; };
  }, [doc.id, doc.graph, doc.positions, setDocFields, fitSoon]);

  // ---- Graph edits by hand ----

  const renameNode = useCallback((id, label) => {
    const cur = docRef.current;
    commit({ graph: { ...cur.graph, nodes: cur.graph.nodes.map((n) => (n.id === id ? { ...n, label } : n)) } });
  }, [commit]);

  const renameGroup = useCallback((rfId, label) => {
    const cur = docRef.current;
    const gid = rfId.replace(/^group:/, "");
    commit({ graph: { ...cur.graph, groups: cur.graph.groups.map((g) => (g.id === gid ? { ...g, label } : g)) } });
  }, [commit]);

  const removeItems = useCallback((nodeIds = [], edgeIds = []) => {
    const cur = docRef.current;
    const groupIds = new Set(nodeIds.filter((id) => id.startsWith("group:")).map((id) => id.slice(6)));
    const gone = new Set(nodeIds.filter((id) => !id.startsWith("group:")));
    const edgesGone = new Set(expandEdgeIds(edgeIds));
    if (!gone.size && !groupIds.size && !edgesGone.size) return 0;
    const graph = sanitizeGraph({
      ...cur.graph,
      nodes: cur.graph.nodes.filter((n) => !gone.has(n.id)).map((n) => (groupIds.has(n.group) ? { ...n, group: null } : n)),
      groups: cur.graph.groups.filter((g) => !groupIds.has(g.id)),
      edges: cur.graph.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to) && !edgesGone.has(edgeId(e))),
    });
    const positions = { ...cur.positions };
    for (const id of gone) delete positions[id];
    commit({ graph, positions });
    setSelection([]);
    setSelectedEdges([]);
    return gone.size + groupIds.size + edgesGone.size;
  }, [commit]);

  // ---- React Flow wiring ----

  const findingByNode = useMemo(() => {
    const map = {};
    for (const f of findings || []) {
      for (const id of f.nodeIds) {
        if (!map[id] || SEVERITY_RANK[f.severity] > SEVERITY_RANK[map[id]]) map[id] = f.severity;
      }
    }
    return map;
  }, [findings]);

  const groupBoxes = useMemo(() => {
    const boxes = {};
    for (const g of doc.graph.groups) {
      const members = doc.graph.nodes.filter((n) => n.group === g.id && doc.positions[n.id]);
      if (!members.length) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of members) {
        const p = doc.positions[n.id];
        const s = sizes[n.id] || DEFAULT_SIZE;
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + s.width); maxY = Math.max(maxY, p.y + s.height);
      }
      boxes[g.id] = {
        x: minX - GROUP_PAD.side, y: minY - GROUP_PAD.top,
        width: maxX - minX + GROUP_PAD.side * 2, height: maxY - minY + GROUP_PAD.top + GROUP_PAD.bottom,
      };
    }
    return boxes;
  }, [doc.graph, doc.positions, sizes]);

  const nodes = useMemo(() => {
    const groups = doc.graph.groups.filter((g) => groupBoxes[g.id]).map((g) => {
      const box = groupBoxes[g.id];
      return {
        id: `group:${g.id}`, type: "group", position: { x: box.x, y: box.y },
        width: box.width, height: box.height, measured: { width: box.width, height: box.height }, style: { width: box.width, height: box.height },
        data: { label: g.label, onRename: renameGroup }, selected: selection.includes(`group:${g.id}`), zIndex: -1,
      };
    });
    const arch = doc.graph.nodes.map((n) => ({
      id: n.id, type: "arch", position: doc.positions[n.id] || { x: 0, y: 0 },
      // Hand React Flow the sizes it measured, so the minimap, fitView and export see real bounds.
      ...(sizes[n.id] && { measured: sizes[n.id] }),
      data: { label: n.label, kind: n.kind, tech: n.tech, color: n.color, direction: doc.graph.direction, finding: findingByNode[n.id], onRename: renameNode },
      selected: selection.includes(n.id),
    }));
    return [...groups, ...arch];
  }, [doc.graph, doc.positions, groupBoxes, sizes, selection, findingByNode, renameNode, renameGroup]);

  const edges = useMemo(() => {
    const center = (id) => {
      const p = doc.positions[id] || { x: 0, y: 0 };
      const s = sizes[id] || DEFAULT_SIZE;
      return { x: p.x + s.width / 2, y: p.y + s.height / 2 };
    };
    // Leave and enter on the sides that face each other, so arrows never loop around a box.
    const sidesFor = (from, to) => {
      const a = center(from);
      const b = center(to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const horizontal = Math.abs(dx) >= Math.abs(dy) * (doc.graph.direction === "TB" ? 1.4 : 0.7);
      if (horizontal) return dx >= 0 ? ["right", "left"] : ["left", "right"];
      return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
    };
    const marker = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#1a1a17" };
    const byId = new Map(doc.graph.edges.map((e) => [edgeId(e), e]));
    const drawn = new Set();
    const out = [];
    for (const e of doc.graph.edges) {
      if (drawn.has(edgeId(e))) continue;
      // A request/response pair (A→B and B→A) becomes one two-headed arrow.
      const back = byId.get(`${e.to}->${e.from}`);
      drawn.add(edgeId(e));
      if (back) drawn.add(edgeId(back));
      const id = back ? `${e.from}<->${e.to}` : edgeId(e);
      const [sourceSide, targetSide] = sidesFor(e.from, e.to);
      const dashed = e.style === "dashed" && (!back || back.style === "dashed");
      out.push({
        id, source: e.from, target: e.to, sourceHandle: `s-${sourceSide}`, targetHandle: `t-${targetSide}`,
        label: [e.label, back?.label].filter(Boolean).join(" / ") || undefined,
        animated: dashed, className: dashed ? "dashed" : undefined, selected: selectedEdges.includes(id),
        markerEnd: marker, ...(back && { markerStart: marker }),
      });
    }
    return out;
  }, [doc.graph.edges, doc.positions, sizes, selectedEdges]);

  const onNodesChange = useCallback((changes) => {
    const cur = docRef.current;
    const dims = {};
    let sel = null;
    let positions = null;
    const removed = [];
    for (const c of changes) {
      if (c.type === "dimensions" && c.dimensions && !c.id.startsWith("group:")) dims[c.id] = c.dimensions;
      else if (c.type === "select") {
        sel ||= new Set(selectionRef.current);
        c.selected ? sel.add(c.id) : sel.delete(c.id);
      } else if (c.type === "position" && c.position) {
        positions ||= { ...cur.positions };
        if (c.id.startsWith("group:")) {
          // Dragging a group moves its members by the same amount.
          const gid = c.id.slice(6);
          const box = groupBoxes[gid];
          if (!box) continue;
          const dx = c.position.x - box.x;
          const dy = c.position.y - box.y;
          for (const n of cur.graph.nodes) {
            if (n.group === gid && positions[n.id]) positions[n.id] = { x: positions[n.id].x + dx, y: positions[n.id].y + dy };
          }
        } else {
          positions[c.id] = c.position;
        }
      } else if (c.type === "remove") removed.push(c.id);
    }
    if (Object.keys(dims).length) {
      setSizes((s) => {
        const changed = Object.entries(dims).some(([id, d]) => s[id]?.width !== d.width || s[id]?.height !== d.height);
        return changed ? { ...s, ...dims } : s;
      });
    }
    if (sel) setSelection([...sel]);
    if (positions) setDocFields({ positions });
    if (removed.length) removeItems(removed, []);
  }, [groupBoxes, setDocFields, removeItems]);

  const onEdgesChange = useCallback((changes) => {
    let sel = null;
    const removed = [];
    for (const c of changes) {
      if (c.type === "select") {
        sel ||= new Set(selectedEdges);
        c.selected ? sel.add(c.id) : sel.delete(c.id);
      } else if (c.type === "remove") removed.push(c.id);
    }
    if (sel) setSelectedEdges([...sel]);
    if (removed.length) removeItems([], removed);
  }, [selectedEdges, removeItems]);

  const onConnect = useCallback(({ source, target }) => {
    const cur = docRef.current;
    const graph = sanitizeGraph({ ...cur.graph, edges: [...cur.graph.edges, { from: source, to: target }] });
    if (graph.edges.length === cur.graph.edges.length) return;
    commit({ graph });
    showToast("Connected. Double-click the arrow to label it.");
  }, [commit, showToast]);

  const onEdgeDoubleClick = useCallback((_event, edge) => {
    const cur = docRef.current;
    const label = window.prompt("Label this connection", edge.label || "");
    if (label === null) return;
    // A two-headed arrow takes the label on its forward edge; the reverse one's label is cleared.
    const [forward, reverse] = expandEdgeIds([edge.id]);
    const text = label.trim().slice(0, 40);
    commit({ graph: { ...cur.graph, edges: cur.graph.edges.map((e) => (edgeId(e) === forward ? { ...e, label: text } : edgeId(e) === reverse ? { ...e, label: "" } : e)) } });
  }, [commit]);

  const onNodeDragStart = useCallback(() => {
    dragStart.current = snapshot(docRef.current);
  }, []);

  const onNodeDragStop = useCallback(() => {
    const before = dragStart.current;
    dragStart.current = null;
    if (!before || before.positions === docRef.current.positions) return;
    const h = hist(docRef.current.id);
    h.undo = [...h.undo, before].slice(-MAX_UNDO);
    h.redo = [];
    focusCommand();
  }, [focusCommand]);

  // ---- Actions ----

  const undo = useCallback(() => {
    const cur = docRef.current;
    const h = hist(cur.id);
    if (!h.undo.length) return false;
    h.redo = [...h.redo, snapshot(cur)];
    setDocFields(h.undo.at(-1));
    h.undo = h.undo.slice(0, -1);
    setFindings(null);
    animate();
    return true;
  }, [setDocFields, animate]);

  const redo = useCallback(() => {
    const cur = docRef.current;
    const h = hist(cur.id);
    if (!h.redo.length) return false;
    h.undo = [...h.undo, snapshot(cur)];
    setDocFields(h.redo.at(-1));
    h.redo = h.redo.slice(0, -1);
    animate();
    return true;
  }, [setDocFields, animate]);

  const tidy = useCallback(async () => {
    const cur = docRef.current;
    if (!cur.graph.nodes.length) return false;
    const positions = await placeNodes(cur.graph, {}, sizesRef.current, { force: true });
    commit({ positions });
    animate();
    fitSoon();
    return true;
  }, [commit, animate, fitSoon]);

  const exportImage = useCallback(async (kind) => {
    const all = rf.getNodes();
    if (!all.length) return false;
    const bounds = rf.getNodesBounds(all);
    const pad = 48;
    const width = Math.ceil(bounds.width + pad * 2);
    const height = Math.ceil(bounds.height + pad * 2);
    const el = document.querySelector(".react-flow__viewport");
    const options = {
      backgroundColor: "#f7f6ef", width, height, pixelRatio: 2,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${pad - bounds.x}px, ${pad - bounds.y}px) scale(1)` },
      filter: (node) => !node.classList?.contains("react-flow__handle"),
    };
    const url = kind === "png" ? await toPng(el, options) : await toSvg(el, options);
    download(url, `${slug(docRef.current.title)}.${kind}`);
    return true;
  }, [rf]);

  const copyText = useCallback(async (text, message) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(message);
      return true;
    } catch {
      showToast("Couldn't access the clipboard.");
      return false;
    }
  }, [showToast]);

  const copyMermaid = useCallback(() => {
    const cur = docRef.current;
    if (!cur.graph.nodes.length) return Promise.resolve(false);
    return copyText("```mermaid\n" + toMermaid(cur.graph) + "\n```\n", "Copied. Paste it into any GitHub README.");
  }, [copyText]);

  const share = useCallback(() => copyText(shareUrl(docRef.current), "Share link copied."), [copyText]);

  const review = useCallback(async () => {
    const cur = docRef.current;
    if (busyRef.current) return;
    if (!cur.graph.nodes.length) return addLog({ role: "assistant", text: "Draw something first, then I can review it." });
    setBusy("review");
    try {
      const res = await callApi({ mode: "review", graph: cur.graph });
      setFindings(res.findings);
      addLog({ role: "assistant", kind: "review", text: res.summary || "Here's what I'd look at.", findings: res.findings });
      speak(res.summary || "Review ready.");
    } catch (err) {
      addLog({ role: "assistant", text: err.message, error: true });
    } finally {
      setBusy(null);
    }
  }, [addLog, speak]);

  const writeDocs = useCallback(async () => {
    const cur = docRef.current;
    if (busyRef.current) return;
    if (!cur.graph.nodes.length) return addLog({ role: "assistant", text: "Draw something first, then I can document it." });
    setBusy("docs");
    try {
      const res = await callApi({ mode: "docs", graph: cur.graph });
      const markdown = `## Architecture\n\n\`\`\`mermaid\n${toMermaid(cur.graph)}\n\`\`\`\n\n${res.markdown}\n`;
      addLog({ role: "assistant", kind: "docs", text: "Your README section is ready, with the diagram included as Mermaid.", markdown });
      speak("Your README section is ready.");
    } catch (err) {
      addLog({ role: "assistant", text: err.message, error: true });
    } finally {
      setBusy(null);
    }
  }, [addLog, speak]);

  const reply = useCallback((text) => {
    addLog({ role: "assistant", text });
    speak(text);
  }, [addLog, speak]);

  const runAction = useCallback(async (action, arg) => {
    const cur = docRef.current;
    switch (action) {
      case "undo": return reply(undo() ? "Went back one step." : "Nothing to undo.");
      case "redo": return reply(redo() ? "Brought that change back." : "Nothing to redo.");
      case "clear":
        if (!cur.graph.nodes.length) return reply("The canvas is already empty.");
        commit({ graph: emptyGraph(), positions: {}, isSample: false });
        return reply("Cleared the canvas. Say “undo” to bring it back.");
      case "tidy": return reply((await tidy()) ? "Tidied up the layout." : "Nothing to arrange yet.");
      case "fit": fitSoon(); return reply("Fitted the diagram to the screen.");
      case "zoomTo": {
        const level = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(arg) / 100));
        rf.zoomTo(level, { duration: 400 });
        return reply(`Zoomed to ${Math.round(level * 100)}%.`);
      }
      case "zoomIn": rf.zoomIn({ duration: 300 }); return reply("Zoomed in.");
      case "zoomOut": rf.zoomOut({ duration: 300 }); return reply("Zoomed out.");
      case "focus": {
        const { ids } = resolveNodes(cur.graph, arg, selectionRef.current);
        if (!ids.length) return NO_MATCH;
        setSelection(ids);
        rf.fitView({ nodes: ids.map((id) => ({ id })), duration: 500, maxZoom: 1.6, padding: ids.length > 1 ? 0.4 : 1.2 });
        return reply(`Here's ${labelList(cur.graph, ids)}.`);
      }
      case "select": {
        const { ids } = resolveNodes(cur.graph, arg, selectionRef.current);
        if (!ids.length) return reply(`I couldn't find “${arg}” on the diagram.`);
        setSelection(ids);
        return reply(`Selected ${labelList(cur.graph, ids)}. Now say what to do with ${ids.length > 1 ? "them" : "it"}.`);
      }
      case "move": {
        const { ids } = resolveNodes(cur.graph, arg.target, selectionRef.current);
        if (!ids.length) {
          return reply(/^(this|these|it|them|that|those)$/.test(arg.target) ? "Select a box first, then say “move this left”." : `I couldn't find “${arg.target}” on the diagram.`);
        }
        const step = { "tiny bit": 40, bit: 70, little: 70, lot: 320, way: 320 }[arg.amount] || 160;
        const [dx, dy] = { left: [-step, 0], right: [step, 0], up: [0, -step], higher: [0, -step], down: [0, step], lower: [0, step] }[arg.dir];
        const positions = { ...cur.positions };
        for (const id of ids) if (positions[id]) positions[id] = { x: positions[id].x + dx, y: positions[id].y + dy };
        commit({ positions });
        animate();
        return reply(`Moved ${labelList(cur.graph, ids)} ${arg.dir === "higher" ? "up" : arg.dir === "lower" ? "down" : arg.dir}.`);
      }
      case "undoMany": {
        const n = Math.min(parseCount(arg), 20);
        let done = 0;
        while (done < n && undo()) done++;
        return reply(done ? `Went back ${done} step${done === 1 ? "" : "s"}.` : "Nothing to undo.");
      }
      case "fix": {
        const last = [...(cur.log || [])].reverse().find((l) => l.kind === "review" && l.findings?.length);
        if (!last) return reply("Run a review first: say “review my architecture”.");
        const index = parseOrdinal(arg);
        const picked = index === null ? last.findings : [last.findings.at(index)].filter(Boolean);
        if (!picked.length) return reply(`The last review only had ${last.findings.length} findings.`);
        const list = picked.map((f, i) => `${i + 1}. ${f.title}: ${f.detail}${f.nodeIds.length ? ` (boxes: ${f.nodeIds.join(", ")})` : ""}`).join("\n");
        return { aiCommand: `Change the diagram to fix ${picked.length === 1 ? "this architecture review finding" : "these architecture review findings"}. Add, remove or reconnect boxes as needed, and say briefly what you changed:\n${list}` };
      }
      case "newDoc": {
        const title = arg ? arg.replace(/\b\w/g, (c) => c.toUpperCase()) : "Untitled diagram";
        newDoc(false, title);
        return reply(`Started “${title}”. Describe your system.`);
      }
      case "sampleDoc":
        newDoc(true);
        return undefined;
      case "renameDoc": {
        const title = arg.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
        setDocFields({ title });
        return reply(`Renamed this diagram to “${title}”.`);
      }
      case "openDoc": {
        const found = findDocByTitle(Object.values(storeRef.current.docs), arg);
        if (!found) return reply(`I couldn't find a diagram called “${arg}”. Open the menu next to the title to see them all.`);
        if (found.id === cur.id) return reply(`You're already in “${found.title}”.`);
        switchDoc(found.id);
        return reply(`Opened “${found.title}”.`);
      }
      case "speakOn":
        setPrefs((p) => ({ ...p, speak: true }));
        addLog({ role: "assistant", text: "I'll read my replies aloud. Say “stop talking” to turn it off." });
        if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance("I'll read my replies aloud."));
        return undefined;
      case "speakOff":
        if ("speechSynthesis" in window) speechSynthesis.cancel();
        setPrefs((p) => ({ ...p, speak: false }));
        addLog({ role: "assistant", text: "Okay, I'll stay quiet." });
        return undefined;
      case "png": return reply((await exportImage("png")) ? "Downloaded the PNG." : "Nothing to download yet.");
      case "svg": return reply((await exportImage("svg")) ? "Downloaded the SVG." : "Nothing to download yet.");
      case "mermaid": return reply((await copyMermaid()) ? "Copied the Mermaid code for your README." : "Nothing to copy yet.");
      case "share": return reply((await share()) ? "Copied a share link. Anyone who opens it gets this diagram." : "Couldn't copy the link.");
      case "review": return review();
      case "docs": return writeDocs();
      case "delete": {
        const count = removeItems(selectionRef.current, selectedEdges);
        return reply(count ? `Deleted ${count === 1 ? "it" : `${count} items`}.` : "Select a box first (click it), then say “delete this”.");
      }
      case "deselect": setSelection([]); setSelectedEdges([]); return reply("Cleared the selection.");
      default: return undefined;
    }
  }, [reply, undo, redo, commit, tidy, fitSoon, exportImage, copyMermaid, share, review, writeDocs, removeItems, selectedEdges, rf, animate, addLog, setDocFields]);

  const runCommand = useCallback(async (raw) => {
    const text = raw.trim();
    if (!text) return;
    clearTimeout(autoTimer.current);
    setPendingRun(false);
    if (busyRef.current) {
      // Spoken while the AI was still working: keep it and run it as soon as it's free.
      queuedRef.current = text;
      setCommand(text);
      return;
    }
    setCommand("");
    addLog({ role: "user", text });

    let aiCommand = text;
    const local = matchLocalCommand(text);
    if (local) {
      const result = await runAction(local.action, local.arg);
      // NO_MATCH: "show me how auth works" isn't a box name, so it goes to the AI as said.
      if (result?.aiCommand) aiCommand = result.aiCommand;
      else if (result !== NO_MATCH) return;
    }

    const cur = docRef.current;
    setBusy("edit");
    try {
      const res = await callApi({ mode: "edit", command: aiCommand, graph: cur.graph, selection: selectionRef.current.filter((id) => !id.startsWith("group:")) });
      const graph = sanitizeGraph(res.graph);
      const changed = JSON.stringify(graph) !== JSON.stringify(cur.graph);
      if (changed) {
        const force = graph.direction !== cur.graph.direction;
        const positions = await placeNodes(graph, cur.positions, sizesRef.current, { force });
        const countChanged = graph.nodes.length !== cur.graph.nodes.length;
        commit({ graph, positions });
        animate();
        if (countChanged || force) fitSoon();
      }
      reply(res.summary);
    } catch (err) {
      addLog({ role: "assistant", text: err.message, error: true });
    } finally {
      setBusy(null);
      focusCommand();
    }
  }, [addLog, runAction, commit, animate, fitSoon, reply, focusCommand]);

  // ---- Command box: Enter runs; a Wispr Flow dictation (one big insert) runs by itself ----

  const scheduleRun = useCallback((value) => {
    clearTimeout(autoTimer.current);
    if (!prefsRef.current.autoRun || !value.trim()) return;
    setPendingRun(true);
    autoTimer.current = setTimeout(() => runCommand(value), AUTO_RUN_DELAY_MS);
  }, [runCommand]);

  const onCommandInput = (event) => {
    const value = event.target.value;
    const grew = value.length - command.length;
    setCommand(value);
    clearTimeout(autoTimer.current);
    setPendingRun(false);
    // Wispr Flow drops text in as a paste or one big insert (or via accessibility, with no
    // inputType at all). Normal typing arrives one character at a time.
    const ne = event.nativeEvent;
    const dictated = !ne.inputType || ne.inputType === "insertFromPaste" || ne.inputType === "insertReplacementText"
      || (ne.data && ne.data.length > 3) || grew > 3;
    if (dictated) scheduleRun(value);
  };

  // Run anything that was spoken while the AI was busy.
  useEffect(() => {
    if (busy || !queuedRef.current) return;
    const text = queuedRef.current;
    queuedRef.current = null;
    runCommand(text);
  }, [busy, runCommand]);

  // Wherever focus is, keep dictation landing in the command box.
  useEffect(() => {
    const editable = (el) => el?.closest?.("textarea, input, select, [contenteditable='true']");
    const refocus = () => setTimeout(() => {
      if (!editable(document.activeElement)) commandRef.current?.focus();
    }, 0);
    // A paste that lands outside any text field (Wispr Flow after clicking a button,
    // the canvas, or the page itself) becomes a command instead of being lost.
    const onPaste = (e) => {
      const box = commandRef.current;
      const intoBox = e.target === box;
      if (!intoBox && editable(e.target)) return; // title and rename fields paste normally
      const text = e.clipboardData?.getData("text/plain");
      if (!text?.trim()) return;
      // Insert the text ourselves. Wispr Flow restores the previous clipboard right after its
      // Cmd+V, and Chrome re-reads the clipboard to do the insert, so the browser's own paste
      // sometimes finds nothing and silently drops the dictation. The event's copy is reliable.
      e.preventDefault();
      let next = text.trim();
      if (intoBox && box) {
        const { selectionStart: start, selectionEnd: end, value } = box;
        next = value.slice(0, start) + text + value.slice(end);
        const caret = start + text.length;
        setTimeout(() => box.setSelectionRange(caret, caret), 0);
      }
      box?.focus();
      setCommand(next);
      scheduleRun(next);
      if (!prefsRef.current.autoRun) showToast("Got it. Press Enter to run.");
    };
    const onVisible = () => document.visibilityState === "visible" && refocus();
    document.addEventListener("pointerup", refocus);
    document.addEventListener("paste", onPaste);
    window.addEventListener("focus", refocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("pointerup", refocus);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("focus", refocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [scheduleRun, showToast]);

  const onCommandKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      runCommand(command);
    } else if ((event.key === "Delete" || event.key === "Backspace") && !command && (selection.length || selectedEdges.length)) {
      // The box keeps focus for Wispr Flow, so Delete on an empty box deletes the selection.
      event.preventDefault();
      removeItems(selection, selectedEdges);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !command) {
      event.preventDefault();
      if (event.shiftKey ? !redo() : !undo()) showToast(event.shiftKey ? "Nothing to redo" : "Nothing to undo");
    } else if (event.key === "Escape") {
      if (pendingRun) {
        // Lets you fix a mis-heard dictation before it runs.
        clearTimeout(autoTimer.current);
        setPendingRun(false);
        return;
      }
      setSelection([]);
      setSelectedEdges([]);
      setMenu(null);
    }
  };

  // ---- Diagrams ----

  const switchDoc = (id) => {
    setStore((s) => ({ ...s, current: id }));
    setMenu(null);
    focusCommand();
  };

  const newDoc = (sample = false, title) => {
    const d = sample ? makeSampleDoc() : makeDoc({ title, log: [{ role: "assistant", text: "Fresh canvas. Hold Fn and describe your system, the way you'd explain it to a teammate." }] });
    setStore((s) => ({ current: d.id, docs: { ...s.docs, [d.id]: d } }));
    setMenu(null);
    focusCommand();
  };

  const deleteDoc = (id) => {
    if (!window.confirm("Delete this diagram? This can't be undone.")) return;
    setStore((s) => {
      const docs = { ...s.docs };
      delete docs[id];
      if (!Object.keys(docs).length) {
        const d = makeDoc();
        docs[d.id] = d;
      }
      return { current: s.current === id ? Object.values(docs).sort((a, b) => b.updatedAt - a.updatedAt)[0].id : s.current, docs };
    });
  };

  useEffect(() => {
    if (!menu) return;
    const close = (e) => { if (!e.target.closest(".menu-wrap")) setMenu(null); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  useEffect(() => { focusCommand(); }, [focusCommand]);

  // ---- Render ----

  const isEmpty = doc.graph.nodes.length === 0;
  const lastEntry = doc.log?.at(-1);
  const suggestions = isEmpty ? SUGGESTIONS_EMPTY
    : lastEntry?.kind === "review" && lastEntry.findings?.length ? SUGGESTIONS_AFTER_REVIEW
    : doc.isSample ? SUGGESTIONS_SAMPLE : SUGGESTIONS_GENERIC;
  const selectedLabels = doc.graph.nodes.filter((n) => archSelection.includes(n.id)).map((n) => n.label);
  const h = hist(doc.id);
  const busyLabel = { edit: "Drawing…", review: "Reviewing your architecture…", docs: "Writing your README section…" }[busy];
  const sortedDocs = Object.values(store.docs).sort((a, b) => b.updatedAt - a.updatedAt);

  const selectNodes = (ids) => {
    if (!ids.length) return;
    setSelection(ids);
    rf.fitView({ nodes: ids.map((id) => ({ id })), duration: 500, padding: 0.8, maxZoom: 1.3 });
  };

  return (
    <div className="ws">
      <header className="topbar">
        <a className="ws-logo" href="/" title="Voicegraph home">
          <span className="ws-logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          Voicegraph
        </a>
        <span className="divider" />
        <div className="menu-wrap">
          <div className="doc-title">
            <input
              value={doc.title}
              onChange={(e) => setDocFields({ title: e.target.value.slice(0, 80) })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              aria-label="Diagram name"
              size={Math.max(6, doc.title.length + 1)}
            />
            <button type="button" className="ghost-icon" onClick={() => setMenu(menu === "docs" ? null : "docs")} aria-label="Your diagrams" aria-expanded={menu === "docs"}>
              <Icon name="chevron" size={16} />
            </button>
          </div>
          {menu === "docs" && (
            <div className="menu docs-menu">
              <p className="menu-label">Your diagrams</p>
              {sortedDocs.map((d) => (
                <div key={d.id} className={`menu-row${d.id === doc.id ? " active" : ""}`}>
                  <button type="button" onClick={() => switchDoc(d.id)}>
                    <Icon name="file" size={15} /> <span>{d.title || "Untitled diagram"}</span>
                    <em>{d.graph.nodes.length} boxes</em>
                  </button>
                  <button type="button" className="ghost-icon" onClick={() => deleteDoc(d.id)} aria-label={`Delete ${d.title}`}><Icon name="trash" size={14} /></button>
                </div>
              ))}
              <div className="menu-sep" />
              <button type="button" className="menu-item" onClick={() => newDoc(false)}><Icon name="plus" size={15} /> New diagram</button>
              <button type="button" className="menu-item" onClick={() => newDoc(true)}><Icon name="file" size={15} /> Open a fresh sample</button>
            </div>
          )}
        </div>
        <span className="badge">{doc.graph.nodes.length} boxes</span>
        {doc.isSample && <span className="badge badge-accent">Sample</span>}

        <div className="top-actions">
          <button type="button" className="btn" onClick={() => undo() || showToast("Nothing to undo")} disabled={!h.undo.length} title="Undo · say “undo”"><Icon name="undo" size={16} /> Undo</button>
          <button type="button" className="btn icon-only" onClick={() => redo() || showToast("Nothing to redo")} disabled={!h.redo.length} title="Redo · say “redo”" aria-label="Redo"><Icon name="redo" size={16} /></button>
          <button type="button" className="btn" onClick={tidy} disabled={isEmpty} title="Auto-arrange · say “tidy up”"><Icon name="tidy" size={16} /> Tidy up</button>
          <button type="button" className="btn" onClick={share} disabled={isEmpty} title="Copy a link to this diagram"><Icon name="share" size={16} /> Share</button>
          <div className="menu-wrap">
            <button type="button" className="btn btn-primary" onClick={() => setMenu(menu === "export" ? null : "export")} disabled={isEmpty} aria-expanded={menu === "export"}>
              <Icon name="download" size={16} /> Export <Icon name="chevron" size={14} />
            </button>
            {menu === "export" && (
              <div className="menu export-menu">
                <button type="button" className="menu-item" onClick={() => { setMenu(null); exportImage("png"); }}><Icon name="download" size={15} /> PNG image</button>
                <button type="button" className="menu-item" onClick={() => { setMenu(null); exportImage("svg"); }}><Icon name="download" size={15} /> SVG vector</button>
                <button type="button" className="menu-item" onClick={() => { setMenu(null); copyMermaid(); }}><Icon name="copy" size={15} /> Copy Mermaid for README</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="body">
        <main className={`canvas-area${animating ? " animating" : ""}`}>
          <div className="canvas-hint">
            {doc.isSample
              ? "Sample diagram. Drag the boxes, fix it by voice, or say “start over” to describe your own."
              : isEmpty ? "" : "Drag to move · drag from a dot to connect · double-click to rename"}
          </div>
          <div className="zoom-pill">
            <button type="button" onClick={() => rf.zoomOut({ duration: 200 })} aria-label="Zoom out"><span>−</span></button>
            <button type="button" className="zoom-value" onClick={() => fitSoon()} title="Fit to screen">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => rf.zoomIn({ duration: 200 })} aria-label="Zoom in"><span>+</span></button>
          </div>
          {busyLabel && <div className="busy-pill"><span className="spinner" /> {busyLabel}</div>}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onNodeClick={focusCommand}
            onPaneClick={focusCommand}
            onMove={(_e, vp) => setZoom(vp.zoom)}
            connectionMode="loose"
            deleteKeyCode={["Backspace", "Delete"]}
            multiSelectionKeyCode={["Shift", "Meta", "Control"]}
            selectionOnDrag={false}
            panOnScroll
            zoomOnPinch
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            defaultEdgeOptions={{ type: "smoothstep", pathOptions: { borderRadius: 14, offset: 22 } }}
          >
            <Background gap={22} size={1.4} color="#d6d3c6" />
            <MiniMap pannable zoomable nodeStrokeWidth={2} nodeBorderRadius={6}
              nodeColor={(n) => (n.type === "group" ? "rgba(122, 84, 176, 0.12)" : KIND_COLORS[n.data.kind] || "#8a887f")} />
          </ReactFlow>

          {isEmpty && (
            <div className="empty">
              <div className="empty-mic"><Icon name="mic" size={30} /></div>
              <h1>Describe a system out loud.</h1>
              <p>Hold <kbd>Fn</kbd> with Wispr Flow and talk, the way you'd explain it to a teammate. It draws by itself when you let go.</p>
            </div>
          )}
        </main>

        <aside className="sidebar">
          <section className="side-section">
            <h2>{isEmpty ? "What should I draw?" : "What should I change?"}</h2>
            <form className={`command-box${busy ? " busy" : ""}`} onSubmit={(e) => { e.preventDefault(); runCommand(command); }}>
              <span className="cmd-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
              <textarea
                ref={commandRef}
                value={command}
                onChange={onCommandInput}
                onKeyDown={onCommandKeyDown}
                rows={1}
                placeholder={busy ? busyLabel : "Say it, or type it…"}
                aria-label="Command"
              />
              <button type="button" className="cmd-mic" onClick={() => { focusCommand(); showToast("Hold Fn and speak. Wispr Flow types right here."); }} aria-label="How to speak">
                <Icon name="mic" size={17} />
              </button>
              <button type="submit" className="cmd-send" disabled={!command.trim() || Boolean(busy)} aria-label="Send">
                <Icon name="send" size={17} />
              </button>
            </form>
            {pendingRun ? (
              <p className="hold-hint heard"><span className="heard-dot" /> Heard you. Running in a moment… <kbd>Esc</kbd> to edit first</p>
            ) : queuedRef.current && busy ? (
              <p className="hold-hint heard"><span className="heard-dot" /> Got it. I'll run this as soon as I finish.</p>
            ) : (
              <p className="hold-hint">Hold <kbd>Fn</kbd> with Wispr Flow, speak, let go. It runs by itself.</p>
            )}
            {selectedLabels.length > 0 ? (
              <p className="selection-chip">
                Talking about <b>{selectedLabels.length > 2 ? `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}` : selectedLabels.join(" and ")}</b>
                <button type="button" onClick={() => setSelection([])} aria-label="Clear selection"><Icon name="close" size={13} /></button>
              </p>
            ) : (
              <p className="privacy"><span aria-hidden="true">●</span> Saved in this browser. No account needed.</p>
            )}
          </section>

          <section className="side-section">
            <h3 className="mono-label">Try saying</h3>
            <div className="chips">
              {suggestions.slice(0, 3).map((s) => (
                <button key={s} type="button" onClick={() => runCommand(s)} disabled={Boolean(busy)}>“{s}”</button>
              ))}
            </div>
            <button type="button" className="see-all" onClick={() => setSayAllOpen(true)}>See everything you can say →</button>
          </section>

          <section className="side-section tools">
            <h3 className="mono-label">Ship it</h3>
            <div className="tool-row">
              <button type="button" className="tool" onClick={review} disabled={isEmpty || Boolean(busy)}>
                <Icon name="review" size={18} />
                <span><b>Review architecture</b><em>Find weak spots</em></span>
              </button>
              <button type="button" className="tool" onClick={writeDocs} disabled={isEmpty || Boolean(busy)}>
                <Icon name="docs" size={18} />
                <span><b>Write README</b><em>From this diagram</em></span>
              </button>
            </div>
          </section>

          <section className="side-section conversation">
            <h3 className="mono-label">Conversation</h3>
            <ol className="log" ref={logRef}>
              {(doc.log || []).map((entry, i) => (
                <li key={i} className={`log-${entry.role}${entry.error ? " log-error" : ""}`}>
                  {entry.role === "user" ? (
                    <p className="said"><Icon name="mic" size={13} /> “{entry.text}”</p>
                  ) : (
                    <div className="answer">
                      <span className="arrow" aria-hidden="true">→</span>
                      <div>
                        <p>{entry.text}</p>
                        {entry.kind === "review" && entry.findings?.length > 0 && (
                          <ul className="findings">
                            {entry.findings.map((f, j) => (
                              <li key={j}>
                                <button type="button" onClick={() => selectNodes(f.nodeIds)} disabled={!f.nodeIds.length}>
                                  <span className={`sev sev-${f.severity}`}>{f.severity}</span>
                                  <b>{f.title}</b>
                                  <span className="detail">{f.detail}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {entry.kind === "docs" && entry.markdown && (
                          <div className="docs-result">
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => copyText(entry.markdown, "README section copied.")}>
                              <Icon name="copy" size={14} /> Copy markdown
                            </button>
                            <details>
                              <summary>Preview</summary>
                              <pre>{entry.markdown}</pre>
                            </details>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="side-section settings">
            <label><input type="checkbox" checked={prefs.autoRun} onChange={(e) => setPrefs((p) => ({ ...p, autoRun: e.target.checked }))} /> Run as soon as dictation lands</label>
            <label><input type="checkbox" checked={prefs.speak} onChange={(e) => setPrefs((p) => ({ ...p, speak: e.target.checked }))} /> Read replies aloud</label>
          </section>
        </aside>
      </div>

      {sayAllOpen && (
        <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setSayAllOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="say-all-title">
            <header>
              <h2 id="say-all-title">Everything you can say</h2>
              <button type="button" className="ghost-icon" onClick={() => setSayAllOpen(false)} aria-label="Close"><Icon name="close" size={18} /></button>
            </header>
            <div className="say-grid">
              {EVERYTHING_YOU_CAN_SAY.map((group) => (
                <section key={group.title}>
                  <h3 className="mono-label">{group.title}</h3>
                  <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" key={toast.key} role="status">{toast.text}</div>}
    </div>
  );
}

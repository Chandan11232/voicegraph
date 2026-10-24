import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { emptyGraph, sanitizeGraph } from "../shared/graph.js";

const KEY = "saydiagram:v2";

export const newId = () => Math.random().toString(36).slice(2, 10);

// Deliberately flawed so there's something to fix by voice (and for Review to catch).
export const SAMPLE_GRAPH = sanitizeGraph({
  direction: "LR",
  nodes: [
    { id: "shoppers", label: "Shoppers", kind: "client", tech: "Browser" },
    { id: "web", label: "Storefront", kind: "service", tech: "Next.js" },
    { id: "api", label: "Orders API", kind: "service", tech: "Node.js" },
    { id: "db", label: "Orders DB", kind: "database", tech: "Postgres" },
    { id: "pay", label: "Payments", kind: "external", tech: "Stripe" },
    { id: "mail", label: "Receipts", kind: "external", tech: "SendGrid" },
  ],
  edges: [
    { from: "shoppers", to: "web" },
    { from: "web", to: "api", label: "REST" },
    { from: "web", to: "db", label: "direct query" },
    { from: "api", to: "db" },
    { from: "api", to: "pay", label: "charge" },
    { from: "api", to: "mail", label: "send receipt" },
  ],
});

export const SAMPLE_INTRO =
  "This sample has two problems: the storefront queries the database directly, and the API emails receipts while the shopper waits. Fix them by voice, run a Review, or say “start over” and describe your own system.";

export function makeDoc({ title = "Untitled diagram", graph = emptyGraph(), positions = {}, isSample = false, log = [] } = {}) {
  return { id: newId(), title, graph, positions, isSample, log, updatedAt: Date.now() };
}

export function makeSampleDoc() {
  return makeDoc({ title: "Online store (sample)", graph: SAMPLE_GRAPH, isSample: true, log: [{ role: "assistant", text: SAMPLE_INTRO }] });
}

export function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.docs && Object.keys(raw.docs).length) {
      for (const doc of Object.values(raw.docs)) doc.graph = sanitizeGraph(doc.graph);
      if (!raw.docs[raw.current]) raw.current = Object.keys(raw.docs)[0];
      return raw;
    }
  } catch {}
  return null;
}

export function saveStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {}
}

// ---- Share links: the whole diagram, compressed into the URL hash ----

export function shareUrl(doc) {
  const payload = compressToEncodedURIComponent(JSON.stringify({ t: doc.title, g: doc.graph, p: doc.positions }));
  return `${location.origin}/app#d=${payload}`;
}

export function readSharedDoc() {
  const match = location.hash.match(/^#d=(.+)$/);
  if (!match) return null;
  try {
    const data = JSON.parse(decompressFromEncodedURIComponent(match[1]));
    const positions = {};
    for (const [id, p] of Object.entries(data.p || {})) {
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) positions[id] = { x: p.x, y: p.y };
    }
    return makeDoc({
      title: String(data.t || "Shared diagram").slice(0, 80),
      graph: sanitizeGraph(data.g),
      positions,
      log: [{ role: "assistant", text: "Opened a shared diagram. It's your copy now: change it by voice or by hand." }],
    });
  } catch {
    return null;
  }
}

// Turns spoken references ("the API", "all databases", "Stripe", "everything") into diagram nodes.

const KIND_WORDS = {
  database: ["database", "databases", "db", "dbs"],
  cache: ["cache", "caches"],
  queue: ["queue", "queues", "broker", "brokers"],
  service: ["service", "services", "server", "servers", "api", "apis", "backend", "backends"],
  client: ["client", "clients", "user", "users", "frontend", "frontends", "app", "apps"],
  function: ["function", "functions", "lambda", "lambdas", "worker", "workers"],
  storage: ["storage", "bucket", "buckets"],
  external: ["external", "third-party", "third", "integration", "integrations"],
  ai: ["ai", "llm", "llms", "model", "models"],
};
const PLURAL_KIND = /^(all|every|each)? ?(the )?(databases|dbs|caches|queues|services|servers|apis|clients|users|functions|lambdas|workers|buckets|integrations|external services|third[- ]party services|models|llms)$/;
const EVERYTHING = /^(everything|all|all of (it|them)|all (the )?(boxes|nodes))$/;
const SELECTED = /^(this|these|it|them|that|those|the selected( ones?| boxes?| nodes?)?|selected)$/;

const words = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const clean = (phrase) => String(phrase || "").toLowerCase().trim().replace(/^(the|my|our)\s+/, "").replace(/\s+(box|boxes|node|nodes)$/, "");

function kindOf(word) {
  return Object.keys(KIND_WORDS).find((k) => KIND_WORDS[k].includes(word));
}

function scoreNode(node, target) {
  const hay = [...words(node.label), ...words(node.tech || ""), ...words(node.id), node.kind];
  const hits = target.filter((w) => hay.includes(w) || hay.some((h) => h.startsWith(w) && w.length > 2)).length;
  // "the database" with no name match still finds the one database.
  const kindHit = target.some((w) => kindOf(w) === node.kind) ? 0.5 : 0;
  return Math.max(hits / target.length, kindHit);
}

// Returns { ids, how } where how is "selection" | "all" | "kind" | "name" | null.
export function resolveNodes(graph, phrase, selection = []) {
  const p = clean(phrase);
  if (SELECTED.test(p)) return { ids: selection.filter((id) => graph.nodes.some((n) => n.id === id)), how: "selection" };
  if (EVERYTHING.test(p)) return { ids: graph.nodes.map((n) => n.id), how: "all" };
  const plural = p.match(PLURAL_KIND);
  if (plural) {
    const kind = kindOf(words(plural[3])[0]) || (/external|third/.test(plural[3]) ? "external" : null);
    const ids = graph.nodes.filter((n) => n.kind === kind || (kind === "service" && n.kind === "service")).map((n) => n.id);
    if (ids.length) return { ids, how: "kind" };
  }
  // Several names: "the API and Redis".
  const parts = p.split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean);
  const ids = [];
  for (const part of parts) {
    const target = words(clean(part));
    if (!target.length) continue;
    const ranked = graph.nodes.map((n) => ({ id: n.id, s: scoreNode(n, target) })).sort((a, b) => b.s - a.s);
    if (ranked[0] && ranked[0].s >= 0.5 && !ids.includes(ranked[0].id)) ids.push(ranked[0].id);
  }
  return { ids, how: ids.length ? "name" : null };
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export const parseCount = (w) => Number(w) || NUMBER_WORDS[String(w).toLowerCase()] || 1;

const ORDINALS = { first: 0, "1st": 0, top: 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3, fifth: 4, "5th": 4, sixth: 5, "6th": 5 };
// Returns an index, -1 for "last", or null for "all".
export function parseOrdinal(w) {
  if (!w) return null;
  const s = String(w).toLowerCase();
  if (s === "last") return -1;
  if (s in ORDINALS) return ORDINALS[s];
  return Number(s) ? Number(s) - 1 : null;
}

export function findDocByTitle(docs, phrase) {
  const target = words(clean(phrase)).filter((w) => !["diagram", "board", "canvas", "sample"].includes(w) || words(phrase).length === 1);
  if (!target.length) return null;
  const ranked = docs
    .map((d) => {
      const hay = words(d.title);
      return { d, s: target.filter((w) => hay.some((h) => h === w || (h.startsWith(w) && w.length > 2))).length / target.length };
    })
    .sort((a, b) => b.s - a.s || b.d.updatedAt - a.d.updatedAt);
  return ranked[0]?.s >= 0.5 ? ranked[0].d : null;
}

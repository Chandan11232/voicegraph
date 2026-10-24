// Calls the API handler directly (no server needed) to measure token use and check that a burst of
// commands survives Groq's per-minute limits via the fallback models. Uses GROQ_API_KEY from .env.local.
// Run: node tests/rate-limit.check.mjs
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^(GROQ_API_KEY)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.VG_LOG_USAGE = "1";
const { default: handler } = await import("../api/command.js");

const graph = {
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
    { from: "shoppers", to: "web" }, { from: "web", to: "api", label: "REST" }, { from: "web", to: "db", label: "direct query" },
    { from: "api", to: "db" }, { from: "api", to: "pay", label: "charge" }, { from: "api", to: "mail", label: "send receipt" },
  ],
  groups: [],
};

let ip = 0;
const call = (body) => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: this.statusCode, body: JSON.parse(s) }); } };
  // A different fake IP per call so the app's own per-visitor limit doesn't interfere.
  handler({ method: "POST", headers: { "x-forwarded-for": `10.0.0.${++ip}` }, socket: {}, body }, res);
});

const usage = [];
const origLog = console.log;
console.log = (...args) => (args[0] === "usage" ? usage.push(`${args[1]} ${args[2]}`) : origLog(...args));
const origWarn = console.warn;
const fallbacks = [];
console.warn = (...args) => (String(args[0]).startsWith("Groq rate limit") ? fallbacks.push(args[0]) : origWarn(...args));

const commands = [
  "Add a Redis cache in front of Orders DB", "Make Payments purple", "Group the API and the database into Backend",
  "Rename Receipts to Email Sender", "Make it top to bottom", "Add an auth service in front of the API",
  "Remove the direct query from the storefront to the database", "Make the queue dashed", "Add a CDN in front of the storefront",
  "What happens if the database goes down?", "Make the database red", "Add a monitoring service connected to the API",
];
const started = Date.now();
const results = await Promise.all(commands.map((command) => call({ mode: "edit", command, graph, selection: [] })));
const failed = results.filter((r) => r.status !== 200);
origLog(`burst of ${commands.length} commands in ${((Date.now() - started) / 1000).toFixed(1)}s: ${results.length - failed.length} ok, ${failed.length} failed`);
for (const f of failed) origLog("  failed:", f.status, f.body.error);
origLog(`fallbacks used: ${fallbacks.length}`);
for (const f of [...new Set(fallbacks)]) origLog("  " + f);
origLog("token usage per call (model, usage):");
for (const u of usage.slice(0, 4)) origLog("  " + u);
process.exit(failed.length ? 1 : 0);

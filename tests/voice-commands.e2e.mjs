// End-to-end check of the voice commands, run against the sample diagram the way Wispr Flow delivers text.
// Needs the dev server on :3000 and Google Chrome. Run: node tests/voice-commands.e2e.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9344;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "sd-voice-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50 && !targets?.length; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitIdle = async () => { for (let i = 0; i < 100; i++) { if (!(await js("!!document.querySelector('.busy-pill')"))) return; await sleep(400); } };

const state = () => js(`(() => {
  const s = JSON.parse(localStorage.getItem('saydiagram:v2'));
  const prefs = JSON.parse(localStorage.getItem('saydiagram:prefs') || '{}');
  const d = s.docs[s.current];
  return { title: d.title, graph: d.graph, positions: d.positions, reply: d.log.at(-1)?.text, kind: d.log.at(-1)?.kind, findings: d.log.at(-1)?.findings?.length, docs: Object.keys(s.docs).length, speak: prefs.speak };
})()`);
const selected = () => js("[...document.querySelectorAll('.react-flow__node.selected')].map((n) => n.dataset.id)");

async function say(text) {
  await js("document.querySelector('.command-box textarea').focus()");
  await send("Input.insertText", { text });
  await sleep(1500);
  await waitIdle();
  await sleep(900);
  await sleep(400); // let the debounced save land
  return state();
}

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  | ${detail}` : ""}`);
};

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/app?sample=1" });
await sleep(3500);
const start = await state();

let s = await say("What happens if the database goes down?");
check("question gets an answer, diagram untouched", JSON.stringify(s.graph) === JSON.stringify(start.graph) && s.reply.length > 40, s.reply.slice(0, 110));

s = await say("Select all databases");
let sel = await selected();
check("select all databases", sel.length === 1 && sel[0] === "db", `${JSON.stringify(sel)} · ${s.reply}`);

const before = s.positions.db;
s = await say("Move this to the right");
check("move this to the right", s.positions.db.x > before.x && s.positions.db.y === before.y, `${Math.round(before.x)} → ${Math.round(s.positions.db.x)}`);

s = await say("Select the API and Receipts");
sel = await selected();
check("select two boxes by name", sel.length === 2 && sel.includes("api") && sel.includes("mail"), `${JSON.stringify(sel)} · ${s.reply}`);

s = await say("Make these purple");
const purple = s.graph.nodes.filter((n) => n.color === "purple").map((n) => n.id);
check("make these purple (uses the selection)", purple.includes("api") && purple.includes("mail") && purple.length === 2, `${JSON.stringify(purple)} · ${s.reply}`);

s = await say("Undo 2 times");
check("undo 2 times", !s.graph.nodes.some((n) => n.color === "purple") && Math.round(s.positions.db.x) === Math.round(before.x), s.reply);

s = await say("Review my architecture");
check("review", s.kind === "review" && s.findings > 0, `${s.findings} findings`);
const suggestionsAfterReview = await js("[...document.querySelectorAll('.chips button')].map((b) => b.textContent)");
check("suggestions switch to “Fix them”", suggestionsAfterReview.some((t) => t.includes("Fix them")), JSON.stringify(suggestionsAfterReview));

const graphBeforeFix = JSON.stringify(s.graph);
s = await say("Fix the first one");
check("fix the first one changes the diagram", JSON.stringify(s.graph) !== graphBeforeFix, s.reply.slice(0, 110));

s = await say("New diagram called Chat app");
check("new diagram called …", s.title === "Chat App" && s.graph.nodes.length === 0 && s.docs === 2, `title "${s.title}", ${s.docs} diagrams`);

s = await say("Open the online store diagram");
check("open a diagram by name", s.title.startsWith("Online store"), `now on "${s.title}"`);

s = await say("Rename this diagram to Checkout v2");
check("rename the diagram", s.title === "Checkout V2", `"${s.title}"`);

s = await say("Read replies aloud");
check("read replies aloud on", s.speak === true, s.reply);
s = await say("Stop talking");
check("stop talking", s.speak === false, s.reply);

s = await say("Where is Stripe?");
sel = await selected();
check("where is Stripe (finds by technology)", sel.includes("pay"), s.reply);

console.log("console errors:", errors.length ? errors.join("\n") : "none");
ws.close();
chrome.kill();
process.exit(failures ? 1 : 0);

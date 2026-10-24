// Visual check of edge routing: renders the Voicegraph architecture diagram (with the request/response
// pairs and the hand-placed positions from a real session), then again after "Tidy up".
// Needs the dev server on :3000 and Google Chrome. Screenshots go to tests/screenshots/.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const OUT = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9345;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "vg-layout-"))}`, "about:blank"], { stdio: "ignore" });
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
const shot = async (name) => writeFileSync(join(OUT, name), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

const graph = {
  direction: "LR",
  nodes: [
    { id: "user", label: "User", kind: "client", tech: "Browser", color: null, group: null },
    { id: "wispr", label: "Wispr Flow", kind: "client", tech: "Speech-to-Text", color: null, group: null },
    { id: "workspace", label: "Voicegraph Workspace", kind: "service", tech: "React Flow", color: null, group: null },
    { id: "vercel", label: "Vercel Function", kind: "function", tech: "Serverless", color: null, group: null },
    { id: "groq", label: "GPT OSS 120B", kind: "ai", tech: "Groq", color: null, group: null },
    { id: "elk", label: "ELK Layout", kind: "function", tech: "ELK", color: null, group: null },
    { id: "storage", label: "Local Storage", kind: "storage", tech: "Storage", color: null, group: null },
  ],
  edges: [
    { from: "user", to: "wispr", label: "speak", style: "solid" },
    { from: "wispr", to: "workspace", label: "type", style: "solid" },
    { from: "workspace", to: "vercel", label: "send command", style: "solid" },
    { from: "vercel", to: "groq", label: "", style: "solid" },
    { from: "groq", to: "vercel", label: "response", style: "solid" },
    { from: "vercel", to: "elk", label: "return diagram", style: "solid" },
    { from: "elk", to: "workspace", label: "layout", style: "solid" },
    { from: "workspace", to: "storage", label: "save", style: "solid" },
  ],
  groups: [],
};
// Roughly where the boxes sat in the messy screenshot.
const positions = {
  user: { x: 130, y: 165 }, wispr: { x: 380, y: 170 }, workspace: { x: 890, y: 125 }, storage: { x: 1195, y: 320 },
  groq: { x: 110, y: 350 }, elk: { x: 755, y: 510 }, vercel: { x: 390, y: 690 },
};
const doc = { id: "layouttest", title: "Voicegraph architecture", graph, positions, isSample: false, log: [], updatedAt: Date.now() };

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/app" });
await sleep(2500);
await js(`localStorage.setItem("saydiagram:v2", ${JSON.stringify(JSON.stringify({ current: doc.id, docs: { [doc.id]: doc } }))}); location.reload()`);
await sleep(3500);
await shot("1-hand-placed.png");

await js("document.querySelector('.command-box textarea').focus()");
await send("Input.insertText", { text: "Tidy up" });
await sleep(2500);
await shot("2-after-tidy.png");

const edgeCount = await js("document.querySelectorAll('.react-flow__edge').length");
console.log(`edges drawn: ${edgeCount} (8 in the data; the two request/response pairs merge into two-headed arrows, so 6 expected)`);
console.log("screenshots:", OUT);
console.log("console errors:", errors.length ? errors.join("\n") : "none");
ws.close();
chrome.kill();
process.exit(0);

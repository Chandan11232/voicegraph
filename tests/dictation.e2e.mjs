// End-to-end check: several dictations in a row, with no clicks in between (how Wispr Flow is used).
// Needs the dev server on :3000 and Google Chrome. Run: node tests/dictation.e2e.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9341;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "sd-e2e-"))}`, "about:blank"], { stdio: "ignore" });
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
const waitIdle = async () => { for (let i = 0; i < 80; i++) { if (!(await js("!!document.querySelector('.busy-pill')"))) return; await sleep(400); } };
const focused = () => js("(() => { const a = document.activeElement; return a === document.querySelector('.command-box textarea') ? 'command box' : (a?.tagName + '.' + (a?.className || '')).slice(0, 60); })()");
const userLog = () => js("(() => { const s = JSON.parse(localStorage.getItem('saydiagram:v2')); return s.docs[s.current].log.filter((l) => l.role === 'user').map((l) => l.text); })()");

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: process.env.APP_URL || "http://localhost:3000/app" });
await sleep(3500);

const phrases = ["Add a Redis cache in front of Orders DB", "Make the cache red", "Zoom out", "Make it top to bottom"];
let failures = 0;
console.log("focus after page load:", await focused());
for (const phrase of phrases) {
  // No clicking or focusing here: text goes wherever focus already is, like a real dictation.
  await send("Input.insertText", { text: phrase });
  await sleep(1600);
  await waitIdle();
  await sleep(600);
  const ran = (await userLog()).includes(phrase);
  if (!ran) failures++;
  console.log(`${ran ? "PASS" : "FAIL"}  "${phrase}"  | focus afterwards: ${await focused()}`);
}
console.log("debug panel:", JSON.stringify(await js("[...document.querySelectorAll('div[style*=\"z-index:9999\"] > div:last-child > div')].slice(0, 6).map(d => d.textContent)")));
console.log("console errors:", errors.length ? errors.join("\n") : "none");
ws.close();
chrome.kill();
process.exit(failures ? 1 : 0);

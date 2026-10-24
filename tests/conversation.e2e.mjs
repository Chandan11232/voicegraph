// End-to-end check of clearing the conversation: by voice, by the Clear button, and Undo.
// Needs the dev server on :3000 (or APP_URL) and Google Chrome. Run: node tests/conversation.e2e.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9347;
const APP = process.env.APP_URL || "http://localhost:3000/app?sample=1";
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "vg-conv-"))}`, "about:blank"], { stdio: "ignore" });
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
const shown = () => js("[...document.querySelectorAll('.log li')].map((li) => li.textContent.trim())");
const say = async (text) => {
  await js("document.querySelector('.command-box textarea').focus()");
  await send("Input.insertText", { text });
  await sleep(1500);
  await waitIdle();
  await sleep(500);
};
let failures = 0;
const check = (name, ok, detail = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  | ${detail}` : ""}`); };

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: APP });
await sleep(3500);

await say("Zoom out");
await say("Fit to screen");
let log = await shown();
check("conversation has entries", log.length >= 4, `${log.length} entries`);

await say("Delete the last message");
log = await shown();
check("“delete the last message” removes the last exchange only", !log.some((t) => t.includes("Fit to screen") || t.includes("Delete the last")) && log.some((t) => t.includes("Zoom out")), `${log.length} left`);

await say("Clear the conversation");
log = await shown();
check("“clear the conversation” empties it", log.length === 1 && log[0].includes("will show up") || log.length === 0, JSON.stringify(log));
const toast = await js("document.querySelector('.toast')?.textContent");
check("toast offers Undo", /Undo/.test(toast || ""), toast);

await js("document.querySelector('.toast button').click()");
await sleep(400);
log = await shown();
check("Undo brings the conversation back", log.some((t) => t.includes("Zoom out")), `${log.length} entries`);

await js("document.querySelector('.clear-log').click()");
await sleep(400);
log = await shown();
const disabled = await js("document.querySelector('.clear-log').disabled");
check("Clear button empties it and then disables itself", log.every((t) => !t.includes("Zoom out")) && disabled, `${log.length} entries, button disabled: ${disabled}`);

const boxes = await js("document.querySelectorAll('.react-flow__node').length");
check("the diagram itself is untouched", boxes === 6, `${boxes} boxes`);

console.log("console errors:", errors.length ? errors.join("\n") : "none");
ws.close();
chrome.kill();
process.exit(failures ? 1 : 0);

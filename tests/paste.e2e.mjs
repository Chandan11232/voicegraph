// Reproduces Wispr Flow's real delivery: put text on the clipboard, then press Cmd+V, several times in a row.
// Needs the dev server on :3000 and Google Chrome. Run: node tests/paste.e2e.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9342;
const APP = process.env.APP_URL || "http://localhost:3000/app?debug";
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "sd-paste-"))}`, "about:blank"], { stdio: "ignore" });
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
const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true })).result?.result?.value;
const waitIdle = async () => { for (let i = 0; i < 80; i++) { if (!(await js("!!document.querySelector('.busy-pill')"))) return; await sleep(400); } };
const userLog = () => js("(() => { const s = JSON.parse(localStorage.getItem('saydiagram:v2')); return s.docs[s.current].log.filter((l) => l.role === 'user').map((l) => l.text); })()");

await send("Runtime.enable");
await send("Page.enable");
await send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
await send("Emulation.setFocusEmulationEnabled", { enabled: true }); // clipboard writes need a focused page
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: APP });
await sleep(3500);
await js("document.querySelector('.command-box textarea').focus()");

// Wispr Flow puts plain text and HTML on the clipboard, then sends Cmd+V.
const wisprPaste = async (text) => {
  await js(`navigator.clipboard.write([new ClipboardItem({
    "text/plain": new Blob([${JSON.stringify(text)}], { type: "text/plain" }),
    "text/html": new Blob([${JSON.stringify(`<meta charset="utf-8"><span>${text}</span>`)}], { type: "text/html" }),
  })])`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Meta", code: "MetaLeft", modifiers: 4, windowsVirtualKeyCode: 91 });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "v", code: "KeyV", modifiers: 4, windowsVirtualKeyCode: 86, commands: ["paste"] });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "v", code: "KeyV", modifiers: 4, windowsVirtualKeyCode: 86 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Meta", code: "MetaLeft", modifiers: 0, windowsVirtualKeyCode: 91 });
};

const phrases = ["Add a Redis cache in front of Orders DB.", "Make the cache red.", "Zoom out.", "Make it top to bottom."];
let failures = 0;
for (const phrase of phrases) {
  await wisprPaste(phrase);
  await sleep(1700);
  await waitIdle();
  await sleep(700);
  const ran = (await userLog()).some((t) => t === phrase || t === phrase.replace(/\.$/, ""));
  if (!ran) failures++;
  const box = await js("document.querySelector('.command-box textarea').value");
  console.log(`${ran ? "PASS" : "FAIL"}  "${phrase}"  | box now: ${JSON.stringify(box)}`);
}
// The failure from the user's log: the paste event carries the text, but by the time Chrome
// inserts, Wispr has already restored the old clipboard, so the browser inserts nothing.
// A synthetic paste event behaves the same way (it never inserts by itself).
for (const phrase of ["Make Payments purple.", "Zoom in."]) {
  await js(`(() => { const dt = new DataTransfer(); dt.setData("text/plain", ${JSON.stringify("PHRASE")}); document.querySelector(".command-box textarea").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); })()`.replace("PHRASE", phrase));
  await sleep(1700);
  await waitIdle();
  await sleep(700);
  const ran = (await userLog()).some((t) => t === phrase || t === phrase.replace(/\.$/, ""));
  if (!ran) failures++;
  console.log(`${ran ? "PASS" : "FAIL"}  clipboard-race paste "${phrase}"`);
}
const panel = await js("[...document.querySelectorAll('div[style*=\"z-index:9999\"] > div:last-child > div')].slice(0, 14).map((d) => d.textContent).reverse()");
if (panel) console.log("debug panel:\n" + panel.join("\n"));
console.log("console errors:", errors.length ? errors.join("\n") : "none");
ws.close();
chrome.kill();
process.exit(failures ? 1 : 0);

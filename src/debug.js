// Input diagnostics, shown only with ?debug in the URL. Lists what actually reaches the page
// (keys, pastes, inserts, focus changes) so dictation problems can be traced to their cause.
const MAX_ROWS = 18;

function describe(el) {
  if (!el || el === document) return "document";
  if (el === window) return "window";
  if (el.matches?.(".command-box textarea")) return "COMMAND BOX";
  const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
  return `${el.tagName?.toLowerCase() || "?"}${cls ? "." + cls : ""}`;
}

export function installDebugPanel() {
  const panel = document.createElement("div");
  panel.setAttribute("style", [
    "position:fixed", "left:12px", "bottom:12px", "z-index:9999", "width:430px", "max-height:340px", "overflow:auto",
    "padding:8px 10px", "font:11px/1.45 ui-monospace,Menlo,monospace", "color:#e9e9e2", "background:rgba(20,20,18,.92)",
    "border-radius:8px", "box-shadow:0 6px 24px rgba(0,0,0,.3)",
  ].join(";"));
  const title = document.createElement("div");
  title.textContent = "Input debug: dictate twice, then screenshot this";
  title.setAttribute("style", "color:#f0a283;font-weight:600;margin-bottom:4px");
  const list = document.createElement("div");
  panel.append(title, list);
  document.body.append(panel);

  const start = performance.now();
  const log = (text) => {
    const row = document.createElement("div");
    row.textContent = `${((performance.now() - start) / 1000).toFixed(1).padStart(6)}s  ${text}`;
    list.prepend(row);
    while (list.children.length > MAX_ROWS) list.lastChild.remove();
  };

  document.addEventListener("keydown", (e) => {
    if (["Shift", "Alt"].includes(e.key)) return;
    log(`keydown ${e.metaKey ? "Cmd+" : ""}${e.ctrlKey ? "Ctrl+" : ""}${e.key} → ${describe(e.target)}`);
  }, true);
  document.addEventListener("beforeinput", (e) => log(`beforeinput ${e.inputType || "(none)"} data=${e.data == null ? "null" : e.data.length + " chars"} → ${describe(e.target)}`), true);
  document.addEventListener("input", (e) => log(`input ${e.inputType || "(none)"} value=${e.target.value?.length ?? "-"} chars → ${describe(e.target)}`), true);
  document.addEventListener("paste", (e) => log(`paste ${e.clipboardData?.getData("text/plain")?.length ?? 0} chars → ${describe(e.target)}`), true);
  document.addEventListener("focusin", (e) => log(`focus → ${describe(e.target)}`), true);
  document.addEventListener("focusout", (e) => log(`blur ← ${describe(e.target)}`), true);
  window.addEventListener("blur", () => log("WINDOW lost focus"));
  window.addEventListener("focus", () => log("WINDOW got focus"));
  document.addEventListener("visibilitychange", () => log(`page ${document.visibilityState}`));
  if ("speechSynthesis" in window) {
    setInterval(() => {
      if (speechSynthesis.speaking && !panel.dataset.speaking) { panel.dataset.speaking = "1"; log("read-aloud started"); }
      if (!speechSynthesis.speaking && panel.dataset.speaking) { delete panel.dataset.speaking; log("read-aloud ended"); }
    }, 250);
  }
  log(`ready · focus is on ${describe(document.activeElement)}`);
}

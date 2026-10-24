import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import App from "./App.jsx";

// After a redeploy, a tab opened earlier may ask for code files that no longer exist
// (they're named by content hash). Reload once to pick up the new version; diagrams are saved locally.
window.addEventListener("vite:preloadError", () => {
  try {
    if (sessionStorage.getItem("voicegraph:reloaded-for-update")) return;
    sessionStorage.setItem("voicegraph:reloaded-for-update", "1");
  } catch {}
  location.reload();
});
setTimeout(() => {
  try { sessionStorage.removeItem("voicegraph:reloaded-for-update"); } catch {}
}, 15000);

if (new URLSearchParams(location.search).has("debug")) {
  import("./debug.js").then(({ installDebugPanel }) => installDebugPanel());
}

createRoot(document.getElementById("root")).render(
  <ReactFlowProvider>
    <App />
  </ReactFlowProvider>,
);

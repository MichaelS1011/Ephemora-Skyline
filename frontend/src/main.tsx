import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// The four weights the HUD actually uses, latin subset only. Self-hosted: this
// was the one request the browser made on its own, before any user action, and
// it was in no disclosure list.
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./design/globals.css";
import { installOfflineApiGuard } from "./offline/api-guard";
import { bootCityFromExport } from "./offline/boot";
import { useOrigin } from "./stores/useOrigin";

// An exported city arrives with its payload and nothing to ask. Install the
// guard before any component can fire its first fetch; a normal install has no
// `__EPHEMORA_CITY__` and skips this line's work entirely.
if (window.__EPHEMORA_CITY__) {
  installOfflineApiGuard(window.__EPHEMORA_CITY__);
  bootCityFromExport(document);
  // Set before the first render: every component that asks "is anything live
  // here?" reads this cell, and none of them may guess it from something else.
  useOrigin.setState({ origin: "file" });
}

// Boot diagnostics live in index.html — they must register before any module
// loads, so main.tsx must NOT re-register them (duplicate #boot-error nodes).

// StrictMode is safe again with react-three-fiber v9 — the frozen duplicate
// <canvas> double-mount bug was an R3F v8 issue (fixed in v9, React 19).
ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

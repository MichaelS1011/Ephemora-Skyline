import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./design/globals.css";

// Boot diagnostics live in index.html — they must register before any module
// loads, so main.tsx must NOT re-register them (duplicate #boot-error nodes).

// StrictMode is safe again with react-three-fiber v9 — the frozen duplicate
// <canvas> double-mount bug was an R3F v8 issue (fixed in v9, React 19).
ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

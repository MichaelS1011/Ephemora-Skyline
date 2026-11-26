import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pre-bundle the 3D stack: when these deps are discovered lazily after a
  // city loads, Vite re-optimizes and forces a full page reload, kicking the
  // user from the workspace back to the landing screen.
  optimizeDeps: {
    include: [
      "three",
      "three/examples/jsm/controls/OrbitControls.js",
      "@react-three/fiber",
      "@react-three/postprocessing",
      "postprocessing",
      "zustand",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3010,
    // Fail loudly on a port collision instead of drifting: without this, a
    // second checkout's `npm run dev` silently lands on 3011+ while its /api
    // proxy still points at the FIRST checkout's backend — the UI looks like
    // your build but answers from another process. Refusing to start is
    // recoverable (PORT= + BACKEND_PORT=, see CONTRIBUTING.md); a silent
    // foreign backend is not.
    strictPort: true,
    proxy: {
      // 127.0.0.1, not localhost: the backend binds loopback explicitly, and a
      // name would let the resolver answer ::1 first — which nothing listens on.
      // The port follows BACKEND_PORT so a second checkout can point its proxy
      // at its own backend instead of silently sharing the first one's.
      "/api": {
        target: `http://127.0.0.1:${process.env.BACKEND_PORT ?? "4000"}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown): codeSplitting replaces advancedChunks
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules\/(react|react-dom|scheduler|react-reconciler)\//,
              priority: 10,
            },
            // entriesAware is REQUIRED: without it, Rolldown treats a group
            // chunk as one shared initial chunk and modulepreloads three-core
            // + r3f into index.html for EVERY page — even though only the
            // lazily imported 3D chunks actually use them (verified against
            // dist/index.html). With entriesAware the groups split by the
            // chunks that really import them and the start screen stays 3D-free.
            { name: "three-core", test: /node_modules\/three\//, entriesAware: true, priority: 5 },
            {
              name: "r3f",
              test: /node_modules\/(@react-three)\//,
              entriesAware: true,
              priority: 5,
            },
            // zustand MUST have its own HIGH-PRIORITY chunk: @react-three/fiber
            // depends on zustand, and group matching is recursive — at equal
            // priority the r3f group wins and parks zustand inside the r3f
            // chunk, which (with entriesAware off) made the r3f chunk and
            // three-core behind it static entry dependencies, undoing the lazy
            // 3D split for every start-screen visit.
            {
              name: "state-vendor",
              test: /node_modules\/(zustand|use-sync-external-store)\//,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    css: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
  },
});

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
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
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
            },
            { name: "three-core", test: /node_modules\/three\// },
            { name: "r3f", test: /node_modules\/(@react-three)\// },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
  },
});

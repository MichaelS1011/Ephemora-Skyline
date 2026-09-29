// ESLint root config (CodeCity CyberDefense) — Flat Config Format (ESLint 9.x)
// Nutzt @typescript-eslint/parser + @typescript-eslint/eslint-plugin direkt

import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  eslint.configs.recommended,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/*.d.ts",
      "**/*.d.ts.map",
      "**/*.js",
      "**/*.js.map",
      "**/vite.config.*",
    ],
  },
  {
    files: ["backend/src/**/*.ts"],
    languageOptions: {
      parser,
      globals: {
        // Node.js globals
        process: "readonly",
        console: "writable",
        Buffer: "readonly",
        btoa: "readonly",
        NodeJS: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        // TypeScript/ESNext
        navigator: "readonly",
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "frontend/tests/**/*.ts",
      "frontend/tests/**/*.tsx",
    ],
    languageOptions: {
      parser,
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        console: "writable",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        alert: "readonly",
        setTimeout: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        // React JSX runtime
        React: "readonly",
        JSX: "readonly",
        // Node.js globals (Vite exposes some)
        process: "readonly",
        Buffer: "readonly",
        btoa: "readonly",
        // TypeScript/ESNext
        AbortController: "readonly",
        AbortSignal: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        ReadableStream: "readonly",
        WritableStream: "readonly",
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];

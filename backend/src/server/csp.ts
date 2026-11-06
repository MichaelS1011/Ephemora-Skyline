import type { HelmetOptions } from "helmet";

/**
 * Helmet's defaults are written for a server that serves nothing but JSON.
 * This one now serves the built app too, and the default policy refused the
 * one inline <script> Vite leaves in index.html to set the theme before paint
 * (measured: `script-src 'self'` error in the console of every first visit).
 *
 * The policy below is the app's own: scripts and styles come from this origin
 * with that one inline hash-free allowance, the renderer needs `data:` and
 * `blob:` for textures and recorded video, and there is no third-party origin
 * anywhere — which is a product promise, not a tick-box.
 *
 * `upgrade-insecure-requests` is deliberately disabled. The installed app is
 * served over plain HTTP on 127.0.0.1, and Safari upgrades that page's module
 * requests to https://127.0.0.1:<port>, where no TLS listener exists. The HTML
 * loads, every script fails, and the first paint is black. Helmet adds the
 * directive by default, so it must be turned off explicitly. A loopback
 * install has no http:// subresource that would need upgrading.
 */
export const helmetOptions: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
};

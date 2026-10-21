/// <reference types="vite/client" />

interface Window {
  /**
   * Present only in an exported city: the payload the scanner produced, read
   * before any module runs. The app boots from it instead of asking a server
   * that, in a file on someone else's desk, does not exist.
   */
  __EPHEMORA_CITY__?: unknown;
  /**
   * Whether this page came from a file:// URL. Read by the API guard so a
   * fetch that cannot work says why once, instead of failing 20 times with a
   * browser error nobody can act on.
   */
  __EPHEMORA_FILE__?: boolean;
  __EPHEMORA_API_CALLS__?: number;
}

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set in .env.production; unset in dev, where the Vite proxy handles it. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

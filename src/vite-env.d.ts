/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** 'github-pages' when built for the Pages deploy. */
  readonly VITE_DEPLOY_TARGET?: string
  /** 'false' mounts the real Supabase-backed app; anything else mounts the showcase. */
  readonly VITE_SHOWCASE_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

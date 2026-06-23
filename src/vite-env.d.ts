/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string
  readonly VITE_STAGING_PRODUCTION_URL?: string
  readonly VITE_DOCS_CAPTURE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

declare module '*?raw' {
  const content: string
  export default content
}

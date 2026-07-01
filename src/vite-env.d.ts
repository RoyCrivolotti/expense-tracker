/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string
  readonly VITE_STAGING_PRODUCTION_URL?: string
  readonly VITE_DOCS_CAPTURE?: string
  readonly VITE_BUILD_ID?: string
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

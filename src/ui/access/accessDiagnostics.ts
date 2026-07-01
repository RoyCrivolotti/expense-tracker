import {
  classifyAccessError,
  isStandaloneDisplay,
  type AccessErrorKind,
} from './accessErrorKind'

export interface AccessDiagnostics {
  buildId: string
  standalone: boolean
  online: boolean
  swController: string | null
  swWaiting: boolean
  assetHash: string | null
  errorKind: AccessErrorKind
  rawError: string
  capturedAt: string
}

const RAW_ERROR_MAX = 500

function moduleScriptHash(): string | null {
  const src = document.querySelector('script[type="module"]')?.getAttribute('src')
  if (!src) return null
  const match = /\/assets\/[^/]+-([A-Za-z0-9_-]+)\.js/.exec(src)
  return match?.[1] ?? src
}

async function serviceWorkerWaiting(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  const registration = await navigator.serviceWorker.getRegistration()
  return Boolean(registration?.waiting)
}

/** Snapshot client state when access check fails (for copy-to-clipboard debugging). */
export async function collectAccessDiagnostics(rawError: string): Promise<AccessDiagnostics> {
  return {
    buildId: import.meta.env.VITE_BUILD_ID ?? 'unknown',
    standalone: isStandaloneDisplay(),
    online: navigator.onLine,
    swController: navigator.serviceWorker?.controller?.scriptURL ?? null,
    swWaiting: await serviceWorkerWaiting(),
    assetHash: moduleScriptHash(),
    errorKind: classifyAccessError(rawError),
    rawError: rawError.slice(0, RAW_ERROR_MAX),
    capturedAt: new Date().toISOString(),
  }
}

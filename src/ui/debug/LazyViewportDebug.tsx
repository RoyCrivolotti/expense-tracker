import { Suspense, lazy } from 'react'
import { viewportDebugRequested } from './viewportProbe'

const ViewportDebugLazy = lazy(() =>
  import('./ViewportDebug').then((m) => ({ default: m.ViewportDebug })),
)

export function LazyViewportDebug() {
  if (!viewportDebugRequested()) return null
  return (
    <Suspense>
      <ViewportDebugLazy />
    </Suspense>
  )
}

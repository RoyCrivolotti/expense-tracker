import { Suspense, lazy } from 'react'

const JitterLabLazy = lazy(() => import('./JitterLab').then((m) => ({ default: m.JitterLab })))

export function LazyJitterLab() {
  return (
    <Suspense>
      <JitterLabLazy />
    </Suspense>
  )
}

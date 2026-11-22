import { Suspense, lazy, useCallback, useMemo, useState, type ReactNode } from 'react'
import { ChunkBoundary } from '../components/ChunkBoundary'
import { Modal } from '../components/Modal'
import { Presence } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { GUIDE_TITLE } from '../../guide/guideTitle'
import { GuideContext, type GuideOpener } from './guideContext'

// Its own chunk, fetched when the guide is first opened: most sessions never open it.
const GuideSheet = lazy(() => import('./GuideSheet'))

/** What stands in when the sheet's file cannot be fetched (a dropped connection, or a deploy that replaced it under an open page). Only a reload gets it. */
function GuideUnavailable({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={GUIDE_TITLE} onClose={onClose}>
      <p>The guide could not be loaded. Check your connection, then reload the app and try again.</p>
    </Modal>
  )
}

/**
 * Holds whether the guide is open, and offers `useGuide()` to the screens that link to it. The sheet is kept by
 * `Presence`, so closing it plays its exit however it was closed.
 */
export function GuideHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openGuide = useCallback(() => setOpen(true), [])
  const value = useMemo<GuideOpener>(() => ({ open: openGuide }), [openGuide])
  return (
    <GuideContext value={value}>
      {children}
      <Presence show={open} exitMs={EXIT_MS.sheet}>
        <ChunkBoundary fallback={<GuideUnavailable onClose={() => setOpen(false)} />}>
          <Suspense fallback={null}>
            <GuideSheet onClose={() => setOpen(false)} />
          </Suspense>
        </ChunkBoundary>
      </Presence>
    </GuideContext>
  )
}

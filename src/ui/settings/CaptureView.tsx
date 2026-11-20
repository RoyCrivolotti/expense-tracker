import { Suspense, lazy } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import { ChunkBoundary } from '../components/ChunkBoundary'

// Their own chunks, fetched when the Capture view opens: nothing else in Settings talks to the capture routes, and the
// budget check measures them apart from the rest of the app.
const CaptureSetupSetting = lazy(() => import('./CaptureSetupSetting').then((m) => ({ default: m.CaptureSetupSetting })))
const CaptureKeySetting = lazy(() => import('./CaptureKeySetting').then((m) => ({ default: m.CaptureKeySetting })))
const CaptureCardsSetting = lazy(() => import('./CaptureCardsSetting').then((m) => ({ default: m.CaptureCardsSetting })))
const CaptureMutedSetting = lazy(() => import('./CaptureMutedSetting').then((m) => ({ default: m.CaptureMutedSetting })))
const CaptureDiagnosticsSetting = lazy(() => import('./CaptureDiagnosticsSetting').then((m) => ({ default: m.CaptureDiagnosticsSetting })))
const PushSetting = lazy(() => import('./PushSetting').then((m) => ({ default: m.PushSetting })))

/**
 * Everything about capturing payments from a bank app's notifications, in the order a person meets it: what to do
 * once (the steps, then the key they ask for), what to choose (notifications), and what is only looked at later.
 */
export function CaptureView({ model }: { model: ExpenseModel }) {
  return (
    <ChunkBoundary fallback={null}>
      <Suspense fallback={null}>
        <CaptureSetupSetting />
        <CaptureKeySetting />
        <PushSetting />
        <CaptureCardsSetting model={model} />
        <CaptureMutedSetting />
        <CaptureDiagnosticsSetting />
      </Suspense>
    </ChunkBoundary>
  )
}

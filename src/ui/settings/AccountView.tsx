import { Suspense, lazy } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import { AccessRequestsSetting } from './AccessRequestsSetting'
import { AccountSetting } from './AccountSetting'
import { AppVersionSetting } from './AppVersionSetting'
import { ChunkBoundary } from '../components/ChunkBoundary'

// Their own chunk, fetched when the Account view opens: nothing else here talks to the capture routes, and the budget
// check measures them apart from the rest of the app.
const CaptureSetupSetting = lazy(() => import('./CaptureSetupSetting').then((m) => ({ default: m.CaptureSetupSetting })))
const CaptureKeySetting = lazy(() => import('./CaptureKeySetting').then((m) => ({ default: m.CaptureKeySetting })))
const CaptureCardsSetting = lazy(() => import('./CaptureCardsSetting').then((m) => ({ default: m.CaptureCardsSetting })))
const CaptureMutedSetting = lazy(() => import('./CaptureMutedSetting').then((m) => ({ default: m.CaptureMutedSetting })))
const CaptureDiagnosticsSetting = lazy(() => import('./CaptureDiagnosticsSetting').then((m) => ({ default: m.CaptureDiagnosticsSetting })))

export function AccountView({
  model,
  ownerAccess,
  accountEmail,
}: {
  model: ExpenseModel
  ownerAccess: { pendingCount: number } | undefined
  accountEmail: string | undefined
}) {
  return (
    <>
      {accountEmail ? <AccountSetting email={accountEmail} /> : null}
      {ownerAccess ? <AccessRequestsSetting pendingCount={ownerAccess.pendingCount} /> : null}
      <ChunkBoundary fallback={null}>
        <Suspense fallback={null}>
          <CaptureSetupSetting />
          <CaptureKeySetting />
          <CaptureCardsSetting model={model} />
          <CaptureMutedSetting />
          <CaptureDiagnosticsSetting />
        </Suspense>
      </ChunkBoundary>
      <AppVersionSetting model={model} />
    </>
  )
}

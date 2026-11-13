import { Suspense, lazy, useState } from 'react'
import { captureEnabled } from '../../config/captureFlag'
import type { ExpenseModel } from '../useExpenseData'
import { AccessRequestsSetting } from './AccessRequestsSetting'
import { AccountSetting } from './AccountSetting'
import { AppVersionSetting } from './AppVersionSetting'
import { ChunkBoundary } from '../components/ChunkBoundary'

// Its own chunk: most people never turn the flag on, and the card is the only thing here that talks to the capture routes.
const CaptureKeySetting = lazy(() => import('./CaptureKeySetting').then((m) => ({ default: m.CaptureKeySetting })))
const CaptureCardsSetting = lazy(() => import('./CaptureCardsSetting').then((m) => ({ default: m.CaptureCardsSetting })))

export function AccountView({
  model,
  ownerAccess,
  accountEmail,
}: {
  model: ExpenseModel
  ownerAccess: { pendingCount: number } | undefined
  accountEmail: string | undefined
}) {
  // Read once: the flag writes to storage when the address sets it, which a render has no business repeating.
  const [capture] = useState(captureEnabled)
  return (
    <>
      {accountEmail ? <AccountSetting email={accountEmail} /> : null}
      {ownerAccess ? <AccessRequestsSetting pendingCount={ownerAccess.pendingCount} /> : null}
      {capture ? (
        <ChunkBoundary fallback={null}>
          <Suspense fallback={null}>
            <CaptureKeySetting />
            <CaptureCardsSetting model={model} />
          </Suspense>
        </ChunkBoundary>
      ) : null}
      <AppVersionSetting model={model} />
    </>
  )
}

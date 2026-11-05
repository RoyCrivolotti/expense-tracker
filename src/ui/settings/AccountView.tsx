import type { ExpenseModel } from '../useExpenseData'
import { AccessRequestsSetting } from './AccessRequestsSetting'
import { AccountSetting } from './AccountSetting'
import { AppVersionSetting } from './AppVersionSetting'

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
      <AppVersionSetting model={model} />
    </>
  )
}

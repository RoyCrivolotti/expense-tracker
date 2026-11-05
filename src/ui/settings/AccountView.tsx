import { AccessRequestsSetting } from './AccessRequestsSetting'
import { AccountSetting } from './AccountSetting'

export function AccountView({
  ownerAccess,
  accountEmail,
}: {
  ownerAccess: { pendingCount: number } | undefined
  accountEmail: string | undefined
}) {
  return (
    <>
      {accountEmail ? <AccountSetting email={accountEmail} /> : null}
      {ownerAccess ? <AccessRequestsSetting pendingCount={ownerAccess.pendingCount} /> : null}
    </>
  )
}

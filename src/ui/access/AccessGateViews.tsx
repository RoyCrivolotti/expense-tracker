import type { ExpenseDataSource } from '../../data/dataSource'
import type { AccessStatusResponse } from '../../data/accessApi'
import { ExpensesApp } from '../ExpensesApp'
import { NoExpenseAccessScreen } from './NoExpenseAccessScreen'
import { RequestAccessScreen } from './RequestAccessScreen'
import { canUseExpenseTracker } from '../../hubNavItems'
import { allGroupsGranted } from '../../domain/accessGroups'

export function AllowedAccessView({
  access,
  source,
}: {
  access: AccessStatusResponse
  source: ExpenseDataSource
}) {
  const groups = access.groups
  if (groups && !access.isOwner && !canUseExpenseTracker(groups)) {
    return <NoExpenseAccessScreen email={access.email} />
  }
  const ownerAccess =
    access.isOwner && access.pendingCount !== undefined
      ? { pendingCount: access.pendingCount }
      : undefined
  return (
    <ExpensesApp
      source={source}
      accountEmail={access.email}
      hubGrants={access.groups ?? allGroupsGranted()}
      {...(ownerAccess ? { ownerAccess } : {})}
    />
  )
}

export function DeniedAccessView({ access }: { access: AccessStatusResponse }) {
  return (
    <RequestAccessScreen
      email={access.email}
      initialAccess={{
        status: access.status,
        ...(access.requestedAt ? { requestedAt: access.requestedAt } : {}),
      }}
    />
  )
}

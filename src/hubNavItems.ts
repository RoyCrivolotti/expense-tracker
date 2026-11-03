import { buildHubNavItems } from 'folio-shell'
import type { GroupGrants } from './domain/accessGroups'
import { hasGroupGrant } from './domain/accessGroups'
import { getSiteUrls } from 'folio-shell'

/** Cross-app navigation from the expense tracker, filtered by group grants. */
export function getExpenseHubNavItems(grants: GroupGrants) {
  const { adminHub } = getSiteUrls()
  return buildHubNavItems(grants, { adminHubBase: adminHub.replace(/\/$/, '') })
}

export function canUseExpenseTracker(grants: GroupGrants): boolean {
  return hasGroupGrant(grants, 'expenses')
}

/**
 * True for a person the server lists with groups, none of them Expenses, who is not the owner: allowed in, but not to
 * this app. The screen that says so and the clean-up of what this device kept for them both ask this, so there is one
 * rule for it.
 */
export function lacksExpenseAccess(access: { groups?: GroupGrants; isOwner?: boolean }): boolean {
  return !!access.groups && !access.isOwner && !canUseExpenseTracker(access.groups)
}

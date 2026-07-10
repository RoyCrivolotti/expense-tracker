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

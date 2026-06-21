import type { HubNavItem } from 'folio-shell'
import {
  ArchiveIcon,
  BookIcon,
  ChartIcon,
  CompassIcon,
  getSiteUrls,
  HomeIcon,
  WalletIcon,
} from 'folio-shell'
import type { GroupGrants } from './domain/accessGroups'
import { filterByGroupAccess, hasGroupGrant, type AccessGroupId } from './domain/accessGroups'
import { getOncallUrl } from './config/oncallUrl'

interface HubLinkDef {
  href: string
  label: string
  groupId: AccessGroupId
  Icon: HubNavItem['Icon']
}

function hubLinks(): HubLinkDef[] {
  const { adminHub, expenses } = getSiteUrls()
  const oncall = getOncallUrl()
  const base = adminHub.replace(/\/$/, '')
  return [
    { href: `${base}/`, label: 'Hub', groupId: 'finance', Icon: HomeIcon },
    { href: expenses, label: 'Expense Tracker', groupId: 'expenses', Icon: WalletIcon },
    { href: oncall, label: 'On-call pay', groupId: 'oncall', Icon: ChartIcon },
    {
      href: `${base}/constitution.html`,
      label: 'Investment Constitution',
      groupId: 'finance',
      Icon: BookIcon,
    },
    { href: `${base}/strategy.html`, label: 'Strategy', groupId: 'finance', Icon: ChartIcon },
    { href: `${base}/primer.html`, label: 'Investing Primer', groupId: 'finance', Icon: CompassIcon },
    { href: `${base}/legacy/`, label: 'Legacy site (2019)', groupId: 'legacy', Icon: ArchiveIcon },
  ]
}

/** Cross-app navigation from the expense tracker, filtered by group grants. */
export function getExpenseHubNavItems(grants: GroupGrants): HubNavItem[] {
  const visible = filterByGroupAccess(hubLinks(), grants)
  return visible.map(({ href, label, Icon }) => ({ href, label, Icon }))
}

export function canUseExpenseTracker(grants: GroupGrants): boolean {
  return hasGroupGrant(grants, 'expenses')
}

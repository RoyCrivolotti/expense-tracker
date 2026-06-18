import type { HubNavItem } from '@crivolotti/site-ui'
import {
  ArchiveIcon,
  BookIcon,
  ChartIcon,
  CompassIcon,
  getSiteUrls,
  HomeIcon,
  WalletIcon,
} from '@crivolotti/site-ui'

/** Cross-app navigation from the expense tracker. */
export function getExpenseHubNavItems(): HubNavItem[] {
  const { adminHub, expenses } = getSiteUrls()
  const base = adminHub.replace(/\/$/, '')
  return [
    { href: `${base}/`, label: 'Hub', Icon: HomeIcon },
    { href: expenses, label: 'Expense Tracker', Icon: WalletIcon },
    {
      href: `${base}/constitution.html`,
      label: 'Investment Constitution',
      Icon: BookIcon,
    },
    { href: `${base}/strategy.html`, label: 'Strategy', Icon: ChartIcon },
    { href: `${base}/primer.html`, label: 'Investing Primer', Icon: CompassIcon },
    { href: `${base}/legacy/`, label: 'Legacy site (2019)', Icon: ArchiveIcon },
  ]
}

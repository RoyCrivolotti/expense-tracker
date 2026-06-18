import type { ComponentType, SVGProps } from 'react'
import { HomeIcon, ListIcon, PieIcon, GearIcon } from '../icons'

export type TabId = 'dashboard' | 'transactions' | 'analytics' | 'settings'

export interface NavItem {
  id: TabId
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: HomeIcon },
  { id: 'transactions', label: 'Transactions', Icon: ListIcon },
  { id: 'analytics', label: 'Analytics', Icon: PieIcon },
  { id: 'settings', label: 'Settings', Icon: GearIcon },
]

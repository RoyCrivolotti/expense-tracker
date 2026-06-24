import type { ComponentType, SVGProps } from 'react'
import { HomeIcon, ListIcon, PieIcon, TargetIcon, GearIcon } from '../icons'

export type TabId = 'dashboard' | 'transactions' | 'analytics' | 'goals' | 'settings'

export interface NavItem {
  id: TabId
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: HomeIcon },
  { id: 'transactions', label: 'Transactions', Icon: ListIcon },
  { id: 'analytics', label: 'Analytics', Icon: PieIcon },
  { id: 'goals', label: 'Goals', Icon: TargetIcon },
  { id: 'settings', label: 'Settings', Icon: GearIcon },
]

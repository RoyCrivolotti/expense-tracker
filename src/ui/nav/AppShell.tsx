import type { ReactNode } from 'react'
import { HubMenuRoot, HubMenuTrigger } from '@crivolotti/folio-ui'
import { getExpenseHubNavItems } from '../../hubNavItems'
import { navItems, type TabId } from './navItems'
import { PlusIcon } from '../icons'
import styles from './AppShell.module.css'

interface AppShellProps {
  activeId: TabId
  onSelect: (id: TabId) => void
  title: string
  headerRight?: ReactNode
  onAdd?: () => void
  settingsBadge?: number
  children: ReactNode
}

function NavList({
  activeId,
  onSelect,
  variant,
  settingsBadge = 0,
}: {
  activeId: TabId
  onSelect: (id: TabId) => void
  variant: 'rail' | 'bar'
  settingsBadge?: number
}) {
  return (
    <ul className={variant === 'rail' ? styles.railList : styles.barList}>
      {navItems.map(({ id, label, Icon }) => (
        <li key={id}>
          <button
            type="button"
            className={`${styles.navBtn} ${activeId === id ? styles.active : ''}`}
            aria-current={activeId === id ? 'page' : undefined}
            onClick={() => onSelect(id)}
          >
            <span className={styles.navIconWrap}>
              <span className={styles.navIcon}>
                <Icon />
              </span>
              {id === 'settings' && settingsBadge > 0 ? (
                <span className={styles.navBadge} aria-label={`${settingsBadge} pending access requests`}>
                  {settingsBadge > 9 ? '9+' : settingsBadge}
                </span>
              ) : null}
            </span>
            <span className={styles.navLabel}>{label}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function AppShell({
  activeId,
  onSelect,
  title,
  headerRight,
  onAdd,
  settingsBadge = 0,
  children,
}: AppShellProps) {
  return (
    <HubMenuRoot anchor="inline" navItems={getExpenseHubNavItems()}>
      <div className={styles.shell}>
        <aside className={styles.rail} aria-label="Sections">
          <div className={styles.brand}>Finance</div>
          <nav className={styles.railNav}>
            <NavList activeId={activeId} onSelect={onSelect} variant="rail" settingsBadge={settingsBadge} />
          </nav>
          <HubMenuTrigger className={styles.hubRail} label="Navigate" />
        </aside>

        <div className={styles.main}>
          <header className={styles.header}>
            <HubMenuTrigger className={styles.hubHeader} iconOnly />
            <h1 className={styles.title}>{title}</h1>
            <div className={styles.headerRight}>{headerRight}</div>
          </header>
          <main className={styles.content}>{children}</main>
        </div>

        {onAdd && (
          <button type="button" className={styles.fab} onClick={onAdd} aria-label="Add transaction">
            <PlusIcon />
          </button>
        )}

        <nav className={styles.bottomBar} aria-label="Sections">
          <NavList activeId={activeId} onSelect={onSelect} variant="bar" settingsBadge={settingsBadge} />
        </nav>
      </div>
    </HubMenuRoot>
  )
}

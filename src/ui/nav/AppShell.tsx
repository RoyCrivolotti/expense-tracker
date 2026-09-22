import type { ReactNode, RefObject } from 'react'
import { HubMenuRoot, HubMenuTrigger } from 'folio-shell'
import type { GroupGrants } from '../../domain/accessGroups'
import { getExpenseHubNavItems } from '../../hubNavItems'
import { navItems, type TabId } from './navItems'
import { PresenceValue } from '../components/Presence'
import { PlusIcon } from '../icons'
import { EXIT_MS, exitVars } from '../hooks/motion'
import { useAutoHideFab } from '../hooks/useAutoHideFab'
import { useExit } from '../hooks/usePresence'
import styles from './AppShell.module.css'

interface AppShellProps {
  activeId: TabId
  onSelect: (id: TabId) => void
  title: string
  headerRight?: ReactNode
  onAdd?: () => void
  settingsBadge?: number
  hubGrants: GroupGrants
  /** Trim the large bottom scroll padding (tabs without a month picker / long lists). */
  compactFooter?: boolean
  /** Widen the content column on Goals desktop so chart tables fit without scrolling. */
  goalsWide?: boolean
  pullIndicator?: ReactNode
  contentRef?: RefObject<HTMLElement | null>
  banner?: ReactNode
  children: ReactNode
}

/**
 * The round add button. It comes and goes with the selection bar that takes its corner, so
 * it scales and fades rather than popping, and while it leaves it takes no more taps.
 */
function AddButton({ onAdd, scrolling }: { onAdd: () => void; scrolling: boolean }) {
  const { leaving, exitMs } = useExit()
  const classes = [styles.fab, scrolling && styles.fabHidden, leaving && styles.fabLeaving]
  return (
    <button
      type="button"
      className={classes.filter(Boolean).join(' ')}
      style={exitVars(leaving, exitMs)}
      onClick={() => onAdd()}
      aria-label="Add transaction"
      inert={leaving}
    >
      <PlusIcon />
    </button>
  )
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
            className={`${styles.navBtn} tapActive ${activeId === id ? styles.active : ''}`}
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
  hubGrants,
  compactFooter = false,
  goalsWide = false,
  contentRef,
  pullIndicator,
  banner,
  children,
}: AppShellProps) {
  const fabVisible = useAutoHideFab(Boolean(onAdd))
  return (
    <HubMenuRoot anchor="inline" navItems={getExpenseHubNavItems(hubGrants)}>
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
          <main
            ref={contentRef}
            className={`${styles.content} ${compactFooter ? styles.contentCompact : ''} ${goalsWide ? styles.contentGoals : ''}`}
          >
            {pullIndicator}
            {banner}
            {children}
          </main>
        </div>

        <PresenceValue value={onAdd} exitMs={EXIT_MS.fade}>
          {(add) => <AddButton onAdd={add} scrolling={!fabVisible} />}
        </PresenceValue>

        <nav className={styles.bottomBar} aria-label="Sections">
          <NavList activeId={activeId} onSelect={onSelect} variant="bar" settingsBadge={settingsBadge} />
        </nav>
      </div>
    </HubMenuRoot>
  )
}

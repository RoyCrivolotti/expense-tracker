import { useState } from 'react'
import { scrollBehavior } from './hooks/scrollTiming'
import type { TabId } from './nav/navItems'
import type { GoalsEntry } from './tabs/goals/GoalsTab'
import type { SettingsView } from './tabs/SettingsTab'
import type { TransactionsEntry } from './tabs/transactionsEntry'

/**
 * Which tab is open, and what a tab was sent to do when something opened it for one thing: Goals on a check-in, Transactions
 * with a filter, Settings on a section. Every route out of a tab goes through `guardLeave`, which asks first if the tab holds
 * unsaved edits. Pressing the tab already open leaves nothing, so it never asks.
 *
 * Every tab opens at its top. The page is one window scroll shared by all of them, so a tab would otherwise open at whatever
 * offset the last one was left at. Pressing the tab already open goes back to its top too.
 */
export function useTabNavigation(
  guardLeave: (go: () => void) => void,
  onMonth: (month: string) => void,
) {
  const [tab, setTab] = useState<TabId>('dashboard')
  // Where Goals should open when the dashboard sends the user there for a check-in. Cleared by every ordinary tab change,
  // so a later visit to Goals opens on Plan as usual. The same goes for the other two.
  const [goalsEntry, setGoalsEntry] = useState<GoalsEntry>(null)
  // The filter preset an Analytics drill-down hands over to Transactions.
  const [txnEntry, setTxnEntry] = useState<TransactionsEntry | null>(null)
  // The section of Settings a pointer on the Dashboard sends the person to.
  const [settingsEntry, setSettingsEntry] = useState<SettingsView | null>(null)
  const open = (
    next: TabId,
    entries: { goals?: GoalsEntry; txn?: TransactionsEntry; settings?: SettingsView },
  ) => {
    setGoalsEntry(entries.goals ?? null)
    setTxnEntry(entries.txn ?? null)
    setSettingsEntry(entries.settings ?? null)
    if (next === tab) return
    setTab(next)
    // At once rather than after the render, so a tab that scrolls itself into place as it opens has the last word.
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
  const goTo = (
    next: TabId,
    entry: GoalsEntry,
  ) => {
    if (next === tab) open(next, { goals: entry })
    else guardLeave(() => open(next, { goals: entry }))
  }
  return {
    tab,
    goalsEntry,
    txnEntry,
    settingsEntry,
    selectTab: (next: TabId) => {
      goTo(next, null)
      if (next === tab) window.scrollTo({ top: 0, behavior: scrollBehavior('smooth') })
    },
    logCheckin: () => goTo('goals', 'checkin'),
    openImport: () => guardLeave(() => open('settings', { settings: 'data' })),
    // The Analytics drill-down: land on Transactions with the row's filters applied, on the month the row described.
    openTransactions: (preset: TransactionsEntry) =>
      guardLeave(() => {
        if (preset.month) onMonth(preset.month)
        open('transactions', { txn: preset })
      }),
    // The baseline handoff: open Goals with the measured spend prefilled as an unsaved draft.
    useBaselineInGoals: (monthlyCents: number) => goTo('goals', { kind: 'baseline', monthlyCents }),
  }
}

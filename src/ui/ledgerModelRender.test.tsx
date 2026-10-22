/**
 * The screens, rendered over a model that holds every row and over one built from a window of 13 months with
 * the series of the whole history, held to the same text. A screen that hands an engine the wrong list shows
 * different figures here. `ledgerModelSweep.test.ts` runs every viewed month through the functions the views
 * call; this covers the wiring of everything else, in a browser-like tree, for the newest month (most of
 * the ledger is then summed) and one in the middle.
 *
 * Left out on purpose, because they read rows the window does not hold: the Dashboard's recent activity (the
 * newest rows by date and by when they were added) and the counts of how many transactions carry each label,
 * in Settings (docs/ENGINE-HISTORY.md).
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sortedMonths } from '../domain/engine/dates'
import { ledgerOfHeld, receiptsPending } from '../data/ledgerHold'
import { LedgerSession } from '../data/ledgerSession'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, ledgerFor } from '../domain/ledger'
import { memorySource } from '../testing/ledgerSource'
import type { ExpenseDataset } from '../domain/types'
import { adversarialLedger } from '../testing/adversarialLedger'
import { installFakeMatchMedia } from '../testing/fakeMatchMedia'
import { makeAttachment } from '../testing/factories'
import { makeActions } from '../testing/makeActions'
import { samplePlan } from '../testing/samplePlan'
import { syntheticLedger } from '../testing/syntheticLedger'
import { buildExpenseModel } from './buildExpenseModel'
import { buildLedgerModel, fixedHistoryOf } from './buildLedgerModel'
import type { ExpenseModel } from './useExpenseData'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { DashboardTab } from './tabs/DashboardTab'
import { SettingsTab } from './tabs/SettingsTab'
import { ExpenseReportView } from './tabs/ExpenseReportView'
import { MoneyFormatProvider } from './hooks/MoneyFormatProvider'
import { TransactionsTab } from './tabs/TransactionsTab'
import { GoalsTab } from './tabs/goals/GoalsTab'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }

beforeAll(() => {
  installFakeMatchMedia()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

interface Screen {
  name: string
  element: (model: ExpenseModel, month: string) => ReactElement
  /** Tabs to press, in order, before the text is read; `{ button }` presses a button instead. */
  tabs?: Array<string | { button: string }>
  /** Text to cut out before comparing. */
  without?: string[]
  /** Compare only from this text on. */
  from?: string
}

const SCREENS: Screen[] = [
  { name: 'Dashboard', element: (model, month) => <DashboardTab model={model} month={month} />, without: ['Recent activity'] },
  { name: 'Analytics Overview', element: (model, month) => <AnalyticsTab model={model} month={month} onMonthChange={vi.fn()} /> },
  {
    name: 'Analytics Overview table',
    element: (model, month) => <AnalyticsTab model={model} month={month} onMonthChange={vi.fn()} />,
    tabs: [{ button: 'Table' }],
  },
  { name: 'Analytics Spending', element: (model, month) => <AnalyticsTab model={model} month={month} onMonthChange={vi.fn()} />, tabs: ['Spending'] },
  { name: 'Analytics Cash', element: (model, month) => <AnalyticsTab model={model} month={month} onMonthChange={vi.fn()} />, tabs: ['Cash'] },
  { name: 'Goals plan', element: (model) => <GoalsTab model={model} actions={makeActions()} /> },
  { name: 'Goals progress', element: (model) => <GoalsTab model={model} actions={makeActions()} />, tabs: ['Progress'] },
  {
    name: 'Settings statements',
    element: (model, month) => <SettingsTab model={model} month={month} actions={makeActions()} theme="dark" onThemeChange={vi.fn()} />,
    tabs: ['Setup'],
    // Above it are the definitions with how many transactions carry each label, counted over the rows held.
    from: 'Card statements',
  },
  { name: 'Transactions', element: (model, month) => <TransactionsTab model={model} month={month} actions={makeActions()} /> },
]

/** The text a screen shows, after pressing its tabs. */
function textOf(screenSpec: Screen, model: ExpenseModel, month: string): string {
  const { container } = render(screenSpec.element(model, month))
  for (const tab of screenSpec.tabs ?? []) {
    const target = typeof tab === 'string' ? within(container).getAllByRole('tab', { name: tab }) : within(container).getAllByRole('button', { name: tab.button })
    fireEvent.click(target[0]!)
  }
  let text = container.textContent ?? ''
  if (screenSpec.from) text = text.slice(Math.max(0, text.indexOf(screenSpec.from)))
  for (const cut of screenSpec.without ?? []) {
    const at = text.indexOf(cut)
    if (at >= 0) text = text.slice(0, at)
  }
  cleanup()
  return text
}

/**
 * A dated plan, and an emergency-fund target with a cash account holding some of it at the latest check-in,
 * so the Dashboard's Goals card and Progress have a pace and a reserve to show.
 */
function withPlan(dataset: ExpenseDataset): ExpenseDataset {
  const latest = [...dataset.wealthCheckins].sort((a, b) => b.checkinDate.localeCompare(a.checkinDate))[0]
  return {
    ...dataset,
    goalScenarios: [samplePlan({ id: 1, isActive: true, planStartDate: '2022-01-01' })],
    settings: { ...dataset.settings, cashReserveMonths: 6 },
    wealthAccounts: [...dataset.wealthAccounts, { id: 900, name: 'Savings', kind: 'cash', sortOrder: 9, archived: false }],
    wealthCheckins: dataset.wealthCheckins.map((c) =>
      c === latest ? { ...c, entries: [...c.entries, { accountId: 900, valueCents: 900_000 }] } : c,
    ),
  }
}

/**
 * Today is in the newest month of the ledger, whichever month is viewed: the screens that read the
 * recent past (the cash reserve, the pace since the plan began) do not move with the month picker.
 */
function compare(source: ExpenseDataset, month: string): Array<[string, string, string]> {
  const dataset = withPlan(source)
  const newest = sortedMonths(dataset.transactions.map((t) => t.budgetMonth)).at(-1)!
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${newest}-20T12:00:00`))
  const whole = buildExpenseModel(dataset)
  const windowed = buildLedgerModel(ledgerFor(dataset, month, WINDOWED), { history: fixedHistoryOf(dataset.transactions) })
  expect(windowed.sums).toBeDefined()
  const differing: Array<[string, string, string]> = []
  for (const spec of SCREENS) {
    const a = textOf(spec, whole, month)
    const b = textOf(spec, windowed, month)
    expect(a.length, spec.name).toBeGreaterThan(40)
    if (a !== b) differing.push([spec.name, a, b])
  }
  vi.useRealTimers()
  return differing
}

describe('the screens over a window, compared with every row', () => {
  const adversarial = adversarialLedger()
  const synthetic = syntheticLedger({ months: 40, perMonth: 30, seed: 4 })

  it('show the same figures for the newest month of the adversarial ledger', () => {
    const months = sortedMonths(adversarial.transactions.map((t) => t.budgetMonth))
    expect(compare(adversarial, months[months.length - 1]!).map(([name]) => name)).toEqual([])
  }, 120_000)

  it('show the same figures for a month in the middle of the adversarial ledger', () => {
    const months = sortedMonths(adversarial.transactions.map((t) => t.budgetMonth))
    expect(compare(adversarial, months[Math.floor(months.length * 0.6)]!).map(([name]) => name)).toEqual([])
  }, 120_000)

  it('show the same figures for the newest month of the synthetic ledger', () => {
    const months = sortedMonths(synthetic.transactions.map((t) => t.budgetMonth))
    expect(compare(synthetic, months[months.length - 1]!).map(([name]) => name)).toEqual([])
  }, 120_000)
})


/** What the receipts show in the places that read them: the marks on the rows, the storage meter, a claim. */
describe('the screens that show receipts, over a model that reads the lists on request', () => {
  const base = adversarialLedger()
  const flagged = base.transactions.filter((t) => t.flagId != null && t.type === 'expense').slice(0, 2)
  // Receipts only on rows that exist (the server cannot hold any other), and two on claimed rows.
  const dataset = {
    ...base,
    attachments: [
      ...base.attachments.filter((a) => base.transactions.some((t) => t.id === a.transactionId)),
      ...flagged.map((t, i) => makeAttachment({ id: 9_000 + i, transactionId: t.id, byteSize: 50_000 })),
    ],
  }
  const month = sortedMonths(dataset.transactions.map((t) => t.budgetMonth)).at(-1)!
  const counted = [...new Set(dataset.attachments.map((a) => a.transactionId))]
  const withoutLists = (ledger: ReturnType<typeof ledgerFor>) => ({ ...ledger, reference: { ...ledger.reference, attachments: [] } })

  async function readAll(): Promise<ExpenseModel> {
    const session = new LedgerSession(memorySource(dataset))
    await session.open()
    session.loadReceipts(counted)
    await waitFor(() => expect(receiptsPending(session.getState().held!)).toBe(0))
    const held = session.getState().held!
    return { ...buildLedgerModel(ledgerOfHeld(held), { attachmentCounts: held.attachmentCounts }), receiptsPending: 0 }
  }

  const marks = (model: ExpenseModel, shown: string) => {
    const { container } = render(<TransactionsTab model={model} month={shown} />)
    const labels = [...container.querySelectorAll('[role="img"][aria-label$="receipt"], [role="img"][aria-label$="receipts"]')]
    cleanup()
    return labels.map((el) => el.getAttribute('aria-label'))
  }
  const receiptMonths = [
    ...new Set(dataset.transactions.filter((t) => counted.includes(t.id)).map((t) => t.budgetMonth)),
  ]

  it('has receipts in the data to compare', () => {
    expect(counted.length).toBeGreaterThan(0)
    expect(receiptMonths.length).toBeGreaterThan(0)
  })

  it('marks the rows the same, from the counts alone and after the lists are read', async () => {
    const whole = buildExpenseModel(dataset)
    const unread = buildLedgerModel(withoutLists(ledgerFor(dataset, month)), {
      attachmentCounts: Object.fromEntries(counted.map((id) => [id, dataset.attachments.filter((a) => a.transactionId === id).length])),
    })
    const read = await readAll()
    expect(unread.dataset.attachments).toEqual([])
    for (const shown of receiptMonths.slice(0, 4)) {
      const expected = marks(whole, shown)
      expect(expected.length, shown).toBeGreaterThan(0)
      expect(marks(unread, shown), shown).toEqual(expected)
      expect(marks(read, shown), shown).toEqual(expected)
    }
  })

  it('shows the same storage meter once the lists are read, and none while they are pending', async () => {
    const meter = (model: ExpenseModel) => {
      const { container } = render(<SettingsTab model={model} month={month} actions={makeActions()} theme="dark" onThemeChange={vi.fn()} />)
      fireEvent.click(within(container).getAllByRole('tab', { name: 'Data' })[0]!)
      const text = container.textContent ?? ''
      cleanup()
      return text.slice(Math.max(0, text.indexOf('Receipt storage')))
    }
    const whole = meter(buildExpenseModel(dataset))
    expect(whole).toContain('Receipt storage')
    expect(meter(await readAll())).toBe(whole)
    const pending = { ...buildExpenseModel(dataset), dataset: { ...dataset, attachments: [] }, receiptsPending: counted.length }
    expect(meter(pending)).not.toContain('Receipt storage')
  })

  it('shows a claim the same once its rows’ lists are read, and waits until then', async () => {
    const flagId = dataset.flags.find((f) => dataset.transactions.some((t) => t.flagId === f.id && dataset.attachments.some((a) => a.transactionId === t.id)))?.id
    expect(flagId).toBeDefined()
    const report = (model: ExpenseModel) => {
      const { container } = render(
        <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
          <ExpenseReportView dataset={model.dataset} lookup={model.lookup} flagId={flagId!} onClose={vi.fn()} issuedOn="2026-09-12" />
        </MoneyFormatProvider>,
      )
      const text = document.body.textContent ?? ''
      cleanup()
      void container
      return text
    }
    const whole = report(buildExpenseModel(dataset))
    expect(report(await readAll())).toBe(whole)
    const unread = buildLedgerModel(withoutLists(ledgerFor(dataset, month)), {
      attachmentCounts: Object.fromEntries(counted.map((id) => [id, dataset.attachments.filter((a) => a.transactionId === id).length])),
    })
    expect(report(unread)).toContain('Loading receipts…')
  })
})

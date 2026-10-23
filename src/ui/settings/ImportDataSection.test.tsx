import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiClient'
import { EXPORT_CSV_HEADER } from '../../domain/data/exportCsvFormat'
import type { NewTransaction } from '../../domain/data/dataSource'
import { makeActions } from '../../testing/makeActions'
import { syntheticLedger } from '../../testing/syntheticLedger'
import { buildExpenseModel } from '../buildExpenseModel'
import { ToastProvider } from '../hooks/ToastProvider'
import { ImportDataSection } from './ImportDataSection'

const dataset = syntheticLedger({ months: 1, perMonth: 1, seed: 1 })
const category = dataset.categories[0]!.name
const account = dataset.accounts[0]!.name

/** A file of `n` rows in the export format, each with a description of its own. */
function csvOf(n: number): string {
  const lines = Array.from({ length: n }, (_, i) => `,2026-01-05,2026-01,Import ${i + 1},${category},${account},expense,${100 + i},posted,0,`)
  return [EXPORT_CSV_HEADER, ...lines].join('\n')
}

async function chooseFile(container: HTMLElement, text: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  const file = new File([text], 'import.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) })
  await act(() => {
    fireEvent.change(input, { target: { files: [file] } })
    return Promise.resolve()
  })
}

function renderSection(createTransactions: (inputs: NewTransaction[]) => Promise<void>) {
  const actions = makeActions({ createTransactions: vi.fn(createTransactions) })
  const view = render(
    <ToastProvider>
      <ImportDataSection model={buildExpenseModel(dataset)} actions={actions} />
    </ToastProvider>,
  )
  return { ...view, createTransactions: actions.createTransactions as ReturnType<typeof vi.fn> }
}

const sizes = (mock: ReturnType<typeof vi.fn>): number[] => mock.mock.calls.map(([inputs]) => (inputs as NewTransaction[]).length)
const descriptions = (mock: ReturnType<typeof vi.fn>): string[] => mock.mock.calls.flatMap(([inputs]) => (inputs as NewTransaction[]).map((row) => row.description))
const confirm = () => fireEvent.click(screen.getByRole('button', { name: /Confirm import|Importing/ }))

describe('ImportDataSection, a file of more rows than a request takes', () => {
  it('sends it in requests of a hundred rows and says how many it imported', async () => {
    const { container, createTransactions } = renderSection(() => Promise.resolve())
    await chooseFile(container, csvOf(250))
    expect(await screen.findByText('250 rows ready')).toBeInTheDocument()
    confirm()
    expect((await screen.findAllByText('Imported 250 transactions')).length).toBeGreaterThan(0)
    expect(sizes(createTransactions)).toEqual([100, 100, 50])
    expect(descriptions(createTransactions)).toEqual(Array.from({ length: 250 }, (_, i) => `Import ${i + 1}`))
  })

  it('is one request for a hundred rows or fewer, and says what it always did', async () => {
    const { container, createTransactions } = renderSection(() => Promise.resolve())
    await chooseFile(container, csvOf(5))
    confirm()
    expect((await screen.findAllByText('Imported 5 transactions')).length).toBeGreaterThan(0)
    expect(sizes(createTransactions)).toEqual([5])
  })

  it('shows how many rows are saved while it goes on', async () => {
    let release: () => void = () => undefined
    let calls = 0
    const { container } = renderSection(() => {
      calls += 1
      return calls === 2 ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
    })
    await chooseFile(container, csvOf(250))
    confirm()
    await screen.findByRole('button', { name: 'Importing… 100 of 250' })
    expect(screen.getByRole('button', { name: 'Importing… 100 of 250' })).toBeDisabled()
    release()
    await screen.findAllByText('Imported 250 transactions')
  })

  it('says how many were imported when a later request is refused, keeps the rest, and sends only the rest when confirmed again', async () => {
    let refuse = true
    let calls = 0
    const { container, createTransactions } = renderSection(() => {
      calls += 1
      return refuse && calls === 2 ? Promise.reject(new ApiError('Row 30: Unknown category', 400)) : Promise.resolve()
    })
    await chooseFile(container, csvOf(250))
    confirm()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Imported 100 of 250 transactions. The next 100 were refused and not saved: Row 130: Unknown category.')
    expect(alert).toHaveTextContent('The 150 left are still here')
    expect(screen.getByText('150 rows ready')).toBeInTheDocument()
    expect(sizes(createTransactions)).toEqual([100, 100])

    refuse = false
    confirm()
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect((await screen.findAllByText('Imported the last 150 transactions, 250 in all')).length).toBeGreaterThan(0)
    expect(sizes(createTransactions)).toEqual([100, 100, 100, 50])
    // The first hundred went out once; the refused hundred went out again with the fifty after them, the rest and no more.
    const sent = descriptions(createTransactions)
    const named = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `Import ${from + i}`)
    expect(sent.slice(0, 100)).toEqual(named(1, 100))
    expect(sent.slice(200)).toEqual(named(101, 250))
  })

  it('warns that the request that failed may be there twice when the server did not say it refused it', async () => {
    let calls = 0
    const { container } = renderSection(() => {
      calls += 1
      return calls === 2 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve()
    })
    await chooseFile(container, csvOf(250))
    confirm()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('may or may not have been saved (Failed to fetch)')
    expect(alert).toHaveTextContent('Look in Transactions before you confirm again')
    expect(screen.getByText('150 rows ready')).toBeInTheDocument()
  })

  it('leaves the rows as they were, and shows no notice, when the first request fails', async () => {
    const { container } = renderSection(() => Promise.reject(new ApiError('Row 7: Unknown category', 400)))
    await chooseFile(container, csvOf(250))
    confirm()
    expect(await screen.findByText('Row 7: Unknown category')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('250 rows ready')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeEnabled()
  })

  it('forgets what an earlier file did when another is chosen', async () => {
    let calls = 0
    const { container, createTransactions } = renderSection(() => {
      calls += 1
      return calls === 2 ? Promise.reject(new ApiError('nope', 400)) : Promise.resolve()
    })
    await chooseFile(container, csvOf(250))
    confirm()
    await screen.findByRole('alert')
    await chooseFile(container, csvOf(3))
    expect(screen.queryByRole('alert')).toBeNull()
    confirm()
    expect((await screen.findAllByText('Imported 3 transactions')).length).toBeGreaterThan(0)
    expect(sizes(createTransactions)).toEqual([100, 100, 3])
  })
})

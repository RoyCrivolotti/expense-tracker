import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../domain/types'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { buildExpenseModel } from '../buildExpenseModel'
import type { ExpenseModel } from '../useExpenseData'
import { DashboardRecentActivity } from './DashboardRecentActivity'

const row = (id: number, description: string, date: string): Transaction =>
  makeTransaction({ id, description, date, budgetMonth: date.slice(0, 7), createdAt: `2026-01-01T00:00:0${id}Z` })

const held = makeDataset({ transactions: [row(3, 'Held newest', '2026-03-10'), row(2, 'Held middle', '2026-02-10'), row(1, 'Held oldest', '2026-01-10')] })
const server = [row(40, 'Server one', '2020-05-01'), row(39, 'Server two', '2020-04-01')]

function model(recent?: ExpenseModel['recent']): ExpenseModel {
  return { ...buildExpenseModel(held), ...(recent ? { recent } : {}) }
}

const shown = () => screen.queryAllByText(/^(Held|Server)/).map((el) => el.textContent)

describe('DashboardRecentActivity', () => {
  it('lists the rows it holds when the model holds every row', () => {
    render(<DashboardRecentActivity model={model()} />)
    expect(shown()).toEqual(['Held newest', 'Held middle', 'Held oldest'])
  })

  it('lists what the server says when the model holds only a window, each list from its own read', async () => {
    const latest = vi.fn(() => Promise.resolve(server))
    const added = vi.fn(() => Promise.resolve([server[1]!]))
    render(<DashboardRecentActivity model={model({ latest, added })} />)
    await waitFor(() => expect(shown()).toEqual(['Server one', 'Server two']))
    expect(added).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Recently added' }))
    await waitFor(() => expect(shown()).toEqual(['Server two']))
    expect(added).toHaveBeenCalledOnce()
  })

  it('lists the rows it holds until the server has answered, and when it cannot', async () => {
    let fail!: () => void
    const latest = vi.fn(() => new Promise<Transaction[]>((_, reject) => (fail = () => reject(new Error('offline')))))
    render(<DashboardRecentActivity model={model({ latest, added: latest })} />)
    expect(shown()).toEqual(['Held newest', 'Held middle', 'Held oldest'])
    await act(() => {
      fail()
      return Promise.resolve()
    })
    expect(shown()).toEqual(['Held newest', 'Held middle', 'Held oldest'])
  })

  it('reads again when the rows it holds change, so a write shows', async () => {
    const latest = vi.fn(() => Promise.resolve(server))
    const recent = { latest, added: latest }
    const view = render(<DashboardRecentActivity model={model(recent)} />)
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1))
    view.rerender(<DashboardRecentActivity model={{ ...model(recent), dataset: { ...held, transactions: held.transactions.slice(1) } }} />)
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(2))
  })
})

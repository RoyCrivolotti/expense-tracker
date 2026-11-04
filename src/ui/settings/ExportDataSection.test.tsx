import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../domain/types'
import { syntheticLedger } from '../../testing/syntheticLedger'
import { buildExpenseModel } from '../buildExpenseModel'
import type { ExpenseModel } from '../useExpenseData'
import { ExportDataSection } from './ExportDataSection'

const download = vi.hoisted(() => vi.fn())
vi.mock('../../data/exportCsv', () => ({ downloadTransactionsCsv: download }))

const dataset = syntheticLedger({ months: 2, perMonth: 3, seed: 1 })
const month = dataset.transactions[0]!.budgetMonth

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function windowed(read: () => Promise<Transaction[]>): ExpenseModel {
  return { ...buildExpenseModel(dataset), exportAll: { count: 12_345, read } }
}

const exportAll = () => screen.getByRole('button', { name: /Export all transactions to CSV|Exporting/ })

beforeEach(() => download.mockClear())

describe('ExportDataSection', () => {
  it('writes the month and then the whole dataset from the dataset it holds', () => {
    render(<ExportDataSection model={buildExpenseModel(dataset)} month={month} />)
    fireEvent.click(screen.getByRole('button', { name: `Export ${month} to CSV` }))
    expect(download).toHaveBeenLastCalledWith(dataset, { month })
    fireEvent.click(exportAll())
    expect(download).toHaveBeenLastCalledWith(dataset, {})
  })

  it('reads every transaction first when the model holds a window, saying how many, and writes those', async () => {
    const read = deferred<Transaction[]>()
    const model = windowed(() => read.promise)
    render(<ExportDataSection model={model} month={month} />)
    fireEvent.click(exportAll())
    expect(exportAll()).toHaveTextContent('Exporting 12,345 rows…')
    expect(exportAll()).toBeDisabled()
    expect(download).not.toHaveBeenCalled()
    const all = dataset.transactions.slice(0, 2)
    await act(() => {
      read.resolve(all)
      return Promise.resolve()
    })
    expect(download).toHaveBeenCalledOnce()
    expect(download).toHaveBeenCalledWith({ ...model.dataset, transactions: all }, {})
    expect(exportAll()).toHaveTextContent('Export all transactions to CSV')
    expect(exportAll()).toBeEnabled()
  })

  it('still writes the month from the rows it holds while the rest is being read', () => {
    render(<ExportDataSection model={windowed(() => new Promise(() => undefined))} month={month} />)
    fireEvent.click(exportAll())
    fireEvent.click(screen.getByRole('button', { name: `Export ${month} to CSV` }))
    expect(download).toHaveBeenCalledOnce()
  })

  it('says nothing was saved when the read fails, and lets it be tried again', async () => {
    const read = deferred<Transaction[]>()
    render(<ExportDataSection model={windowed(() => read.promise)} month={month} />)
    fireEvent.click(exportAll())
    await act(() => {
      read.reject(new Error('offline'))
      return Promise.resolve()
    })
    expect(screen.getByRole('alert')).toHaveTextContent('nothing was saved')
    expect(download).not.toHaveBeenCalled()
    expect(exportAll()).toBeEnabled()
    fireEvent.click(exportAll())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ExpenseModel } from '../useExpenseData'
import { HistoryNote } from './HistoryNote'

const modelWith = (historyNote?: string) => ({ ...(historyNote ? { historyNote } : {}) }) as ExpenseModel

describe('HistoryNote', () => {
  it('says what the model says about the figures that need the recurring charges, as a status', () => {
    render(<HistoryNote model={modelWith('Reading the recurring charges. Until they arrive, the figures use the months loaded.')} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading the recurring charges.')
  })

  it('says nothing for a model that has what it needs', () => {
    const { container } = render(<HistoryNote model={modelWith()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

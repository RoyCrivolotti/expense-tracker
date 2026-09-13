import { describe, expect, it } from 'vitest'
import { flagDeleteMessage, selectableFlags, transactionCountLabel } from './flagPickerOptions'

const active = { id: 1, name: 'Work travel', color: '#6366f1', reimbursable: true, sortOrder: 0, active: true }
const archived = { id: 2, name: 'Old claim', color: '#10b981', reimbursable: true, sortOrder: 1, active: false }

describe('selectableFlags', () => {
  it('offers active flags', () => {
    expect(selectableFlags([active], null)).toEqual([active])
  })

  it('hides archived flags', () => {
    expect(selectableFlags([active, archived], null)).toEqual([active])
  })

  it('keeps an archived flag that is the current value, so the control can show it', () => {
    expect(selectableFlags([active, archived], 2)).toEqual([active, archived])
  })
})

describe('transactionCountLabel', () => {
  it('singularises one', () => {
    expect(transactionCountLabel(1)).toBe('1 transaction')
  })

  it('pluralises everything else', () => {
    expect(transactionCountLabel(0)).toBe('0 transactions')
    expect(transactionCountLabel(4)).toBe('4 transactions')
  })
})

describe('flagDeleteMessage', () => {
  it('reassures when nothing is flagged', () => {
    expect(flagDeleteMessage(0)).toMatch(/Nothing is flagged/)
  })

  it('says how many rows will be unflagged, and that none are deleted', () => {
    const message = flagDeleteMessage(3)

    expect(message).toContain('3 transactions will be unflagged')
    expect(message).toMatch(/no transaction is deleted/)
  })
})

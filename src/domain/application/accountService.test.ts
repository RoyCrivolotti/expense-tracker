import { describe, expect, it } from 'vitest'
import { validateAccountName } from './accountService'
import { ValidationError } from './validationError'

describe('validateAccountName', () => {
  it('returns the name without surrounding space', () => {
    expect(validateAccountName('  Main debit  ')).toBe('Main debit')
  })

  it('refuses a blank name as a validation failure', () => {
    expect(() => validateAccountName('   ')).toThrow(ValidationError)
    expect(() => validateAccountName(undefined)).toThrow('Account name is required')
  })
})

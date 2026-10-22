// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseArgs } from './args'

describe('the command line', () => {
  it('reads a command and its flags', () => {
    expect(parseArgs(['seed', '--database', 'roy-expenses-dev', '--write', '--confirm', 'roy-expenses-dev', '--snapshot', 'a.json', '--transactions', '600'])).toMatchObject({
      command: 'seed', database: 'roy-expenses-dev', write: true, confirm: 'roy-expenses-dev', snapshot: 'a.json', transactions: 600,
    })
  })

  it('defaults to a read-only run of 1,200 transactions', () => {
    expect(parseArgs(['plan'])).toMatchObject({ write: false, transactions: 1200, database: '', confirm: undefined })
  })

  it('takes what the maintainer read off the dashboard', () => {
    expect(parseArgs(['measure', '--account-written-today', '1200', '--account-read-today', '5000'])).toMatchObject({ accountWrittenToday: 1200, accountReadToday: 5000 })
  })

  it('takes files for compare', () => {
    expect(parseArgs(['compare', 'a.json', 'b.json']).files).toEqual(['a.json', 'b.json'])
  })

  it('lets seed and cleanup be dry runs', () => {
    expect(parseArgs(['seed']).write).toBe(false)
    expect(parseArgs(['cleanup']).write).toBe(false)
  })

  it.each([
    ['no command', []],
    ['an unknown command', ['drop']],
    ['an unknown flag', ['plan', '--force']],
    ['a flag with no value', ['check', '--database']],
    ['a number that is not a number', ['plan', '--transactions', 'many']],
    ['a negative number', ['plan', '--transactions', '-5']],
    ['--write on a command that never writes', ['check', '--write']],
    ['--write on plan', ['plan', '--write']],
  ])('refuses %s', (_label, argv) => {
    expect(() => parseArgs(argv)).toThrow()
  })

  it('prints the usage with the refusal', () => {
    expect(() => parseArgs(['plan', '--force'])).toThrow(/Usage: npx tsx scripts\/measure-d1\.mjs/)
  })
})

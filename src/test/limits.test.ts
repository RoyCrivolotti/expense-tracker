// The limits a slow CI runner needs, set once for every test file (vitest.config.ts, src/test/setup.ts).
import { getConfig } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('test limits', () => {
  it('gives each test 15 s', ({ task }) => {
    expect(task.timeout).toBe(15_000)
  })

  it('gives findBy and waitFor 5 s, inside the test limit', () => {
    expect(getConfig().asyncUtilTimeout).toBe(5_000)
  })
})

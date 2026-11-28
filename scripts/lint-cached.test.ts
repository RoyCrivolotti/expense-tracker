import { describe, expect, it } from 'vitest'
import { CACHE_LOCATION, lintArgs } from './lint-cached.mjs'

describe('lintArgs', () => {
  it('keeps a cache on a laptop', () => {
    expect(lintArgs({})).toEqual([
      '.',
      '--max-warnings',
      '0',
      '--cache',
      '--cache-strategy',
      'content',
      '--cache-location',
      CACHE_LOCATION,
    ])
  })

  it.each([{ CI: 'true' }, { GITHUB_ACTIONS: 'true' }])('never uses the cache under %o', (env) => {
    expect(lintArgs(env)).toEqual(['.', '--max-warnings', '0'])
  })
})

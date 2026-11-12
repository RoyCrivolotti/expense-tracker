/**
 * What a person can download or restore is the app's data, and the stored hash of a capture key is not that. The
 * export is a fixed list of tables, so a capture table is outside it only while nobody adds one. These tests fail
 * when somebody does, and when any file outside the capture code starts to touch a key's hash.
 */
import { describe, expect, it } from 'vitest'
import { EXPORT_TABLES } from '../../domain/data/exportTables'
import { exportSql } from '../exportSql'

const CAPTURE_TABLE = /capture_(keys|cards|events|counters)|\brecommendations\b/

describe('the user export', () => {
  it.each(EXPORT_TABLES)('does not read a capture table for %s', (table) => {
    const { sql } = exportSql(table, 'someone@example.com', undefined, 10)
    expect(sql).not.toMatch(CAPTURE_TABLE)
    expect(sql).not.toMatch(/secret_hash/)
  })
})

const sources = import.meta.glob<string>(
  [
    '/functions/**/*.{ts,mjs}',
    '!/functions/**/*.test.ts',
    '/src/**/*.{ts,tsx}',
    '!/src/**/*.test.{ts,tsx}',
    '/workers/**/*.ts',
    '!/workers/**/*.test.ts',
    '/scripts/**/*.{ts,mjs}',
    '!/scripts/**/*.test.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
)

/**
 * The only files that may name the hash column: the statements that store and check it, the type that carries it, and
 * the code that makes a key and hands the hash to the port. None of them returns it to a caller outside the server.
 */
const MAY_NAME_THE_HASH = new Set([
  '/functions/_shared/capture/captureKeysSql.ts',
  '/src/domain/ports/captureRepository.ts',
  // functions/domain is a link to src/domain, so the glob sees the port twice.
  '/functions/domain/ports/captureRepository.ts',
  // The capture Worker compares the stored hash with the one it makes of the secret it was sent.
  '/workers/capture/src/authenticate.ts',
  '/src/domain/capture/captureKey.ts',
  '/src/domain/application/captureKeyService.ts',
  '/functions/domain/capture/captureKey.ts',
  '/functions/domain/application/captureKeyService.ts',
])

describe('the hash of a capture key', () => {
  it('is named only by the capture statements and the port that carries it', () => {
    const naming = Object.entries(sources)
      .filter(([, text]) => /secret_hash|secretHash/.test(text))
      .map(([path]) => path)
      .sort()
    // The adapter passes the value through without naming a column.
    expect(naming.filter((path) => !MAY_NAME_THE_HASH.has(path))).toEqual([])
  })
})

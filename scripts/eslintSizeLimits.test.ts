// The size limits in eslint.config.js list the files that were already over them, each capped at the size it had. This
// holds the caps to their purpose: a listed file cannot grow, and a new file or function is held to the limit.
// If a file below leaves its list because it was split, point the test at another file that is still listed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const SLOW = 120_000
const eslint = new ESLint({ cwd: ROOT })

/** A file on the list of files over 200 lines. */
const LONG_FILE = 'src/domain/engine/money.ts'
/** A file on the list of files with a function over 60 lines, whose longest function is a `function` declaration. */
const LONG_FUNCTION_FILE = 'src/ui/hooks/useSwipeDismiss.ts'
const LONG_FUNCTION = 'useSwipeDismiss'

async function ruleIdsOf(file: string, source: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(source, { filePath: join(ROOT, file) })
  return (result?.messages ?? []).map((message) => message.ruleId)
}

describe('the size limits in eslint.config.js', () => {
  it('pass a file on the list as it is, and fail it once it is a line longer', async () => {
    const source = readFileSync(join(ROOT, LONG_FILE), 'utf8')
    expect(await ruleIdsOf(LONG_FILE, source)).not.toContain('max-lines')
    expect(await ruleIdsOf(LONG_FILE, `${source}\nexport const oneLineMore = 1\n`)).toContain('max-lines')
  }, SLOW)

  it('pass a function on the list as it is, and fail it once it is a line longer', async () => {
    const source = readFileSync(join(ROOT, LONG_FUNCTION_FILE), 'utf8')
    expect(await ruleIdsOf(LONG_FUNCTION_FILE, source)).not.toContain('max-lines-per-function')

    // Add a statement as the last line of the function, before its closing brace.
    const lines = source.split('\n')
    const start = lines.findIndex((line) => line.startsWith(`export function ${LONG_FUNCTION}(`))
    const end = lines.findIndex((line, i) => i > start && line === '}')
    expect(start, `${LONG_FUNCTION} is in ${LONG_FUNCTION_FILE}`).toBeGreaterThan(-1)
    lines.splice(end, 0, '  void 0')

    expect(await ruleIdsOf(LONG_FUNCTION_FILE, lines.join('\n'))).toContain('max-lines-per-function')
  }, SLOW)

  it('hold a file that is not on the list to 200 lines and a function to 60', async () => {
    // A file that is not on either list, linted with other contents.
    const file = 'src/domain/ledger/pinned.ts'
    const longFile = Array.from({ length: 201 }, (_, i) => `export const line${i} = ${i}`).join('\n')
    const longFunction = `export function tooLong(): number {\n  let n = 0\n${'  n += 1\n'.repeat(60)}  return n\n}\n`
    expect(await ruleIdsOf(file, longFile)).toContain('max-lines')
    expect(await ruleIdsOf(file, longFunction)).toContain('max-lines-per-function')
  }, SLOW)
})

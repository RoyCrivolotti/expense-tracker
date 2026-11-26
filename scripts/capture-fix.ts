/**
 * Plans one-off corrections to payments the capture Worker stored, and writes nothing to any database. An operator
 * reads rows with the printed SELECT, plans from them, reads the plan, and only then applies its `apply.sql`.
 *
 *   node_modules/.bin/tsx scripts/capture-fix.ts sql redate
 *   node_modules/.bin/tsx scripts/capture-fix.ts plan redate --rows <rows.json> --out <dir>
 *
 * `redate` moves waiting payments stored before the Worker read the day a message names (workers/capture/fix/redate.ts).
 *
 * Rows come from `wrangler d1 execute <db> --remote --json --command "<the printed SQL>"`, saved as they are. The plan
 * goes to `--out`, a folder outside this repository: `plan.json` (ids, days and verdicts, never message text),
 * `apply.sql` and `undo.sql`. Apply with `--command "$(cat apply.sql)"` rather than `--file`: it answers each
 * statement's `changes`, which must match `expectedChanges` in `plan.json`; when one does not, run `undo.sql` the same way.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REDATE_ROWS_SQL, planRedate } from '../workers/capture/fix/redate'
import type { RedateRow } from '../workers/capture/fix/redate'

const git = (...args: string[]) =>
  execFileSync('git', ['-C', import.meta.dirname, ...args], { encoding: 'utf8' }).trim()
/** This checkout and, when it is a worktree, the checkout it belongs to: no plan may be written inside either. */
const CHECKOUTS = [
  git('rev-parse', '--show-toplevel'),
  path.dirname(path.resolve(import.meta.dirname, git('rev-parse', '--git-common-dir'))),
].map((p) => realpathSync(p).toLowerCase())

function option(name: string): string {
  const at = process.argv.indexOf(name)
  const value = at === -1 ? undefined : process.argv[at + 1]
  if (!value) throw new Error(`${name} is required`)
  return value
}

/**
 * The result sets of a `wrangler d1 execute --json` answer, in statement order. Exactly `count`, each with its rows, or
 * it stops: a missing set would read as "nothing found", which a plan must never take for "nothing there".
 */
function resultSets(
  file: string,
  count: number,
): unknown[][] {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
  if (!Array.isArray(parsed) || parsed.length !== count) throw new Error(`--rows must hold ${count} result set(s)`)
  return parsed.map((set: { results?: unknown; success?: unknown }) => {
    if (set.success !== true || !Array.isArray(set.results))
      throw new Error('--rows holds a failed or empty result set')
    return set.results as unknown[]
  })
}

/** The real path of `folder`, which need not exist yet: its nearest existing parent's real path and the rest. */
function realPath(folder: string): string {
  const missing: string[] = []
  let at = folder
  while (!existsSync(at)) {
    missing.unshift(path.basename(at))
    at = path.dirname(at)
  }
  return path.join(realpathSync(at), ...missing)
}

/**
 * The `--out` folder, made only once it is known to be outside every checkout of this repository, compared by real
 * path and without regard to case, as the Mac's disk does.
 */
function outFolder(): string {
  const folder = path.resolve(option('--out'))
  const real = realPath(folder).toLowerCase()
  if (CHECKOUTS.some((c) => real === c || real.startsWith(c + path.sep)))
    throw new Error('--out must be outside the repository')
  mkdirSync(folder, { recursive: true })
  return folder
}

function write(
  folder: string,
  files: Record<string, string>,
): void {
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(folder, name), text)
  process.stdout.write(`Written to ${folder}: ${Object.keys(files).join(', ')}\n`)
}

function redate(): void {
  const rows = resultSets(option('--rows'), 1)[0] as RedateRow[]
  const plan = planRedate(rows)
  const counts = new Map<string, number>()
  for (const e of plan.entries) counts.set(e.verdict, (counts.get(e.verdict) ?? 0) + 1)
  const listed = plan.entries.filter((e) => e.verdict === 'redate' || e.verdict === 'needs-a-look')
  const lines = listed.map(
    (e) => `${e.id.slice(0, 8)}  ${e.amountCents ?? '-'}  ${e.from} -> ${e.to ?? '(kept)'}  ${e.verdict}`,
  )
  process.stdout.write([...lines, `verdicts: ${JSON.stringify(Object.fromEntries(counts))}`, ''].join('\n'))
  const expectedChanges = plan.entries.filter((e) => e.verdict === 'redate').map(() => 1)
  write(outFolder(), {
    'plan.json': JSON.stringify({ entries: plan.entries, expectedChanges }, null, 1),
    'apply.sql': plan.apply,
    'undo.sql': plan.undo,
  })
}

const [command, mode] = process.argv.slice(2)
if (command === 'sql' && mode === 'redate') process.stdout.write(`${REDATE_ROWS_SQL}\n`)
else if (command === 'plan' && mode === 'redate') redate()
else throw new Error('Usage: see the comment at the top of scripts/capture-fix.ts')

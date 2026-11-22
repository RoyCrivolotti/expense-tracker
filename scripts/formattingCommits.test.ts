import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { filesTouchedByPr, ignoredRevisions, linesWrittenByPr, parseIgnoreFile, prLines } from './formattingCommits.mjs'

const SCRIPTS = path.resolve(import.meta.dirname)
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

describe('parseIgnoreFile', () => {
  it('reads full ids, drops comments and blank lines, and lower-cases', () => {
    const text = `# reformat\n${SHA_A.toUpperCase()} # the whole repo\n\nnot-a-sha\n${SHA_B}\n`
    expect(parseIgnoreFile(text)).toEqual([SHA_A, SHA_B])
  })

  it('refuses a short id, which git blame would also refuse', () => {
    expect(parseIgnoreFile('abc1234\n')).toEqual([])
  })
})

describe('linesWrittenByPr', () => {
  const row = (
    sha: string,
    final: number,
    extra = '',
  ) => `${sha} ${final} ${final} 1\nauthor x\n${extra}\tcode\n`

  it('keeps lines a real commit wrote and drops boundary and ignored ones', () => {
    const porcelain = row(SHA_A, 1, 'boundary\n') + row('c'.repeat(40), 2) + row(SHA_B, 3)
    expect(linesWrittenByPr(porcelain, new Set([SHA_B]))).toEqual(new Set([2]))
  })

  it('knows a repeated commit is a boundary from its first row only', () => {
    // Porcelain prints a commit's details once; later rows for it have a header and the code line only.
    const porcelain = row(SHA_A, 1, 'boundary\n') + `${SHA_A} 2 2\n\tcode\n`
    expect(linesWrittenByPr(porcelain, new Set())).toEqual(new Set())
  })
})

describe('in a repository with a formatting commit', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  const git = (
    cwd: string,
    ...args: string[]
  ) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const write = (
    cwd: string,
    file: string,
    text: string,
  ) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    writeFileSync(path.join(cwd, file), text)
  }
  const commit = (
    cwd: string,
    message: string,
  ) => {
    git(cwd, 'add', '-A')
    git(cwd, 'commit', '-q', '-m', message)
    return git(cwd, 'rev-parse', 'HEAD')
  }

  /**
   * main has two files. The branch changes one line of src/a.ts for real, reformats both files (indent 2 -> 4), then
   * records the reformat. Returns the repo and the reformat commit.
   */
  function build({ listFormatting }: { listFormatting: boolean }) {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'formatting-commits-')))
    dirs.push(cwd)
    git(cwd, 'init', '-q', '-b', 'main')
    git(cwd, 'config', 'user.email', 't@example.com')
    git(cwd, 'config', 'user.name', 't')
    write(cwd, 'src/a.ts', 'function a() {\n  const one = 1\n  const two = 2\n  return one + two\n}\n')
    write(cwd, 'src/ui/B.tsx', 'function B() {\n  const one = 1\n  const two = 2\n  return one + two\n}\n')
    commit(cwd, 'base')
    git(cwd, 'checkout', '-q', '-b', 'pr')
    write(cwd, 'src/a.ts', 'function a() {\n  const one = 1\n  const two = 20\n  return one + two\n}\n')
    commit(cwd, 'real change')
    write(cwd, 'src/a.ts', 'function a() {\n    const one = 1\n    const two = 20\n    return one + two\n}\n')
    write(cwd, 'src/ui/B.tsx', 'function B() {\n    const one = 1\n    const two = 2\n    return one + two\n}\n')
    const formatting = commit(cwd, 'reformat')
    if (listFormatting) write(cwd, '.git-blame-ignore-revs', `# reformat\n${formatting}\n`)
    else write(cwd, 'unrelated.txt', 'x\n')
    commit(cwd, 'bookkeeping')
    return { cwd, formatting }
  }

  it('reads the formatting commit from the ignore file, and only if the checkout has it', () => {
    const { cwd, formatting } = build({ listFormatting: true })
    expect(ignoredRevisions('main', cwd)).toEqual([formatting])
    write(cwd, '.git-blame-ignore-revs', `${SHA_A}\n${formatting}\n`)
    expect(ignoredRevisions('main', cwd)).toEqual([formatting])
  })

  it('finds nothing to ignore when there is no ignore file', () => {
    const { cwd } = build({ listFormatting: false })
    expect(ignoredRevisions('main', cwd)).toEqual([])
  })

  it('counts only the line a real commit changed, though the reformat rewrote every line', () => {
    const { cwd, formatting } = build({ listFormatting: true })
    expect(prLines('main', 'src/a.ts', [formatting], cwd)).toEqual(new Set([3]))
  })

  it('counts every reformatted line when the reformat is not listed (what the gate did before)', () => {
    const { cwd } = build({ listFormatting: true })
    expect(prLines('main', 'src/a.ts', [], cwd)).toEqual(new Set([2, 3, 4]))
  })

  it('drops a file only the reformat touched and keeps one a real change touched too', () => {
    const { cwd, formatting } = build({ listFormatting: true })
    const files = ['src/a.ts', 'src/ui/B.tsx']
    expect(filesTouchedByPr('main', files, [formatting], cwd)).toEqual(['src/a.ts'])
    expect(filesTouchedByPr('main', files, [], cwd)).toEqual(files)
  })

  it('lets coverage:diff pass on an uncovered reformat when the changed line is covered, and fail without the list', () => {
    const { cwd } = build({ listFormatting: true })
    const lcov = (lines: Record<number, number>) =>
      `SF:${path.join(cwd, 'src/a.ts')}\n${Object.entries(lines)
        .map(([line, hits]) => `DA:${line},${hits}`)
        .join('\n')}\nend_of_record\n`
    // Line 3 (the real change) is covered; the lines the reformat rewrote are not.
    write(cwd, 'coverage/lcov.info', lcov({ 2: 0, 3: 1, 4: 0 }))
    const run = () =>
      spawnSync('node', [path.join(SCRIPTS, 'check-diff-coverage.mjs'), '--base', 'main'], { cwd, encoding: 'utf8' })
    const withList = run()
    expect(withList.stdout).toContain('1/1 changed lines covered')
    expect(withList.status).toBe(0)

    rmSync(path.join(cwd, '.git-blame-ignore-revs'))
    commit(cwd, 'drop the list')
    write(cwd, 'coverage/lcov.info', lcov({ 2: 0, 3: 1, 4: 0 }))
    const without = run()
    expect(without.stdout).toContain('1/3 changed lines covered')
    expect(without.status).toBe(1)
  })

  /**
   * main already has an ignore file (with no commits in it). The branch makes one real, uncovered change to src/a.ts and
   * then names that very commit in the file, which is how a PR would try to skip the gates.
   */
  function buildSelfListed() {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'formatting-commits-')))
    dirs.push(cwd)
    git(cwd, 'init', '-q', '-b', 'main')
    git(cwd, 'config', 'user.email', 't@example.com')
    git(cwd, 'config', 'user.name', 't')
    write(cwd, 'src/a.ts', 'function a() {\n  const one = 1\n  return one\n}\n')
    write(cwd, '.git-blame-ignore-revs', '# nothing yet\n')
    commit(cwd, 'base')
    git(cwd, 'checkout', '-q', '-b', 'pr')
    write(cwd, 'src/a.ts', 'function a() {\n  const one = 1\n  const two = 2\n  return one + two\n}\n')
    const real = commit(cwd, 'real change')
    write(cwd, '.git-blame-ignore-revs', `# nothing yet\n${real}\n`)
    commit(cwd, 'skip my own commit')
    return { cwd, real }
  }

  it("does not let a PR skip its own commit by listing it: only the base's list counts", () => {
    const { cwd, real } = buildSelfListed()
    expect(ignoredRevisions('main', cwd)).toEqual([])
    expect(prLines('main', 'src/a.ts', ignoredRevisions('main', cwd), cwd)).toEqual(new Set([3, 4]))
    expect(filesTouchedByPr('main', ['src/a.ts'], ignoredRevisions('main', cwd), cwd)).toEqual(['src/a.ts'])
    // The same list read from the head would have skipped it.
    expect(prLines('main', 'src/a.ts', [real], cwd)).toEqual(new Set())
  })

  it('still measures a PR that lists its own commit: coverage:diff fails on its uncovered lines', () => {
    const { cwd } = buildSelfListed()
    write(cwd, 'coverage/lcov.info', `SF:${path.join(cwd, 'src/a.ts')}\nDA:3,0\nDA:4,0\nend_of_record\n`)
    const result = spawnSync('node', [path.join(SCRIPTS, 'check-diff-coverage.mjs'), '--base', 'main'], {
      cwd,
      encoding: 'utf8',
    })
    expect(result.stdout).toContain('0/2 changed lines covered')
    expect(result.status).toBe(1)
  })

  it('still asks for pictures when a PR lists its own UI commit: check:pr-screenshots does not skip it', () => {
    const { cwd } = buildSelfListed()
    write(cwd, 'src/ui/B.tsx', 'export const B = 1\n')
    const ui = commit(cwd, 'change a screen')
    write(cwd, '.git-blame-ignore-revs', `# nothing yet\n${ui}\n`)
    commit(cwd, 'skip the screen change')
    const result = spawnSync('node', [path.join(SCRIPTS, 'check-pr-screenshots.mjs'), '--base', 'main', '--pr', '1'], {
      cwd,
      encoding: 'utf8',
    })
    // It goes on to read the PR description (which fails here, there is no PR), where a skipped file would stop it.
    expect(result.stdout).not.toContain('nothing to require')
    expect(result.status).not.toBe(0)
  })
})

/**
 * Runs npm scripts at the same time and fails if any of them fails, naming which. `npm run verify`
 * uses it for the formatting check, lint and the type check, which read the same files and
 * share nothing else, so the three take as long as lint alone.
 *
 *   node scripts/side-by-side.mjs format:check lint:cached typecheck
 *
 * Each script's output is held and printed in one piece when it ends, so three tools never
 * interleave their lines. Every script runs to the end even when another has failed, so one run
 * shows every problem.
 */
import { spawn } from 'node:child_process'

/**
 * @typedef {{ name: string, command: string, args: string[] }} Task
 * @typedef {{ name: string, ok: boolean, seconds: number }} Outcome
 */

/**
 * @param {Task[]} tasks
 * @param {(text: string) => void} print
 * @returns {Promise<Outcome[]>}
 */
export function runSideBySide(
  tasks,
  print = (text) => process.stdout.write(text),
) {
  return Promise.all(
    tasks.map(
      (task) =>
        new Promise((resolve) => {
          const started = Date.now()
          /** @type {Buffer[]} */
          const output = []
          const child = spawn(task.command, task.args, { stdio: ['ignore', 'pipe', 'pipe'] })
          child.stdout.on('data', (chunk) => output.push(chunk))
          child.stderr.on('data', (chunk) => output.push(chunk))
          let done = false
          /** @param {boolean} ok */
          const finish = (
            ok,
            extra = '',
          ) => {
            // A command that cannot start reports 'error' and then 'close'.
            if (done) return
            done = true
            const seconds = (Date.now() - started) / 1000
            print(`\n── ${task.name}: ${ok ? 'passed' : 'FAILED'} in ${seconds.toFixed(1)} s\n`)
            print(Buffer.concat(output).toString() + extra)
            resolve({ name: task.name, ok, seconds })
          }
          child.on('error', (error) => finish(false, `${error.message}\n`))
          child.on('close', (code) => finish(code === 0))
        }),
    ),
  )
}

/** @param {Outcome[]} outcomes */
export function summary(outcomes) {
  const failed = outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.name)
  return failed.length === 0 ? null : `Failed: ${failed.join(', ')}`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const names = process.argv.slice(2)
  const outcomes = await runSideBySide(names.map((name) => ({ name, command: npm, args: ['run', '--silent', name] })))
  const failed = summary(outcomes)
  if (failed) {
    console.error(`\n${failed}`)
    process.exit(1)
  }
}

// @vitest-environment node
// What .github/workflows/deploy.yml promises about the capture Workers: every push to main deploys both from that
// commit, after the migrations, and then checks that they run it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPTURE_ENVIRONMENTS, captureTarget } from './deploy-capture.mjs'

const ROOT = join(import.meta.dirname, '..')
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')
const workflow = read('.github/workflows/deploy.yml')
// Without its comments, which would otherwise count as part of the step above them.
const ship = workflow.slice(workflow.indexOf('\n  ship:\n')).replace(/^ *#.*\n/gm, '')
const [head = '', ...steps] = ship.split(/\n(?= {6}- )/)

/** The one step of `ship` that runs this command. */
function step(command: string): string {
  const found = steps.filter((block) => block.includes(`run: ${command}\n`))
  expect(found, command).toHaveLength(1)
  return found[0]
}

const CAPTURE = [
  'npm run deploy:capture -- staging',
  'npm run deploy:capture -- prod',
  'npm run check:capture',
] as const

describe('deploy.yml, the ship job', () => {
  it('runs after the migration jobs, and not when one of them failed', () => {
    expect(head).toContain('needs: [ci, schema, migrate-dev, migrate-prod]')
    for (const job of ['migrate-dev', 'migrate-prod']) {
      expect(head).toContain(`contains(fromJSON('["success","skipped"]'), needs.${job}.result)`)
    }
    expect(head).toContain("github.ref == 'refs/heads/main'")
  })

  it('deploys the app, then both capture Workers, then checks them, then probes Access', () => {
    const order = [
      'run: npm run deploy\n',
      'run: npm run deploy:dev\n',
      ...CAPTURE.map((command) => `run: ${command}\n`),
      'bash scripts/probe-access.sh',
    ].map((text) => ship.indexOf(text))

    expect(order).not.toContain(-1)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it.each(CAPTURE)('runs `%s` with the deploy token, and a failure fails the job', (command) => {
    const block = step(command)

    expect(block).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}')
    expect(block).not.toMatch(/^\s+(if|continue-on-error):/m)
    expect(block).not.toContain('||')
  })

  it('probes Access even when a capture step failed', () => {
    const probe = steps.filter((block) => block.includes('scripts/probe-access.sh'))

    expect(probe).toHaveLength(1)
    expect(probe[0]).toContain('if: ${{ !cancelled() }}')
  })

  it('deploys every environment the check reads', () => {
    for (const name of CAPTURE_ENVIRONMENTS) step(`npm run deploy:capture -- ${name}`)
  })

  // A job or step that set one again would bind a Worker to another database than the one just migrated.
  it.each(['PROD_D1_NAME', 'DEV_D1_NAME'])('sets %s once, for the whole workflow', (name) => {
    const set = workflow.match(new RegExp(`\\b${name}["']?\\s*[:=]`, 'g'))

    expect(set).toHaveLength(1)
    expect(workflow).toMatch(new RegExp(`^env:\n(?: {2}.*\n)*? {2}${name}: `, 'm'))
  })

  it('binds the capture Workers to the databases it migrates', () => {
    const env = Object.fromEntries(
      [...workflow.matchAll(/^ {2}((?:PROD|DEV)_D1_NAME): (\S+)$/gm)].map((m) => [m[1], m[2]]),
    )

    expect(captureTarget('prod', env).database).toBe(captureTarget('prod', {}).database)
    expect(captureTarget('staging', env).database).toBe(captureTarget('staging', {}).database)
    expect(Object.keys(env)).toEqual(['PROD_D1_NAME', 'DEV_D1_NAME'])
  })

  it('runs the scripts these commands name', () => {
    const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

    expect(scripts['deploy:capture']).toBe('node scripts/deploy-capture.mjs')
    expect(scripts['check:capture']).toBe('node scripts/check-capture-deployed.mjs')
  })

  it('is the only workflow that deploys them', () => {
    for (const other of ['ci.yml', 'deploy-dev.yml', 'verify.yml', 'restore-database.yml']) {
      expect(read(`.github/workflows/${other}`)).not.toContain('deploy:capture')
    }
  })
})

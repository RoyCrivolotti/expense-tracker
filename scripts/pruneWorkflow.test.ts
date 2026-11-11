// @vitest-environment node
// What .github/workflows/prune-deployments.yml promises: the weekly run deletes, a manual run does not unless asked,
// no pull request can start it, and it prunes the projects the deploy workflows ship to.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const read = (file: string) => readFileSync(join(ROOT, '.github/workflows', file), 'utf8')
const prune = read('prune-deployments.yml')
const triggers = prune.slice(prune.indexOf('\non:'), prune.indexOf('\npermissions:'))

describe('prune-deployments.yml', () => {
  it('runs weekly and by hand, and never for a pull request', () => {
    expect(triggers).toMatch(/schedule:\n\s+- cron: '[^']+ \* \* \d'/)
    expect(triggers).toContain('workflow_dispatch:')
    expect(prune).not.toMatch(/pull_request/)
  })

  it('makes a manual run a dry run unless dry_run is switched off', () => {
    expect(triggers).toMatch(/dry_run:[\s\S]*type: boolean\n\s+default: true/)
    expect(prune).toContain('[ "$EVENT" = schedule ] || [ "$DRY_RUN" = false ]')
  })

  it('reads the repository and nothing else', () => {
    expect(prune).toMatch(/^permissions:\n {2}contents: read\n/m)
    expect(prune).not.toMatch(/write/)
  })

  it('stays out of forks', () => {
    expect(prune).toMatch(/if: github\.repository == '[\w-]+\/[\w-]+'/)
  })

  it('uses the account and token the deploy uses', () => {
    const accountId = /CLOUDFLARE_ACCOUNT_ID: '(\w+)'/
    expect(prune.match(accountId)?.[1]).toBe(read('deploy.yml').match(accountId)?.[1])
    expect(prune).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}')
  })

  it('prunes the projects listed in config, and only those', () => {
    const projects = JSON.parse(readFileSync(join(ROOT, 'config/prune-projects.json'), 'utf8')) as string[]

    expect(projects).toEqual(['expense-tracker', 'roy-expenses-stg'])
    expect(prune).toContain("jq -r '.[]' config/prune-projects.json")
    // The names live in the config file alone (the repository name in the fork guard is not a project).
    for (const name of projects) expect(prune).not.toMatch(new RegExp(`(^|[^\\w/-])${name}([^\\w-]|$)`, 'm'))
  })

  it('ships to exactly those projects', () => {
    const projects = JSON.parse(readFileSync(join(ROOT, 'config/prune-projects.json'), 'utf8')) as string[]
    const deployed = /for project in ((?:[\w-]+ ?)+); do/.exec(read('deploy.yml'))?.[1]?.trim().split(' ')

    expect(deployed).toEqual(projects)
  })

  it('passes the limit only when one was given', () => {
    expect(triggers).toMatch(/max_delete:[\s\S]*type: string/)
    expect(prune).toContain('if [ -n "$MAX_DELETE" ]; then args+=(--max-delete "$MAX_DELETE"); fi')
  })
})

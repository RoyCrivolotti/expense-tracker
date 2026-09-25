#!/usr/bin/env node
/** Fail verify when migration files are not reflected in DEPLOYMENT.md. */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { invalidMigrationNames } from './migrate.mjs'

const root = join(import.meta.dirname, '..')
const migrationsDir = join(root, 'migrations')
const deploymentPath = join(root, 'docs/DEPLOYMENT.md')

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.error('No migration files found in migrations/')
  process.exit(1)
}

// The name is written into the `_migrations` record, so it has to be one that can be.
const badNames = invalidMigrationNames(files)
if (badNames.length > 0) {
  console.error(`Migration file names must look like 0028_short_name.sql (lowercase words): ${badNames.join(', ')}`)
  process.exit(1)
}

const numbers = files.map((name) => Number(name.slice(0, 4)))
for (let i = 0; i < numbers.length; i++) {
  const expected = i + 1
  if (numbers[i] !== expected) {
    console.error(`Migration numbering gap: expected ${String(expected).padStart(4, '0')}_*.sql`)
    process.exit(1)
  }
}

const latest = files[files.length - 1]
const stem = latest.replace('.sql', '')
const deployment = readFileSync(deploymentPath, 'utf8')

if (!deployment.includes(stem)) {
  console.error(`docs/DEPLOYMENT.md must mention ${stem} (latest migration ${latest})`)
  process.exit(1)
}

console.log(`migration docs OK (${files.length} files, latest ${latest})`)

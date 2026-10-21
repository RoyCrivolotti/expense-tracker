/**
 * Turn a backup into the SQL that restores it. Reads files and writes text; it never connects to a database or
 * a bucket, so what it prints can be read before anything applies it.
 *
 *   # 1. Download the backup from the bucket (the key is  <owner>/<YYYY-MM-DD>/  for a chunked backup, or
 *   #    <owner>/<YYYY-MM-DD>.json  for a single-file snapshot):
 *   npx wrangler r2 object get roy-expenses-backups/<owner>/<date>/manifest.json --file backup/<owner>/<date>/manifest.json
 *   #    ...and each part the manifest lists, to the same path under backup/.
 *   # 2. Generate the SQL:
 *   npx tsx scripts/restore-backup.ts --dir backup --owner <owner> --date <YYYY-MM-DD> --out restore.sql
 *   # 3. Apply it to an EMPTY database that has every migration (a new D1 database, or a local one), never to the
 *   #    live one:  npx wrangler d1 execute <new-database> --remote --file=restore.sql
 *
 * Add `--as <email>` to restore the rows under another owner. See docs/DEPLOYMENT.md, "Restoring from a backup".
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readBackup } from '../functions/_shared/backupRestore'
import { restoreScript } from '../functions/_shared/restoreSql'

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 ? process.argv[at + 1] : undefined
}

function required(name: string): string {
  const value = option(name)
  if (!value) throw new Error(`Give --${name}. See the top of scripts/restore-backup.ts.`)
  return value
}

const dir = required('dir')
const owner = required('owner')
const date = required('date')
const target = option('as') ?? owner
const out = option('out')

const reader = {
  get: (key: string): Promise<string | null> => {
    try {
      return Promise.resolve(readFileSync(join(dir, key), 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Promise.resolve(null)
      throw error
    }
  },
}

const backup = await readBackup(reader, owner, date)
const script = restoreScript(target, backup.tables, new Date().toISOString())
const rows = script.split('\n').filter((line) => line.startsWith('INSERT')).length
if (out) writeFileSync(out, script)
else process.stdout.write(script)
console.error(`${rows} statements for ${target} from the ${backup.kind} backup of ${owner} on ${date}`)

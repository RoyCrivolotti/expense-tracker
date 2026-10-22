/**
 * Command-line arguments for scripts/measure-d1.mjs. Anything unrecognised is an error, so a misspelt flag
 * can neither turn a read-only run into a write nor quietly drop a safety flag.
 */

export const COMMANDS = ['plan', 'check', 'snapshot', 'seed', 'measure', 'cleanup', 'verify', 'compare'] as const
export type Command = (typeof COMMANDS)[number]

/** Commands that write when given `--write`. Without it `seed` and `cleanup` are dry runs and `measure` only reads. */
export const WRITING: readonly Command[] = ['seed', 'cleanup', 'measure']

export interface Args {
  command: Command
  database: string
  transactions: number
  write: boolean
  confirm: string | undefined
  snapshot: string | undefined
  /** What the maintainer read off the dashboard, when the token cannot read analytics. */
  accountWrittenToday: number | undefined
  accountReadToday: number | undefined
  files: string[]
}

export const USAGE = [
  'Usage: npx tsx scripts/measure-d1.mjs <command> [flags]',
  '  plan [--transactions N]                         print the budget; touches nothing, needs no token',
  '  check --database D                              read-only: target, schema, indexes, statistics, account use',
  "  snapshot --database D                           read-only: fingerprint every row that is not the synthetic owner's",
  '  seed [--transactions N]                         dry run: the statements and what they cost; offline',
  '  seed --database D --write --confirm D --snapshot FILE [--transactions N]',
  '  measure --database D [--write --confirm D]      read routes; with --write also the write routes',
  '  cleanup                                         dry run: the deletes it would send; offline',
  '  cleanup --database D --write --confirm D [--transactions N]',
  '  verify --database D --snapshot FILE             owner is gone, everyone else is unchanged',
  '  compare FILE FILE                               rows per 1,000 transactions between two measure runs',
].join('\n')

function number(flag: string, value: string | undefined): number {
  const parsed = Number(value)
  if (value === undefined || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} needs a whole number\n${USAGE}`)
  }
  return parsed
}

type Setter = (args: Args, flag: string, value: string) => void

const VALUE_FLAGS: Record<string, Setter> = {
  '--database': (args, _flag, value) => { args.database = value },
  '--confirm': (args, _flag, value) => { args.confirm = value },
  '--snapshot': (args, _flag, value) => { args.snapshot = value },
  '--transactions': (args, flag, value) => { args.transactions = number(flag, value) },
  '--account-written-today': (args, flag, value) => { args.accountWrittenToday = number(flag, value) },
  '--account-read-today': (args, flag, value) => { args.accountReadToday = number(flag, value) },
}

export function parseArgs(argv: readonly string[]): Args {
  const [command, ...rest] = argv
  if (!command || !(COMMANDS as readonly string[]).includes(command)) throw new Error(USAGE)
  const args: Args = {
    command: command as Command,
    database: '',
    transactions: 1200,
    write: false,
    confirm: undefined,
    snapshot: undefined,
    accountWrittenToday: undefined,
    accountReadToday: undefined,
    files: [],
  }
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i] ?? ''
    const setter = VALUE_FLAGS[flag]
    if (flag === '--write') {
      args.write = true
    } else if (setter) {
      const value = rest[(i += 1)]
      if (value === undefined) throw new Error(`${flag} needs a value\n${USAGE}`)
      setter(args, flag, value)
    } else if (flag.startsWith('--')) {
      throw new Error(`Unknown flag ${flag}\n${USAGE}`)
    } else {
      args.files.push(flag)
    }
  }
  if (args.write && !WRITING.includes(args.command)) throw new Error(`${args.command} never writes; drop --write`)
  return args
}

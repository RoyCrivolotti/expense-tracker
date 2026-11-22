import { join } from 'node:path'
import { format } from 'prettier'
import { describe, expect, it } from 'vitest'

const plugin = join(import.meta.dirname, 'prettierWrapParams.mjs')
const options = { semi: false, singleQuote: true, printWidth: 120, trailingComma: 'all' as const, plugins: [plugin] }

const run = (
  source: string,
  filepath = 'fixture.tsx',
) => format(source, { ...options, filepath })

// One of each form that must wrap, then the ones that must not. Prettier would keep every one of these on a single line.
const INPUT = `export async function decl(db: D1Database, email: string): Promise<AllowedUser | null> { return null }
export function over(a: string): void
export function over(a: number, b: number): void
export function over(a: any, b?: any) {}
declare function ambient(a: number, b: number): void
const arrow = (a: number, b: number) => a + b
let expr = function (a: number, b: number) { return a }
const obj = { prop: (a: number, b: number) => a, fn: function (a: number, b: number) {}, method(a: number, b: number) {}, get g() { return 1 }, set s(v: number) {} }
class K {
  field = (a: number, b: number) => a
  constructor(private x: number, public y: number) {}
  method(a: number, b: number): void {}
  static s(a: number, b: number) {}
  abstract abs(a: number, b: number): void
  #priv(a: number, b: number) {}
  get g() { return 1 }
  set s(v: number) {}
}
interface I { m(a: number, b: number): void; (a: number, b: number): void; new (a: number, b: number): I; p: (a: number, b: number) => void }
type Lit = { m(a: number, b: number): void }
type Fn = (a: A, b: B) => void
type Ctor = new (a: A, b: B) => Foo
const zero = () => 1, one = (a: number) => a, hug = ({ a, b }: P) => a
rows.reduce((sum, row) => sum + row.amount, 0)
items.sort((a, b) => a.date.localeCompare(b.date))
new Promise((resolve, reject) => resolve(1))
const el = <Button onClick={(a, b) => go(a, b)} />
foo(function (a, b) { return a })
const cb = useCallback((a: number, b: number) => a + b, [])
const asd = ((a: number, b: number) => a) as Fn
const curry = (a: number) => (b: number, c: number) => a
foo({ cb: (a: number, b: number) => a })
foo(opt ?? ((x: number, y: number) => 1))
const gated = <Button onClick={cond ? (x, y) => 1 : undefined} />
const list = [(a: number, b: number) => 1]
;((a: number, b: number) => 1)()
`

const EXPECTED = `export async function decl(
  db: D1Database,
  email: string,
): Promise<AllowedUser | null> {
  return null
}
export function over(a: string): void
export function over(
  a: number,
  b: number,
): void
export function over(
  a: any,
  b?: any,
) {}
declare function ambient(
  a: number,
  b: number,
): void
const arrow = (
  a: number,
  b: number,
) => a + b
let expr = function (
  a: number,
  b: number,
) {
  return a
}
const obj = {
  prop: (
    a: number,
    b: number,
  ) => a,
  fn: function (
    a: number,
    b: number,
  ) {},
  method(
    a: number,
    b: number,
  ) {},
  get g() {
    return 1
  },
  set s(v: number) {},
}
class K {
  field = (
    a: number,
    b: number,
  ) => a
  constructor(
    private x: number,
    public y: number,
  ) {}
  method(
    a: number,
    b: number,
  ): void {}
  static s(
    a: number,
    b: number,
  ) {}
  abstract abs(
    a: number,
    b: number,
  ): void
  #priv(
    a: number,
    b: number,
  ) {}
  get g() {
    return 1
  }
  set s(v: number) {}
}
interface I {
  m(
    a: number,
    b: number,
  ): void
  (
    a: number,
    b: number,
  ): void
  new (
    a: number,
    b: number,
  ): I
  p: (
    a: number,
    b: number,
  ) => void
}
type Lit = {
  m(
    a: number,
    b: number,
  ): void
}
type Fn = (
  a: A,
  b: B,
) => void
type Ctor = new (
  a: A,
  b: B,
) => Foo
const zero = () => 1,
  one = (a: number) => a,
  hug = ({ a, b }: P) => a
rows.reduce((sum, row) => sum + row.amount, 0)
items.sort((a, b) => a.date.localeCompare(b.date))
new Promise((resolve, reject) => resolve(1))
const el = <Button onClick={(a, b) => go(a, b)} />
foo(function (a, b) {
  return a
})
const cb = useCallback((a: number, b: number) => a + b, [])
const asd = ((
  a: number,
  b: number,
) => a) as Fn
const curry =
  (a: number) =>
  (
    b: number,
    c: number,
  ) =>
    a
foo({
  cb: (
    a: number,
    b: number,
  ) => a,
})
foo(opt ?? ((x: number, y: number) => 1))
const gated = <Button onClick={cond ? (x, y) => 1 : undefined} />
const list = [
  (
    a: number,
    b: number,
  ) => 1,
]
;((
  a: number,
  b: number,
) => 1)()
`

describe('prettierWrapParams', () => {
  it('wraps every function with two or more parameters and leaves the rest alone', async () => {
    expect(await run(INPUT)).toBe(EXPECTED)
  })

  it('gives the same text when its own output is formatted again', async () => {
    const once = await run(INPUT)
    expect(await run(once)).toBe(once)
  })

  it('does nothing without the add-on, which is what the first test would otherwise be passing for', async () => {
    const plain = await format(INPUT, { ...options, plugins: [], filepath: 'fixture.tsx' })
    expect(plain).not.toBe(EXPECTED)
    expect(plain).toContain('export async function decl(db: D1Database, email: string): Promise<AllowedUser | null> {')
  })

  it('also wraps in JavaScript files, which Prettier parses with a different parser', async () => {
    const js =
      'export function a(b, c) { return [1].map((x, i) => x + i) }\nclass K { m(a, b) {} }\nconst o = { m(a, b) {} }\n'
    expect(await run(js, 'fixture.mjs')).toBe(
      [
        'export function a(',
        '  b,',
        '  c,',
        ') {',
        '  return [1].map((x, i) => x + i)',
        '}',
        'class K {',
        '  m(',
        '    a,',
        '    b,',
        '  ) {}',
        '}',
        'const o = {',
        '  m(',
        '    a,',
        '    b,',
        '  ) {},',
        '}',
        '',
      ].join('\n'),
    )
  })
})

/**
 * The index the app builds is the one it has always had. It orders matches by the newest row's label, and
 * leaves descriptions the collator calls equal in the order the trie meets them, which depends on the order
 * the rows arrived in. The key order that the server's answer is in is a separate option, so adding it
 * changed nothing the app does. This holds the default to the original algorithm, copied here as it was,
 * on generated ledgers full of the cases where the two orders part ways.
 */
import { describe, expect, it } from 'vitest'
import { generatedRows, keyed, prefixesFor } from '../testing/descriptionLedger'
import { mulberry32 } from '../domain/engine/rng'
import { type IndexRow, buildDescriptionIndex } from './descriptionIndex'

interface Entry {
  label: string
  template: { type: string; categoryId: number; accountId: number }
  date: string
  id: number
}

interface Node {
  children: Map<string, Node>
  keys: string[]
}

const normalize = (text: string): string => text.trim().toLowerCase()

const recency = (a: Entry, b: Entry): number => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.id - a.id)

/** The newest row of each description, as the original `buildEntries` kept them. */
function originalEntries(rows: IndexRow[]): Map<string, Entry> {
  const entries = new Map<string, Entry>()
  for (const txn of rows) {
    const label = txn.description.trim()
    if (txn.cancelled || !label) continue
    const key = normalize(label)
    const candidate: Entry = {
      label: txn.description,
      template: { type: txn.type, categoryId: txn.categoryId, accountId: txn.accountId },
      date: txn.date,
      id: txn.id,
    }
    const existing = entries.get(key)
    if (!existing || recency(candidate, existing) < 0) entries.set(key, candidate)
  }
  return entries
}

function insert(root: Node, key: string): void {
  let node = root
  for (const ch of key) {
    const next = node.children.get(ch) ?? { children: new Map<string, Node>(), keys: [] }
    node.children.set(ch, next)
    node = next
  }
  if (!node.keys.includes(key)) node.keys.push(key)
}

function collect(node: Node, out: string[]): void {
  out.push(...node.keys)
  for (const child of node.children.values()) collect(child, out)
}

/** `buildDescriptionIndex(...).search` exactly as it was before the order option existed. */
function originalSearch(rows: IndexRow[], prefix: string, limit = 8): Array<{ label: string; template: Entry['template'] }> {
  const entries = originalEntries(rows)
  const root: Node = { children: new Map(), keys: [] }
  for (const key of entries.keys()) insert(root, key)
  const norm = normalize(prefix)
  let node: Node | undefined = root
  for (const ch of norm) node = node?.children.get(ch)
  if (!norm || !node) return []
  const keys: string[] = []
  collect(node, keys)
  return [...new Set(keys)]
    .map((key) => entries.get(key)!)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    .slice(0, limit)
    .map((e) => ({ label: e.label, template: e.template }))
}

describe('the index with no options', () => {
  it('answers every search as the original algorithm did, on ledgers where the key order would differ', () => {
    const searches = Array.from({ length: 25 }, (_, i) => i + 1).flatMap((seed) => {
      const rnd = mulberry32(seed)
      const rows = generatedRows(seed)
      const prefixes = prefixesFor(rows, rnd).filter(() => rnd() < 0.4)
      return prefixes.flatMap((prefix) => [1, 3, 8, 25].map((limit) => ({ seed, rows, prefix, limit })))
    })
    let keyOrderDiffers = 0
    for (const { seed, rows, prefix, limit } of searches) {
      const mine = buildDescriptionIndex(rows).search(prefix, limit)
      expect(mine, JSON.stringify({ seed, prefix, limit })).toEqual(originalSearch(rows, prefix, limit))
      if (JSON.stringify(keyed(rows).search(prefix, limit)) !== JSON.stringify(mine)) keyOrderDiffers += 1
    }
    expect(searches.length).toBeGreaterThan(2_000)
    expect(keyOrderDiffers).toBeGreaterThan(0)
  })

  it('resolves a label as before, and is unaffected by the locale option', () => {
    const rows = generatedRows(3)
    const index = buildDescriptionIndex(rows)
    expect(index.resolve(' RENT ')).toEqual(buildDescriptionIndex(rows, { order: 'label' }).resolve('rent'))
    expect(buildDescriptionIndex(rows, { locale: 'sv' }).search('ä')).toEqual(buildDescriptionIndex(rows, { order: 'label', locale: 'sv' }).search('ä'))
  })

  it('differs from the key order for a label padded with spaces, which is why the app has to opt in', () => {
    const base = { date: '2026-01-01', type: 'expense', categoryId: 1, accountId: 1, cancelled: false } as const
    const rows: IndexRow[] = [
      { ...base, id: 1, description: ' Bar' },
      { ...base, id: 2, description: 'Apple bar' },
    ]
    expect(buildDescriptionIndex(rows).search('b').map((s) => s.label)).toEqual([' Bar'])
    const both: IndexRow[] = [...rows, { ...base, id: 3, description: 'Bat' }]
    expect(buildDescriptionIndex(both).search('ba').map((s) => s.label)).toEqual([' Bar', 'Bat'])
    expect(keyed(both).search('ba').map((s) => s.label)).toEqual([' Bar', 'Bat'])
    const padded: IndexRow[] = [{ ...base, id: 1, description: ' Zed' }, { ...base, id: 2, description: 'Zebra' }]
    expect(buildDescriptionIndex(padded).search('ze').map((s) => s.label)).toEqual([' Zed', 'Zebra'])
    expect(keyed(padded).search('ze').map((s) => s.label)).toEqual(['Zebra', ' Zed'])
  })
})

import type { Transaction, TxnType } from '../types'

export interface DescriptionTemplate {
  type: TxnType
  categoryId: number
  accountId: number
}

export interface DescriptionSuggestion {
  label: string
  template: DescriptionTemplate
}

export interface DescriptionIndex {
  search(prefix: string, limit?: number): DescriptionSuggestion[]
  resolve(label: string): DescriptionSuggestion | undefined
}

/** Normalize for comparison only; canonical label keeps original spelling. */
export function normalizeDescriptionKey(description: string): string {
  return description.trim().toLowerCase()
}

interface Entry {
  label: string
  template: DescriptionTemplate
  date: string
  id: number
}

interface TrieNode {
  children: Map<string, TrieNode>
  /** Normalized keys whose full text ends at this node. */
  keys: string[]
}

function compareRecency(a: Entry, b: Entry): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return b.id - a.id
}

function insertKey(root: TrieNode, key: string): void {
  let node = root
  for (const ch of key) {
    let next = node.children.get(ch)
    if (!next) {
      next = { children: new Map(), keys: [] }
      node.children.set(ch, next)
    }
    node = next
  }
  if (!node.keys.includes(key)) node.keys.push(key)
}

function collectKeys(node: TrieNode, out: string[]): void {
  out.push(...node.keys)
  for (const child of node.children.values()) collectKeys(child, out)
}

function buildEntries(transactions: Transaction[]): Map<string, Entry> {
  const entries = new Map<string, Entry>()
  for (const txn of transactions) {
    if (txn.cancelled) continue
    const label = txn.description.trim()
    if (!label) continue
    const key = normalizeDescriptionKey(label)
    const candidate: Entry = {
      label: txn.description,
      template: { type: txn.type, categoryId: txn.categoryId, accountId: txn.accountId },
      date: txn.date,
      id: txn.id,
    }
    const existing = entries.get(key)
    if (!existing || compareRecency(candidate, existing) < 0) entries.set(key, candidate)
  }
  return entries
}

function buildTrie(keys: string[]): TrieNode {
  const root: TrieNode = { children: new Map(), keys: [] }
  for (const key of keys) insertKey(root, key)
  return root
}

function toSuggestion(entry: Entry): DescriptionSuggestion {
  return { label: entry.label, template: entry.template }
}

export function buildDescriptionIndex(transactions: Transaction[]): DescriptionIndex {
  const entries = buildEntries(transactions)
  const root = buildTrie([...entries.keys()])

  const lookup = (key: string): DescriptionSuggestion | undefined => {
    const entry = entries.get(key)
    return entry ? toSuggestion(entry) : undefined
  }

  return {
    resolve(label: string) {
      return lookup(normalizeDescriptionKey(label))
    },
    search(prefix: string, limit = 8) {
      const norm = normalizeDescriptionKey(prefix)
      if (!norm) return []

      let node: TrieNode = root
      for (const ch of norm) {
        const next = node.children.get(ch)
        if (!next) return []
        node = next
      }

      const keys: string[] = []
      collectKeys(node, keys)
      const unique = [...new Set(keys)]
      return unique
        .map((key) => entries.get(key))
        .filter((e): e is Entry => e != null)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
        .slice(0, limit)
        .map(toSuggestion)
    },
  }
}

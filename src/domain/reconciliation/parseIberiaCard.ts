import * as XLSX from 'xlsx'
import type { BankTransaction } from './types'
import { parseBankAmountCents } from './parseAmount'
import { parseBankDate } from './parseDates'

function cellStr(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

function findTxnHeader(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? []
    const c0 = cellStr(row[0]).toUpperCase()
    const c1 = cellStr(row[1]).toUpperCase()
    if (c0 === 'Nº' && c1.includes('FECHA OPERACI')) return i
  }
  return -1
}

function isFeeRow(merchant: string): boolean {
  const m = merchant.toLowerCase()
  return m.includes('emision tarjeta') || m === 'total comisiones'
}

function parseIberiaRow(row: unknown[]): BankTransaction | null {
  const opDate = parseBankDate(cellStr(row[1]))
  const merchant = cellStr(row[2])
  const eurosRaw = cellStr(row[4]) || cellStr(row[3])
  if (!opDate || !merchant || !eurosRaw) return null
  if (isFeeRow(merchant)) return null
  if (merchant.toLowerCase().startsWith('total ')) return null

  const signedCents = parseBankAmountCents(eurosRaw)
  if (signedCents === 0) return null

  return {
    date: opDate,
    amountCents: Math.abs(signedCents),
    description: merchant,
    source: 'iberia',
    kind: 'debit_direct',
  }
}

/** Parse one Iberia Icon monthly statement .xlsx. */
export function parseIberiaStatement(bytes: Uint8Array): BankTransaction[] {
  const wb = XLSX.read(bytes, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0] ?? '']
  if (!sheet) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  const headerIdx = findTxnHeader(rows)
  if (headerIdx < 0) return []

  const out: BankTransaction[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const merchant = cellStr(row[2])
    if (merchant.toLowerCase().startsWith('total ')) break
    const txn = parseIberiaRow(row)
    if (txn) out.push(txn)
  }
  return out
}

import * as XLSX from 'xlsx'
import type { BankRowKind, BankSource, BankTransaction } from './types'
import { parseBankAmountCents } from './parseAmount'
import { parseBankDate } from './parseDates'

const SC_CARD_RE = /tarjeta\s+548901/i
const IBERIA_SETTLEMENT_RE = /recibo\s+iberia\s+cards/i
const SC_SETTLEMENT_RE = /liquidacion\s+de\s+las\s+tarjetas/i
const SKIP_RE =
  /travelperk|nomina|nómina|transferencia\s+inmediata\s+de\s+roy|transferencia\s+a\s+favor\s+de\s+roy|transferencia\s+inmediata\s+a\s+favor\s+de\s+roy|my\s+wise|degiro|index\s+fund/i

function classifyConcept(concept: string): BankRowKind {
  const lower = concept.toLowerCase()
  if (IBERIA_SETTLEMENT_RE.test(lower)) return 'iberia_settlement'
  if (SC_SETTLEMENT_RE.test(lower)) return 'sc_settlement'
  if (SKIP_RE.test(lower)) return 'skip'
  if (SC_CARD_RE.test(lower)) return 'sc_purchase'
  if (lower.includes('compra ') && lower.includes('tarjeta')) return 'sc_purchase'
  return 'debit_direct'
}

function kindToSource(kind: BankRowKind): BankSource | null {
  if (kind === 'debit_direct') return 'debit_direct'
  if (kind === 'sc_purchase') return 'sc_purchase'
  return null
}

function cellStr(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

function findMovimientosHeader(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? []
    const joined = row.map(cellStr).join('|').toUpperCase()
    if (joined.includes('FECHA OPERACI') && joined.includes('CONCEPTO')) return i
  }
  return -1
}

/** Parse Santander cuenta online .xls export into matchable bank transactions. */
export function parseSantanderDebit(bytes: Uint8Array): BankTransaction[] {
  const wb = XLSX.read(bytes, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0] ?? '']
  if (!sheet) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  const headerIdx = findMovimientosHeader(rows)
  if (headerIdx < 0) return []

  const out: BankTransaction[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const opDate = parseBankDate(cellStr(row[0]))
    const concept = cellStr(row[2])
    const amountRaw = cellStr(row[3])
    if (!opDate || !concept || !amountRaw) continue

    const kind = classifyConcept(concept)
    const source = kindToSource(kind)
    if (!source) continue

    const signedCents = parseBankAmountCents(amountRaw)
    if (signedCents === 0) continue

    out.push({
      date: opDate,
      amountCents: Math.abs(signedCents),
      description: concept,
      source,
      kind,
    })
  }
  return out
}

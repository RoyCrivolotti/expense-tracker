import type { MoneyFormat } from './money'
import { formatCents } from './money'
import type { ReceiptFigure } from './expenseReport'

/**
 * Extension for a stored receipt, from the type the server sniffed.
 *
 * Mirrors `extensionFor` in receiptRules.ts, which is Workers-side and cannot be
 * imported here. Both are driven by the same closed `ReceiptContentType` union,
 * so a new type breaks the switch in both places rather than silently producing
 * a file nothing will open.
 */
export function receiptExtension(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'application/pdf') return 'pdf'
  return 'bin'
}

/**
 * Characters that break a filename somewhere that matters.
 *
 * `/` and `\` are path separators, `:` is one on macOS and illegal on Windows,
 * and the rest are reserved by Windows. Collapsed rather than dropped so words
 * do not run together, and trimmed so nothing ends in a space or dot — Windows
 * refuses both.
 */
function safeSegment(text: string): string {
  return text
    .replace(/[/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
}

/**
 * A receipt filename that still means something once it is out of the folder.
 *
 * `R1` first, so the file sorts into the order the report lists it and ties back
 * to the reference printed beside the line. Then the date, what it was, and how
 * much — enough for whoever receives it to check a receipt against a claim line
 * without opening the report at all, which is the point of sending receipts on
 * their own.
 *
 * The description can be empty (the report falls back to the category name for
 * those), so the caller passes whatever it renders rather than re-deriving it.
 */
export function receiptFileName(
  ref: number,
  label: string,
  date: string,
  amountCents: number,
  contentType: string,
  format: MoneyFormat,
): string {
  const parts = [`R${ref}`, date, safeSegment(label), safeSegment(formatCents(amountCents, format))]
  return `${parts.filter(Boolean).join(' - ')}.${receiptExtension(contentType)}`
}

/** Folder and zip name for a claim's receipts. */
export function receiptPackName(flagName: string, from: string): string {
  const name = safeSegment(flagName)
  const period = from ? ` ${from.slice(0, 7)}` : ''
  // The fallback is the whole name, not a substitute flag name — appending
  // " receipts" to it produced "Receipts receipts".
  return name ? `${name}${period} receipts` : `Receipts${period}`
}

/** What the caller needs to name and fetch every receipt in a report. */
export interface NamedReceipt {
  attachmentId: number
  filename: string
}

export function namedReceipts(
  figures: ReceiptFigure[],
  format: MoneyFormat,
  labelFor: (figure: ReceiptFigure) => string,
): NamedReceipt[] {
  return figures.map((figure) => ({
    attachmentId: figure.attachment.id,
    filename: receiptFileName(
      figure.ref,
      labelFor(figure),
      figure.transaction.date,
      figure.transaction.amountCents,
      figure.attachment.contentType,
      format,
    ),
  }))
}

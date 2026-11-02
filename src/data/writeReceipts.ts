import { type WriteReceipt, readWriteReceipt } from '../domain/data/writeReceipt'

type Listener = (receipt: WriteReceipt) => void

const listeners = new Set<Listener>()

/**
 * Told of the receipt of every write the server answered, as it arrives and before the caller has the body. The writes
 * are made by the data source and shown by the screens afterwards, so a ledger held open hears of each write here and
 * then sees its patch. Returns the call that stops it.
 */
export function onWriteReceipt(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Passes on the receipt a response carries, if it is the answer to a write. */
export function noteWriteResponse(headers: Pick<Headers, 'get'>): void {
  const receipt = readWriteReceipt(headers)
  if (receipt !== null) for (const listener of listeners) listener(receipt)
}

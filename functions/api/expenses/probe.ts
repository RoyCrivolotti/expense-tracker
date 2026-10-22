import type { Env, ExpensesData } from '../../_shared/env'

/**
 * Throwaway probe, never merged. It settles what a deployed Worker enforces on this account:
 *   ?mode=separate&n=60  runs n `SELECT 1` as separate calls (fails at the 51st if 50 queries are enforced)
 *   ?mode=batch&n=60     runs n `SELECT 1` in one batch() (shows how a batch counts)
 *   ?mode=cpu&n=100      spends about n million loop iterations of CPU (shows whether 10 ms is enforced)
 * Each answers 200 with what happened, including the error text, so a limit shows up as `ok: false`.
 * It reads no data and writes nothing.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const url = new URL(context.request.url)
  const mode = url.searchParams.get('mode') ?? 'separate'
  const n = Math.min(Number(url.searchParams.get('n') ?? 60), 1000)
  const db = context.env.DB
  let done = 0
  try {
    if (mode === 'batch') {
      await db.batch(Array.from({ length: n }, () => db.prepare('SELECT 1')))
      done = n
    } else if (mode === 'cpu') {
      let x = 0
      for (let i = 0; i < n * 1_000_000; i += 1) x += Math.sqrt(i)
      done = x > 0 ? n : 0
    } else {
      for (let i = 0; i < n; i += 1) {
        await db.prepare('SELECT 1').all()
        done += 1
      }
    }
    return Response.json({ mode, n, ok: true, done })
  } catch (error) {
    return Response.json({ mode, n, ok: false, done, error: String(error) })
  }
}

import type { RecommendationInfo, RecommendationPage } from '../../data/recommendationsApi'

/**
 * What the list hook remembers between reads: how many rows are showing, so a read brings back as many, and which rows
 * were decided while a read was on its way. The server may answer that read before it saw the decision, so the row would
 * come back for a moment; a read keeps nothing decided after it began.
 */
export class ReadBook {
  private clock = 0
  private shown = 0
  private readonly decidedAt = new Map<string, number>()

  /** How many rows are showing. */
  get held(): number {
    return this.shown
  }

  /** Where a read begins. Pass it to `landed` when the read comes back. */
  begin(): number {
    return this.clock
  }

  /** The rows, cursor and count of a read that began at `since`, without any row decided after that. */
  landed(
    read: { rows: RecommendationInfo[]; next: string | null; openCount: number },
    since: number,
  ) {
    const rows = read.rows.filter((r) => (this.decidedAt.get(r.id) ?? 0) <= since)
    this.shown = rows.length
    return { rows, next: read.next, openCount: Math.max(0, read.openCount - (read.rows.length - rows.length)) }
  }

  /** A later page was added. */
  grew(page: RecommendationPage): void {
    this.shown += page.recommendations.length
  }

  /** A row the person decided has been dropped. */
  decided(id: string): void {
    this.decidedAt.set(id, ++this.clock)
    this.shown = Math.max(0, this.shown - 1)
  }
}

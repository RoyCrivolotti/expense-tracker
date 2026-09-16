/**
 * A request the application layer refused because of what it contains.
 *
 * Its own type so the HTTP edge can tell it apart from everything else that throws.
 * Both used to be plain `Error`, which left the edge a choice between calling every
 * failure the client's fault (a D1 outage answered as 400, with the driver's text
 * attached) or calling every failure the server's (a bad date answered as 500). This
 * is the client's fault, and its message is written to be shown.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

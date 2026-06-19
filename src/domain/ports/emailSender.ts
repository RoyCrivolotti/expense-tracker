export interface OutboundEmail {
  to: string[]
  subject: string
  text: string
}

/** Sends transactional email (Cloudflare Email binding). */
export interface EmailSender {
  send(message: OutboundEmail): Promise<void>
}

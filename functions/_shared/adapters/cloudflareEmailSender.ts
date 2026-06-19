import type { EmailSender } from '../../domain/ports/emailSender'

export interface EmailFrom {
  address: string
  name?: string | undefined
}

/** Cloudflare Workers/Pages `send_email` binding adapter. */
export function createCloudflareEmailSender(
  binding: SendEmail,
  from: EmailFrom,
): EmailSender {
  return {
    async send(message) {
      for (const to of message.to) {
        await binding.send({
          to,
          from: { email: from.address, name: from.name ?? from.address },
          subject: message.subject,
          text: message.text,
        })
      }
    },
  }
}

import { describe, expect, it, vi } from 'vitest'
import { createCloudflareEmailSender } from './cloudflareEmailSender'

describe('createCloudflareEmailSender', () => {
  it('sends one message per recipient', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const sender = createCloudflareEmailSender({ send } as unknown as SendEmail, {
      address: 'from@example.com',
      name: 'Alerts',
    })
    await sender.send({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Test',
      text: 'Body',
    })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.com', subject: 'Test' }),
    )
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShareSpikeCard } from './ShareSpikeCard'

describe('ShareSpikeCard (spike)', () => {
  it('runs a variant and prints the canShare result', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['x']), { status: 200 }))))
    const share = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { share, canShare: () => true })
    render(<ShareSpikeCard />)
    await userEvent.click(screen.getByRole('button', { name: /^C:/ }))
    expect(await screen.findByText(/canShare: true, share resolved OK/)).toBeTruthy()
    expect(share).toHaveBeenCalledOnce()
  })
})

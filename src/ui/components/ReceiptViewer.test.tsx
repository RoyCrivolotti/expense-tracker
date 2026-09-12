import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeAttachment } from '../../testing/factories'
import { ReceiptViewer } from './ReceiptViewer'

describe('ReceiptViewer', () => {
  it('shows an image at full size', () => {
    render(<ReceiptViewer attachment={makeAttachment({ id: 7, originalName: 'hotel.jpg' })} onClose={vi.fn()} />)

    expect(screen.getByRole('img', { name: 'hotel.jpg' })).toHaveAttribute(
      'src',
      '/api/expenses/attachments/7',
    )
  })

  it('offers a PDF as a link, and says why it does not render inline', () => {
    // The serve route sends PDFs as attachment on purpose, so an <iframe> here
    // would silently download instead of displaying.
    render(
      <ReceiptViewer
        attachment={makeAttachment({ id: 9, contentType: 'application/pdf', hasThumb: false })}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('link', { name: /Open the PDF/ })).toHaveAttribute(
      'href',
      '/api/expenses/attachments/9',
    )
    expect(screen.getByText(/cannot run scripts in the app/)).toBeInTheDocument()
  })

  it('falls back to a generic title when the file had no name', () => {
    render(<ReceiptViewer attachment={makeAttachment()} onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Receipt' })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeAttachment } from '../../testing/factories'
import { ReceiptStorageSetting } from './ReceiptStorageSetting'

const GB = 1_000_000_000

describe('ReceiptStorageSetting', () => {
  it('stays off the screen entirely until something is stored', () => {
    const { container } = render(<ReceiptStorageSetting attachments={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows what is used against the cap, and how many receipts that is', () => {
    render(
      <ReceiptStorageSetting
        attachments={[
          makeAttachment({ id: 1, byteSize: 184_320 }),
          makeAttachment({ id: 2, byteSize: 215_680 }),
        ]}
      />,
    )
    expect(screen.getByText('400 KB')).toBeInTheDocument()
    expect(screen.getByText(/of 2\.15 GB/)).toBeInTheDocument()
    expect(screen.getByText(/2 receipts stored/)).toBeInTheDocument()
  })

  it('says receipt, not receipts, for exactly one', () => {
    render(<ReceiptStorageSetting attachments={[makeAttachment({ id: 1, byteSize: 900 })]} />)
    expect(screen.getByText(/1 receipt stored/)).toBeInTheDocument()
  })

  it('floors a non-zero fraction at <1% rather than reporting 0%', () => {
    // 400 KB of 2 GB rounds to 0%, which reads as "nothing stored" next to a
    // line saying two receipts are.
    render(<ReceiptStorageSetting attachments={[makeAttachment({ id: 1, byteSize: 400_000 })]} />)
    expect(screen.getByText('<1%')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('warns on the bar and the pill together, never one without the other', () => {
    // The pill turning amber while the bar stayed green is the same
    // disagreement-between-signals the budget bar had; one threshold table now
    // feeds both.
    const { container } = render(
      <ReceiptStorageSetting attachments={[makeAttachment({ id: 1, byteSize: 1_960_000_000 })]} />,
    )
    expect(screen.getByText('91%')).toBeInTheDocument()
    const fill = container.querySelector('[style*="width"]')
    expect(fill?.className).toMatch(/warning/)
    expect(fill?.className).not.toMatch(/neutral/)
  })

  it('reports a full store as 100%', () => {
    render(<ReceiptStorageSetting attachments={[makeAttachment({ id: 1, byteSize: 3 * GB })]} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})

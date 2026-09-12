import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseActions } from '../actions'
import { makeAttachment } from '../../testing/factories'
import { stageReceipts, type PendingReceipt } from '../../data/pendingReceipts'
import { ReceiptStrip } from './ReceiptStrip'

function renderStrip(
  attachments = [makeAttachment()],
  overrides: Partial<ExpenseActions> = {},
) {
  const actions = {
    uploadAttachment: vi.fn().mockResolvedValue(undefined),
    deleteAttachment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ExpenseActions
  const onTrapPausedChange = vi.fn()
  const view = render(
    <ReceiptStrip
      transactionId={1}
      attachments={attachments}
      actions={actions}
      onTrapPausedChange={onTrapPausedChange}
    />,
  )
  const fileInput = view.container.querySelector('input[type=file]') as HTMLInputElement
  return { actions, onTrapPausedChange, fileInput }
}

function file(name = 'hotel.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

describe('ReceiptStrip', () => {
  it('shows a thumbnail per receipt, served from the thumb variant', () => {
    renderStrip([makeAttachment({ id: 7, originalName: 'hotel.jpg' })])

    const thumb = screen.getByRole('button', { name: 'View hotel.jpg' })
    expect(thumb.querySelector('img')).toHaveAttribute(
      'src',
      '/api/expenses/attachments/7?variant=thumb',
    )
  })

  it('marks a PDF rather than trying to show a preview it does not have', () => {
    renderStrip([makeAttachment({ contentType: 'application/pdf', hasThumb: false })])

    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('uploads a chosen file', async () => {
    const uploadAttachment = vi.fn().mockResolvedValue(undefined)
    const { fileInput } = renderStrip([], { uploadAttachment })

    await userEvent.upload(fileInput, file())

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledWith(1, expect.any(File)))
  })

  it('uploads several files one at a time, so the server can enforce its caps', async () => {
    // Parallel uploads would race past the per-transaction cap and the quota,
    // both of which the server checks per request.
    const order: string[] = []
    const uploadAttachment = vi.fn(async (_id: number, f: File) => {
      order.push(`start:${f.name}`)
      await Promise.resolve()
      order.push(`end:${f.name}`)
    })
    const { fileInput } = renderStrip([], { uploadAttachment })

    await userEvent.upload(fileInput, [
      file('a.jpg'),
      file('b.jpg'),
    ])

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(2))
    expect(order).toEqual(['start:a.jpg', 'end:a.jpg', 'start:b.jpg', 'end:b.jpg'])
  })

  it('surfaces a rejection from the server instead of failing silently', async () => {
    const uploadAttachment = vi.fn().mockRejectedValue(new Error('Receipts must be 5 MB or smaller'))
    const { fileInput } = renderStrip([], { uploadAttachment })

    await userEvent.upload(fileInput, file())

    expect(await screen.findByText('Receipts must be 5 MB or smaller')).toBeInTheDocument()
  })

  it('confirms before removing, and says the transaction is untouched', async () => {
    const deleteAttachment = vi.fn().mockResolvedValue(undefined)
    renderStrip([makeAttachment({ id: 7, originalName: 'hotel.jpg' })], { deleteAttachment })

    await userEvent.click(screen.getByRole('button', { name: 'Remove hotel.jpg' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(/transaction itself is unchanged/)

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(deleteAttachment).toHaveBeenCalledWith(7))
  })

  it('pauses the enclosing modal trap while the viewer is open', async () => {
    const { onTrapPausedChange } = renderStrip([makeAttachment({ id: 7, originalName: 'a.jpg' })])

    await userEvent.click(screen.getByRole('button', { name: 'View a.jpg' }))

    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)
  })

  it('offers the camera and only the types the server accepts', () => {
    // Listing concrete types keeps HEIC out of the iOS picker; being rejected
    // after choosing is worse than not being offered it.
    const { fileInput: input } = renderStrip([])

    expect(input).toHaveAttribute('capture', 'environment')
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp,application/pdf')
  })

  it('surfaces a failed removal instead of leaving the thumbnail there silently', async () => {
    const deleteAttachment = vi.fn().mockRejectedValue(new Error('Receipt storage is not configured'))
    renderStrip([makeAttachment({ id: 7, originalName: 'a.jpg' })], { deleteAttachment })

    await userEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('Receipt storage is not configured')).toBeInTheDocument()
  })

  it('keeps the receipt when the removal is cancelled', async () => {
    const deleteAttachment = vi.fn()
    const { onTrapPausedChange } = renderStrip([makeAttachment({ id: 7, originalName: 'a.jpg' })], {
      deleteAttachment,
    })

    await userEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(deleteAttachment).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(false)
  })

  it('opens the file picker from the add button', async () => {
    const { fileInput } = renderStrip([])
    const click = vi.spyOn(fileInput, 'click').mockImplementation(() => {})

    await userEvent.click(screen.getByRole('button', { name: /Add receipt/ }))

    expect(click).toHaveBeenCalled()
  })

  it('shows the viewer for a receipt, and closes it', async () => {
    const { onTrapPausedChange } = renderStrip([makeAttachment({ id: 7, originalName: 'a.jpg' })])

    await userEvent.click(screen.getByRole('button', { name: 'View a.jpg' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(onTrapPausedChange).toHaveBeenLastCalledWith(false)
  })
})

describe('ReceiptStrip — before the transaction exists', () => {
  /** The add-form shape: no id yet, staged files owned by the enclosing form. */
  function renderPending(initial: PendingReceipt[] = []) {
    const actions = {
      uploadAttachment: vi.fn().mockResolvedValue(undefined),
      deleteAttachment: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExpenseActions
    const onPendingChange = vi.fn()
    const view = render(
      <ReceiptStrip
        attachments={[]}
        actions={actions}
        pendingFiles={initial}
        onPendingChange={onPendingChange}
      />,
    )
    const fileInput = view.container.querySelector('input[type=file]') as HTMLInputElement
    return { actions, onPendingChange, fileInput, view }
  }

  it('stages a chosen file instead of uploading it', async () => {
    const { actions, onPendingChange, fileInput } = renderPending()

    await userEvent.upload(fileInput, file('flight.jpg'))

    expect(actions.uploadAttachment).not.toHaveBeenCalled()
    expect(onPendingChange).toHaveBeenCalledTimes(1)
    const staged = onPendingChange.mock.calls[0]![0] as PendingReceipt[]
    expect(staged.map((s) => s.file.name)).toEqual(['flight.jpg'])
  })

  it('says the staged files go up on save', () => {
    renderPending(stageReceipts([file('flight.jpg')]))

    expect(screen.getByText('Uploaded when you save.')).toBeInTheDocument()
  })

  it('removes a staged file by its own identity, not its name', async () => {
    // Two camera shots are both image.jpg; removing by name would be ambiguous.
    const staged = stageReceipts([file('image.jpg'), file('image.jpg')])
    const { onPendingChange } = renderPending(staged)

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove image.jpg' })[0]!)

    const left = onPendingChange.mock.calls[0]![0] as PendingReceipt[]
    expect(left).toHaveLength(1)
    expect(left[0]).toBe(staged[1])
  })

  it('stops accepting files at the per-transaction cap', () => {
    const staged = stageReceipts([file('a.jpg'), file('b.jpg'), file('c.jpg'), file('d.jpg')])
    renderPending(staged)

    expect(screen.getByRole('button', { name: /4 of 4/ })).toBeDisabled()
  })

  it('counts stored and staged receipts together against the cap', () => {
    const actions = { uploadAttachment: vi.fn(), deleteAttachment: vi.fn() } as unknown as ExpenseActions
    render(
      <ReceiptStrip
        transactionId={1}
        attachments={[makeAttachment({ id: 1 }), makeAttachment({ id: 2 })]}
        actions={actions}
        pendingFiles={stageReceipts([file('c.jpg'), file('d.jpg')])}
        onPendingChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /4 of 4/ })).toBeDisabled()
  })

  it('takes only what fits when more files are chosen than there is room for', async () => {
    // Three already staged, one slot left, two picked: keep one and say why,
    // rather than uploading both and letting the server reject the second.
    const staged = stageReceipts([file('a.jpg'), file('b.jpg'), file('c.jpg')])
    const { onPendingChange, fileInput } = renderPending(staged)

    await userEvent.upload(fileInput, [file('d.jpg'), file('e.jpg')])

    const left = onPendingChange.mock.calls[0]![0] as PendingReceipt[]
    expect(left.map((s) => s.file.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])
    expect(screen.getByRole('alert')).toHaveTextContent('A transaction can hold 4 receipts')
  })

  it('announces an upload failure through an alert, not a toast', async () => {
    const actions = {
      uploadAttachment: vi.fn().mockRejectedValue(new Error('Receipt storage is full')),
      deleteAttachment: vi.fn(),
    } as unknown as ExpenseActions
    const view = render(
      <ReceiptStrip transactionId={1} attachments={[]} actions={actions} />,
    )
    const fileInput = view.container.querySelector('input[type=file]') as HTMLInputElement

    await userEvent.upload(fileInput, file('flight.jpg'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Receipt storage is full'),
    )
  })
})

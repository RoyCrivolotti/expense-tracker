import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as statusApi from '../../data/captureStatusApi'
import { CaptureDiagnosticsSetting } from './CaptureDiagnosticsSetting'

vi.mock('../../data/captureStatusApi')
afterEach(() => vi.resetAllMocks())

const none = { received: 0, recommended: 0, grouped: 0, unread: 0, addedAsIs: 0, edited: 0, linked: 0, dismissed: 0, open: 0, muted: 0 }
const source = (name: string, diagnostics: statusApi.SourceDiagnostics): statusApi.SourceStatus => ({
  source: name,
  lastCaptureAt: null,
  received: 0,
  unrecognised: 0,
  diagnostics,
})
const answer = (sources: statusApi.SourceStatus[]) =>
  vi.mocked(statusApi.fetchCaptureStatus).mockResolvedValue({ sources, endpoint: null, shortcutUrl: null })

describe('the capture diagnostics card', () => {
  it('shows every count and the three rates for each source', async () => {
    answer([
      source('newbank', { received: 14, recommended: 11, grouped: 2, unread: 3, addedAsIs: 5, edited: 2, linked: 1, dismissed: 1, open: 2, muted: 1 }),
      source('otherbank', { ...none, received: 2, recommended: 2, open: 2 }),
    ])
    render(<CaptureDiagnosticsSetting />)

    const [first, second] = await screen.findAllByRole('listitem')
    const card = within(first as HTMLElement)
    expect(card.getByRole('heading', { name: 'newbank' })).toBeInTheDocument()
    const counts = card.getAllByRole('term').map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`)
    expect(counts).toEqual([
      'Received: 14',
      'Suggested: 11',
      'Same payment as another: 2',
      'Not read: 3',
      'Added as shown: 5',
      'Edited, then added: 2',
      'Linked: 1',
      'Dismissed: 1',
      'Waiting: 2',
      'Muted wordings: 1',
    ])
    expect(first).toHaveTextContent('Of 9 decided: 56% added as shown, 22% edited, 11% dismissed.')
    expect(second).toHaveTextContent('Nothing decided yet.')
  })

  it('says nothing has arrived when no source was counted', async () => {
    answer([])
    render(<CaptureDiagnosticsSetting />)

    expect(await screen.findByText('Nothing has reached the app yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('says why when it cannot read', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockRejectedValue(new Error('Request failed (500)'))
    render(<CaptureDiagnosticsSetting />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (500)')
  })
})

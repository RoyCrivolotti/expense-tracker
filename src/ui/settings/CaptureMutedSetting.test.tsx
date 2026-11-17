import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../data/captureTemplatesApi'
import { CaptureMutedSetting } from './CaptureMutedSetting'

vi.mock('../../data/captureTemplatesApi')
afterEach(() => vi.resetAllMocks())

const muted = (over: Partial<api.MutedWording> = {}): api.MutedWording => ({
  templateId: '0b6f1c1e-2d1b-4c55-9a0e-7d7e2f9b1a10',
  source: 'newbank',
  skeleton: 'special offer save <N> <C> on <M> today',
  seen: 5,
  dismissals: 3,
  ignoredAt: '2026-11-10T12:00:00.000Z',
  ...over,
})

describe('the muted pushes card', () => {
  it('says nothing is muted, and how a wording gets here', async () => {
    vi.mocked(api.fetchMutedWordings).mockResolvedValue([])
    render(<CaptureMutedSetting />)

    expect(await screen.findByText(/Nothing is muted\. A wording you dismiss three times in a row stops being suggested/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows each muted wording by its masked words, its source, how it was used and when it was muted', async () => {
    vi.mocked(api.fetchMutedWordings).mockResolvedValue([muted(), muted({ templateId: 'other', source: 'otherbank', skeleton: 'code <CODE>', seen: 1, dismissals: 1 })])
    render(<CaptureMutedSetting />)

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const first = within(rows[0] as HTMLElement)
    expect(first.getByText('number')).toBeInTheDocument()
    expect(first.getByText('currency')).toBeInTheDocument()
    expect(first.getByText('merchant')).toBeInTheDocument()
    expect(rows[0]).toHaveTextContent(/special offer save\s*number\s*currency\s*on\s*merchant\s*today/)
    expect(rows[0]).toHaveTextContent(/newbank · seen 5 times, dismissed 3 times · muted 10 Nov/)
    expect(rows[1]).toHaveTextContent(/otherbank · seen once, dismissed once/)
    expect(first.getByRole('button')).toHaveAccessibleName('Suggest again the newbank wording: special offer save number currency on merchant today')
    expect(within(rows[1] as HTMLElement).getByRole('button')).toHaveAccessibleName('Suggest again the otherbank wording: code code')
  })

  it('un-mutes a wording and reads the list again', async () => {
    vi.mocked(api.fetchMutedWordings).mockResolvedValueOnce([muted()]).mockResolvedValueOnce([])
    vi.mocked(api.unmuteWording).mockResolvedValue(undefined)
    render(<CaptureMutedSetting />)

    fireEvent.click(await screen.findByRole('button', { name: /^Suggest again the newbank wording/ }))

    expect(api.unmuteWording).toHaveBeenCalledWith('0b6f1c1e-2d1b-4c55-9a0e-7d7e2f9b1a10')
    expect(await screen.findByText(/Nothing is muted/)).toBeInTheDocument()
  })

  it('says why when it cannot un-mute, and keeps the wording', async () => {
    vi.mocked(api.fetchMutedWordings).mockResolvedValue([muted()])
    vi.mocked(api.unmuteWording).mockRejectedValue(new Error('Request failed (500)'))
    render(<CaptureMutedSetting />)

    fireEvent.click(await screen.findByRole('button', { name: /^Suggest again the newbank wording/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (500)')
    await waitFor(() => expect(screen.getByRole('button', { name: /^Suggest again the newbank wording/ })).toBeEnabled())
    expect(api.fetchMutedWordings).toHaveBeenCalledTimes(1)
  })

  it('says why when it cannot read the list', async () => {
    vi.mocked(api.fetchMutedWordings).mockRejectedValue(new Error('Request failed (503)'))
    render(<CaptureMutedSetting />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (503)')
  })
})

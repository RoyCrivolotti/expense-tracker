import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeDataset } from '../../testing/factories'
import { ClaimantSetting } from './ClaimantSetting'

function renderSetting(claimantName = '') {
  const onChange = vi.fn().mockResolvedValue(undefined)
  const settings = { ...makeDataset().settings, claimantName }
  const view = render(<ClaimantSetting settings={settings} onChange={onChange} />)
  return { onChange, settings, view }
}

describe('ClaimantSetting', () => {
  it('saves once on blur, not once per keystroke', async () => {
    const { onChange } = renderSetting()

    await userEvent.type(screen.getByLabelText('Claimant name'), 'Alex Moreno')

    // Bound straight to server state this issued eleven PUTs, each replacing the
    // whole settings object — so an out-of-order response snapped the field back
    // mid-word and moved the caret to the end.
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.tab()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ claimantName: 'Alex Moreno' })
  })

  it('does not save when the name is unchanged', async () => {
    const { onChange } = renderSetting('Alex Moreno')

    await userEvent.click(screen.getByLabelText('Claimant name'))
    await userEvent.tab()

    expect(onChange).not.toHaveBeenCalled()
  })

  it('trims surrounding whitespace before saving', async () => {
    const { onChange } = renderSetting()

    await userEvent.type(screen.getByLabelText('Claimant name'), '  Alex  ')
    await userEvent.tab()

    expect(onChange).toHaveBeenCalledWith({ claimantName: 'Alex' })
  })

  it('caps the length of a string that is printed on a document', () => {
    renderSetting()

    expect(screen.getByLabelText('Claimant name')).toHaveAttribute('maxLength', '80')
  })

  it('picks up a name changed elsewhere', () => {
    const { view } = renderSetting('Alex Moreno')
    const settings = { ...makeDataset().settings, claimantName: 'Sam Rivera' }

    view.rerender(<ClaimantSetting settings={settings} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Claimant name')).toHaveValue('Sam Rivera')
  })
})

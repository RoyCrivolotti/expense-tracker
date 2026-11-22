import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GUIDE_TITLE } from '../../guide/guideTitle'
import { setMotionDisabledForTests } from '../hooks/motion'
import { GuideHost } from './GuideHost'
import { useGuide } from './guideContext'

// The sheet's file cannot be fetched: a dropped connection, or a deploy that replaced it under an open page.
vi.mock('./GuideSheet', () => {
  throw new Error('chunk gone')
})

beforeEach(() => setMotionDisabledForTests(true))
afterEach(cleanup)

function Opener() {
  const guide = useGuide()
  return <button onClick={() => guide?.open()}>open</button>
}

describe('the guide when its file cannot be loaded', () => {
  it('says so, in a sheet that closes, instead of doing nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <GuideHost>
        <Opener />
      </GuideHost>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'open' }))

    const dialog = await screen.findByRole('dialog', { name: GUIDE_TITLE })
    expect(within(dialog).getByText(/The guide could not be loaded/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

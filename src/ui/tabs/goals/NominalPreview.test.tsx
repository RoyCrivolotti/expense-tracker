import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NominalPreview } from './NominalPreview'

const props = { saved: 0.02, preview: null, onPreview: vi.fn(), onOpenAssumptions: undefined }

describe('NominalPreview', () => {
  it('says which euros stay put in the Nominal view: the net worth and the FI target are the plan\'s, the milestones are the account\'s', () => {
    render(<NominalPreview {...props} planStartDate="2026-01-01" />)
    expect(
      screen.getByText(/The net worth figure stays in 2026 euros\. Milestones are amounts on your account, so they stay put in this view, and the FI target is in 2026 euros, so it rises with the inflation\./),
    ).toBeInTheDocument()
  })

  it('names today\'s euros for a plan with no start date', () => {
    render(<NominalPreview {...props} planStartDate={null} />)
    expect(screen.getByText(/The net worth figure stays in today's euros\./)).toBeInTheDocument()
  })
})

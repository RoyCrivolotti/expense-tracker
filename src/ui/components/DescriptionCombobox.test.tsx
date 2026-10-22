import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DescriptionIndex, DescriptionSuggestion } from '../../data/descriptionIndex'
import { DescriptionCombobox } from './DescriptionCombobox'

const suggestion = (label: string): DescriptionSuggestion => ({ label, template: { type: 'expense', categoryId: 1, accountId: 2 } })

function indexOf(own: DescriptionSuggestion[], extra?: DescriptionIndex['useSuggestions']): DescriptionIndex {
  return { search: vi.fn(() => own), resolve: () => undefined, ...(extra ? { useSuggestions: extra } : {}) }
}

describe('DescriptionCombobox', () => {
  it('lists what the index finds among its own rows', () => {
    const search = vi.fn(() => [suggestion('Café Central')])
    const index: DescriptionIndex = { search, resolve: () => undefined }
    render(<DescriptionCombobox value="caf" index={index} onChange={vi.fn()} onAccept={vi.fn()} />)
    fireEvent.focus(screen.getByRole('combobox'))
    expect(screen.getByText('Café Central')).toBeInTheDocument()
    expect(search).toHaveBeenCalledWith('caf')
  })

  it('lists nothing for a blank box', () => {
    const index = indexOf([suggestion('Café Central')])
    render(<DescriptionCombobox value="  " index={index} onChange={vi.fn()} onAccept={vi.fn()} />)
    fireEvent.focus(screen.getByRole('combobox'))
    expect(screen.queryByText('Café Central')).toBeNull()
  })

  it('lists what an index with more to say gives, which is how a window adds the server’s matches', () => {
    const useSuggestions = vi.fn((_index: DescriptionIndex, value: string) => [suggestion(`${value} from an older month`)])
    const index = indexOf([suggestion('Its own')], useSuggestions)
    const onAccept = vi.fn()
    render(<DescriptionCombobox value="caf" index={index} onChange={vi.fn()} onAccept={onAccept} />)
    fireEvent.focus(screen.getByRole('combobox'))
    expect(screen.queryByText('Its own')).toBeNull()
    fireEvent.click(screen.getByText('caf from an older month'))
    expect(onAccept).toHaveBeenCalledWith(suggestion('caf from an older month'))
  })
})

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

  describe('while older matches arrive and move what is listed', () => {
    const before = ['Cafe Central', 'Car wash']
    const merged = ['Cabin rental', 'Cafe Central', 'Candy store', 'Car wash']

    /** A box whose list a test can change, as the server's matches change a window's. */
    function changing() {
      let labels = before
      const index = indexOf([], () => labels.map(suggestion))
      const onAccept = vi.fn()
      // A new element each time, or React finds nothing to render again.
      const ui = () => <DescriptionCombobox value="ca" index={index} onChange={vi.fn()} onAccept={onAccept} />
      const shown = render(ui())
      fireEvent.focus(screen.getByRole('combobox'))
      return {
        onAccept,
        merge: () => {
          labels = merged
          shown.rerender(ui())
        },
      }
    }

    it('keeps the highlight on the suggestion that was chosen, so Enter accepts that one', () => {
      const { onAccept, merge } = changing()
      const box = screen.getByRole('combobox')
      fireEvent.keyDown(box, { key: 'ArrowDown' })
      fireEvent.keyDown(box, { key: 'ArrowDown' })
      expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Car wash')

      merge()

      expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Car wash')
      fireEvent.keyDown(box, { key: 'Enter' })
      expect(onAccept).toHaveBeenCalledWith(suggestion('Car wash'))
    })

    it('highlights nothing when the suggestion that was highlighted is gone, and Enter then accepts none', () => {
      let labels = before
      const index = indexOf([], () => labels.map(suggestion))
      const onAccept = vi.fn()
      const ui = () => <DescriptionCombobox value="ca" index={index} onChange={vi.fn()} onAccept={onAccept} />
      const shown = render(ui())
      const box = screen.getByRole('combobox')
      fireEvent.focus(box)
      fireEvent.keyDown(box, { key: 'ArrowDown' })

      labels = ['Cabin rental']
      shown.rerender(ui())
      fireEvent.keyDown(box, { key: 'Enter' })

      expect(screen.queryByRole('option', { selected: true })).toBeNull()
      expect(onAccept).not.toHaveBeenCalled()
    })

    it('accepts the row that was pressed when the click lands on another that moved into its place', () => {
      const { onAccept, merge } = changing()
      fireEvent.pointerDown(screen.getByRole('option', { name: 'Car wash' }))

      merge()
      fireEvent.click(screen.getAllByRole('option')[1]!)

      expect(onAccept).toHaveBeenCalledWith(suggestion('Car wash'))
    })

    it('accepts the row that was clicked when the press was long ago, since that click is another', () => {
      const { onAccept, merge } = changing()
      const at = (type: string, timeStamp: number) => {
        const event = new MouseEvent(type, { bubbles: true })
        Object.defineProperty(event, 'timeStamp', { value: timeStamp })
        return event
      }
      fireEvent(screen.getByRole('option', { name: 'Car wash' }), at('pointerdown', 1000))
      merge()

      fireEvent(screen.getByRole('option', { name: 'Candy store' }), at('click', 3000))

      expect(onAccept).toHaveBeenCalledWith(suggestion('Candy store'))
    })

    it('accepts the row that was clicked when nothing was pressed, as a click from assistive technology is', () => {
      const { onAccept, merge } = changing()
      merge()

      fireEvent.click(screen.getByRole('option', { name: 'Candy store' }))

      expect(onAccept).toHaveBeenCalledWith(suggestion('Candy store'))
    })
  })
})

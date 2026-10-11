import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRadioGroupKeys } from './useRadioGroupKeys'

function Group({ onSelect = () => {} }: { onSelect?: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(0)
  const { stop, onKeyDown } = useRadioGroupKeys({
    groupRef: ref,
    count: 3,
    selected,
    onSelect: (i) => {
      setSelected(i)
      onSelect(i)
    },
  })
  return (
    <div ref={ref} role="radiogroup" aria-label="Views" onKeyDown={onKeyDown}>
      {['One', 'Two', 'Three'].map((name, i) => (
        <button key={name} type="button" role="radio" aria-checked={selected === i} tabIndex={i === stop ? 0 : -1}>
          {name}
        </button>
      ))}
    </div>
  )
}

describe('useRadioGroupKeys', () => {
  afterEach(() => Reflect.deleteProperty(Element.prototype, 'scrollIntoView'))

  it('moves the selection and the focus with the arrow keys and Home and End, wrapping at the ends', () => {
    render(<Group />)
    const one = screen.getByRole('radio', { name: 'One' })
    one.focus()
    fireEvent.keyDown(one, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'Two' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Two' }), { key: 'End' })
    expect(screen.getByRole('radio', { name: 'Three' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Three' }), { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'One' })).toHaveFocus()
  })

  it('brings the option it moves to into view, since focusing one that is only partly in a scrolling row leaves it where it was', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<Group />)
    const one = screen.getByRole('radio', { name: 'One' })
    one.focus()
    fireEvent.keyDown(one, { key: 'ArrowRight' })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('radio', { name: 'Two' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest' })
  })

  it('still works where an element cannot scroll itself into view', () => {
    render(<Group />)
    const one = screen.getByRole('radio', { name: 'One' })
    one.focus()
    expect(() => fireEvent.keyDown(one, { key: 'ArrowRight' })).not.toThrow()
  })
})

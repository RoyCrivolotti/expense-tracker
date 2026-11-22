import { describe, expect, it } from 'vitest'
import { readPushSlots } from './slots'
import { MAX_SIBLING_RUN, WILDCARD, shapeId, siblingSlot, skeletonOf, tokenise, withWildcard } from './shape'

const skeleton = (
  title: string,
  body: string,
) => skeletonOf(title, body, readPushSlots(title, body))

describe('tokenise', () => {
  it('splits on whitespace and keeps punctuation on its token', () => {
    expect(tokenise('Compra de 12,34 EUR, en  EXAMPLE.')).toEqual(['Compra', 'de', '12,34', 'EUR,', 'en', 'EXAMPLE.'])
  })
  it('cleans hidden characters first, and gives nothing for an empty text', () => {
    expect(tokenise('a‮b \n c')).toEqual(['ab', 'c'])
    expect(tokenise('  ')).toEqual([])
  })
})

describe('skeletonOf', () => {
  it('replaces each slot with its placeholder and folds the rest', () => {
    expect(
      skeleton(
        'Compra Realizada',
        'Has hecho una compra de 12,34 EUR en EXAMPLE SHOP con tu tarjeta Example Card terminada *0000',
      ),
    ).toBe('compra realizada has hecho una compra de <N> <C> en example shop con tu tarjeta example card terminada <D>')
  })

  it('is the same for two pushes of one template with other amounts, cards, dates and currencies', () => {
    const a = skeleton('Pago', 'Payment of $1,234.56 at EXAMPLE on 20/11/2026 card **1111 ref 481516')
    const b = skeleton('Pago', 'Payment of 9.99 EUR at EXAMPLE on 2026-01-02 card *2222 ref 123456')
    expect(a).toBe('pago payment of <C> <N> at example on <DATE> card <D> ref <CODE>')
    expect(b).toBe('pago payment of <N> <C> at example on <DATE> card <D> ref <CODE>')
    expect(skeleton('Pago', 'Payment of 9.99 USD at EXAMPLE on 2026-01-02 card *2222 ref 123456')).toBe(b)
  })

  it('writes a glued marker as a spaced one, on either side', () => {
    expect(skeleton('', 'de 50,00EUR en')).toBe('de <N> <C> en')
    expect(skeleton('', 'de 50,00 EUR en')).toBe('de <N> <C> en')
    expect(skeleton('', 'de 12€ en')).toBe('de <N> <C> en')
    expect(skeleton('', 'de €12 en')).toBe('de <C> <N> en')
    expect(skeleton('', 'de EUR 12 en')).toBe('de <C> <N> en')
  })

  it('gives one skeleton to pushes that differ only in a time, a reference or a percentage', () => {
    const at = (
      time: string,
      ref: string,
      rate: string,
    ) => skeleton('Aviso', `A las ${time} cobro #${ref} (${rate}) ref${ref}`)
    expect(at('09:41', '12345', '10%')).toBe('aviso a las <X> cobro <X> <X> <X>')
    expect(at('09:42', '777', '12,5%')).toBe(at('09:41', '12345', '10%'))
    expect(skeleton('', 'tarjeta **123456')).toBe('tarjeta <X>')
  })

  it('ignores case and accents, and drops tokens that fold to nothing', () => {
    expect(skeleton('CONFIRMÁ', 'tú comprá ́')).toBe(skeleton('confirma', 'tú compra'))
  })

  it('makes a title and body of nothing into an empty skeleton', () => {
    expect(skeleton('', '')).toBe('')
  })

  it('keeps the direction cue apart: a minus on its own is a token of the shape', () => {
    expect(skeleton('', 'Cargo - 5,00 EUR')).toBe('cargo - <N> <C>')
  })
})

describe('shapeId', () => {
  it('is a SHA-256 hex digest, stable for the same source and skeleton', async () => {
    const id = await shapeId('example', 'compra de <N> <C>')
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(await shapeId('example', 'compra de <N> <C>')).toBe(id)
  })

  it('differs by source and by skeleton', async () => {
    const id = await shapeId('example', 'compra')
    expect(await shapeId('other', 'compra')).not.toBe(id)
    expect(await shapeId('example', 'compras')).not.toBe(id)
  })

  it('keeps the two parts apart whatever characters they hold', async () => {
    expect(await shapeId('ab', 'c')).not.toBe(await shapeId('a', 'bc'))
    expect(await shapeId('a\nb', 'c')).not.toBe(await shapeId('a', 'b\nc'))
    expect(await shapeId('a|1:b', 'c')).not.toBe(await shapeId('a', 'b|1:c'))
  })
})

describe('siblingSlot', () => {
  const purchase = (
    merchant: string,
    extra = 'con tu tarjeta <D>',
  ) => `compra de <N> <C> en ${merchant} ${extra}`.split(' ')
  const words = (text: string) => text.split(' ')

  it('returns the one run where two purchase bodies differ in the merchant', () => {
    const run = { start: 5, end: 6 }
    expect(siblingSlot(purchase('example'), purchase('otro'))).toEqual({ a: run, b: run })
  })

  it('pairs merchants of the same word count', () => {
    const run = { start: 5, end: 7 }
    expect(siblingSlot(purchase('example shop'), purchase('tienda ejemplo'))).toEqual({ a: run, b: run })
  })

  it('pairs merchants of different word counts, each side with its own run', () => {
    expect(siblingSlot(purchase('example shop'), purchase('otra tienda de ejemplo'))).toEqual({
      a: { start: 5, end: 7 },
      b: { start: 5, end: 9 },
    })
    expect(siblingSlot(purchase('example'), purchase('a b c d'))).toEqual({
      a: { start: 5, end: 6 },
      b: { start: 5, end: 9 },
    })
  })

  it('pairs a push with a merchant and one without', () => {
    const without = words('compra de <N> <C> en con tu tarjeta <D>')
    expect(siblingSlot(purchase('example shop'), without)).toEqual({ a: { start: 5, end: 7 }, b: { start: 5, end: 5 } })
    expect(siblingSlot(without, purchase('example'))).toEqual({ a: { start: 5, end: 5 }, b: { start: 5, end: 6 } })
  })

  it('takes a shared word between two changed places as part of one run', () => {
    expect(siblingSlot(words('a b c x d y e f g'), words('a b c m d n e f g'))).toEqual({
      a: { start: 3, end: 6 },
      b: { start: 3, end: 6 },
    })
  })

  it('does not let the end overlap the start', () => {
    const base = words('a b c d')
    expect(siblingSlot([...base, 'x'], [...base, 'x', 'x'])).toEqual({
      a: { start: 5, end: 5 },
      b: { start: 5, end: 6 },
    })
    expect(siblingSlot([...base, 'x', 'x'], [...base, 'x'])).toEqual({
      a: { start: 5, end: 6 },
      b: { start: 5, end: 5 },
    })
  })

  it('is null for equal skeletons and for nothing', () => {
    expect(siblingSlot(purchase('example'), purchase('example'))).toBeNull()
    expect(siblingSlot([], [])).toBeNull()
  })

  it('is null for two texts that share only a few words', () => {
    const one = words('compra de <N> <C> en example con tu tarjeta <D>')
    const other = words('tu saldo ha cambiado hoy y ahora es otro distinto de <D>')
    expect(siblingSlot(one, other)).toBeNull()
    expect(siblingSlot(words('a b c d'), words('x y c z'))).toBeNull()
  })

  it('is null when the shared start and end cover less than half of the shorter text, and pairs at exactly half', () => {
    expect(siblingSlot(words('a b c d e f'), words('a b c x y z'))).toEqual({
      a: { start: 3, end: 6 },
      b: { start: 3, end: 6 },
    })
    expect(siblingSlot(words('a b c d e f g'), words('a b c x y z w'))).toBeNull()
  })

  it('needs three shared words that are not placeholders', () => {
    expect(siblingSlot(words('saldo <N> <C>'), words('pago <N> <C>'))).toBeNull()
    expect(siblingSlot(words('hello john'), words('hello mary'))).toBeNull()
    expect(
      siblingSlot(words('<N> <C> <D> <X> <DATE> <CODE> <M> a b x'), words('<N> <C> <D> <X> <DATE> <CODE> <M> a b y')),
    ).toBeNull()
    expect(siblingSlot(words('<N> a b c <C> x'), words('<N> a b c <C> y'))).toEqual({
      a: { start: 5, end: 6 },
      b: { start: 5, end: 6 },
    })
    expect(siblingSlot(words('<N> a b <C> x'), words('<N> a b <C> y'))).toBeNull()
  })

  it('is null when a varying run is longer than eight tokens', () => {
    const long = Array.from({ length: MAX_SIBLING_RUN }, (_, i) => `w${i}`)
    const head = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    expect(siblingSlot([...head, 'x', ...head], [...head, ...long, ...head])).toEqual({
      a: { start: 10, end: 11 },
      b: { start: 10, end: 18 },
    })
    expect(siblingSlot([...head, 'x', ...head], [...head, ...long, 'y', ...head])).toBeNull()
  })

  it('finds a run at either end', () => {
    expect(siblingSlot(words('x b c d'), words('y b c d'))).toEqual({
      a: { start: 0, end: 1 },
      b: { start: 0, end: 1 },
    })
    expect(siblingSlot(words('a b c x'), words('a b c y'))).toEqual({
      a: { start: 3, end: 4 },
      b: { start: 3, end: 4 },
    })
  })
})

describe('withWildcard', () => {
  it('replaces the run with one wildcard and leaves the input alone', () => {
    const tokens = ['en', 'example', 'shop', 'con']
    expect(withWildcard(tokens, { start: 1, end: 3 })).toEqual(['en', WILDCARD, 'con'])
    expect(tokens).toEqual(['en', 'example', 'shop', 'con'])
  })

  it('makes two siblings the same template', () => {
    const a = skeleton('', 'Compra de 1,00 EUR en EXAMPLE con tu tarjeta *0000').split(' ')
    const b = skeleton('', 'Compra de 2,00 EUR en OTRA TIENDA DE EJEMPLO con tu tarjeta *0000').split(' ')
    const runs = siblingSlot(a, b)
    expect(runs).not.toBeNull()
    expect(withWildcard(a, runs!.a)).toEqual(withWildcard(b, runs!.b))
  })
})

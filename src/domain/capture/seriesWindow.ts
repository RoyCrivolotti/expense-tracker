/**
 * How many days from a series' usual day a push, or a row logged under another name, may be and still be its charge.
 * Charges land a few days either side of their day (a bill due on a weekend, a card that books late), and five days
 * took every exact-amount charge of a real year's monthly series without pointing at a wrong one. Wider lets an
 * ordinary payment of the same price in. A module of its own so the recurring card, which loads with the app, can
 * read it without the match.
 */
export const SERIES_MATCH_DAYS = 5

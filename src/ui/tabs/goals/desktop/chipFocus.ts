/** Marks a scenario's chip, so focus can be put back on the open one from elsewhere on the page. */
export const CHIP_ATTRIBUTE = 'data-scenario-chip'

/** The open scenario's chip, which keeps focus when a button that had it goes. */
export const OPEN_CHIP_SELECTOR = `[${CHIP_ATTRIBUTE}][aria-selected="true"]`

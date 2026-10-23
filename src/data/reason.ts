/** The words to show or log for whatever a promise rejected with. */
export const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

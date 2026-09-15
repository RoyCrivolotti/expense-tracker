/**
 * Stands in for `virtual:pwa-register/react`, which only exists while VitePWA is running.
 *
 * The test config does not load that plugin, so without this alias the import is
 * unresolvable — which is why PwaUpdatePrompt.tsx could not be transformed, and why the
 * V8 coverage provider fell back to parsing it off disk, guessed the wrong language for a
 * .tsx file, and dropped it from both coverage gates with only a warning.
 */
export function useRegisterSW(): {
  needRefresh: [boolean, (value: boolean) => void]
  offlineReady: [boolean, (value: boolean) => void]
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
} {
  return {
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  }
}

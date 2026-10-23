import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { docsCaptureMocks } from './vite.docsCapture'
import { NAVIGATION_DENYLIST, isShellNavigation } from './scripts/pwaNavigation'

function resolveBuildId(): string {
  const sha = process.env.GITHUB_SHA ?? process.env.CF_PAGES_COMMIT_SHA
  if (sha) return sha.slice(0, 7)
  return 'local'
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_DOCS_CAPTURE': JSON.stringify(process.env.DOCS_CAPTURE === '1'),
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(resolveBuildId()),
  },
  plugins: [
    react(),
    docsCaptureMocks(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use the hand-written manifest in public/ rather than generating one.
      manifest: false,
      injectRegister: 'auto',
      workbox: {
        // Shell assets only — not index.html. Auth-gated app must hit the network
        // on launch so Cloudflare Access can set cookies in the PWA context (iOS
        // does not share Safari's session with the installed app).
        globPatterns: ['**/*.{js,css,svg,png,ico,webmanifest,woff2}'],
        // `/index.html` is not in the precache above, so the route this adds throws when the worker is
        // evaluated and the `app-shell` route after it is never registered. Both keep the API and Access
        // prefixes out of what they answer, for the day they are registered.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: NAVIGATION_DENYLIST,
        runtimeCaching: [
          {
            urlPattern: isShellNavigation,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@domain': path.resolve(import.meta.dirname, 'src/domain'),
      '@config': path.resolve(import.meta.dirname, 'config'),
    },
    dedupe: ['react', 'react-dom'],
  },
})

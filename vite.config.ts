import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { docsCaptureMocks } from './vite.docsCapture'

export default defineConfig({
  define: {
    'import.meta.env.VITE_DOCS_CAPTURE': JSON.stringify(process.env.DOCS_CAPTURE === '1'),
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        // SPA: serve the cached shell for client-routed navigations...
        navigateFallback: '/index.html',
        // ...but never for the D1-backed API (those must hit the network).
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Financial data is never written to Cache Storage. Offline = clean
            // network error, not stale balances on a shared device.
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
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

import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { docsCaptureMocks } from './vite.docsCapture'

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
      // The worker is written in src/sw/sw.ts; the plugin bundles it as one classic script at /sw.js, the URL every
      // installed copy of the app already has registered, and fills in the precache manifest.
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'], rollupFormat: 'iife' },
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

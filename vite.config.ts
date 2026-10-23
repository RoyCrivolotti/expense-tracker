import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { docsCaptureMocks } from './vite.docsCapture'
import { workboxOptions } from './scripts/pwaWorkbox'

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
      workbox: workboxOptions,
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

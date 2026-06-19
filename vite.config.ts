import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { docsCaptureMocks } from './vite.docsCapture'

export default defineConfig({
  define: {
    'import.meta.env.VITE_DOCS_CAPTURE': JSON.stringify(process.env.DOCS_CAPTURE === '1'),
  },
  plugins: [react(), docsCaptureMocks()],
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

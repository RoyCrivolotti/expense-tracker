#!/usr/bin/env node
/**
 * Rasterise public/icons/app-icon.svg into PNGs for iOS / PWA install.
 * Requires: npm install sharp (devDependency).
 */
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const svgPath = path.join(root, 'public/icons/app-icon.svg')
const svg = await readFile(svgPath)

const outputs = [
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icons/icon-192.png', size: 192 },
  { file: 'public/icons/icon-512.png', size: 512 },
]

for (const { file, size } of outputs) {
  const out = path.join(root, file)
  await mkdir(path.dirname(out), { recursive: true })
  await sharp(svg).resize(size, size).png().toFile(out)
  console.log(`generate-icons: ${file} (${size}px)`)
}

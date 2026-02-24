import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const distDir = path.resolve(process.cwd(), 'dist')
const indexPath = path.join(distDir, 'index.html')
const fallback404Path = path.join(distDir, '404.html')
const fallback200Path = path.join(distDir, '200.html')

if (!existsSync(indexPath)) {
  console.error('[postbuild-spa-fallback] dist/index.html not found')
  process.exit(1)
}

copyFileSync(indexPath, fallback404Path)
copyFileSync(indexPath, fallback200Path)
console.log('[postbuild-spa-fallback] Wrote dist/404.html and dist/200.html')
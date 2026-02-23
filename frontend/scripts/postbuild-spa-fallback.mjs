import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const distDir = path.resolve(process.cwd(), 'dist')
const indexPath = path.join(distDir, 'index.html')
const fallback404Path = path.join(distDir, '404.html')
const fallback200Path = path.join(distDir, '200.html')
const routeFallbacks = [
  'auth/index.html',
  'auth/callback/index.html',
  'orcid/callback/index.html',
  'profile/index.html',
  'profile/integrations/index.html',
  'profile/publications/index.html',
  'impact/index.html',
  'settings/index.html',
  'workspaces/index.html',
]

if (!existsSync(indexPath)) {
  console.error('[postbuild-spa-fallback] dist/index.html not found')
  process.exit(1)
}

copyFileSync(indexPath, fallback404Path)
copyFileSync(indexPath, fallback200Path)
for (const relativeRoutePath of routeFallbacks) {
  const outputPath = path.join(distDir, relativeRoutePath)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  copyFileSync(indexPath, outputPath)
}
console.log(
  `[postbuild-spa-fallback] Wrote dist/404.html, dist/200.html, and ${routeFallbacks.length} route fallbacks`,
)

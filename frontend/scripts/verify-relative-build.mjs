import { readFile } from 'node:fs/promises'

const indexHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const rootLocalAsset = /(?:src|href)="\/(?:assets\/|favicon\.svg|config\.js)/

if (rootLocalAsset.test(indexHtml)) {
  throw new Error('Electron build must not contain root-absolute local asset URLs.')
}

if (!indexHtml.includes('href="./favicon.svg"') || !indexHtml.includes('src="./config.js"')) {
  throw new Error('Electron build must keep public favicon and runtime config paths build-relative.')
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import { App } from '@/app/App'
import '@/styles/index.css'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Renderer root element is missing')
}

createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

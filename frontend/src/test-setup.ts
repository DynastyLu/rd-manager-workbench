import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

configure({ defaultHidden: true })

// jsdom does not implement ResizeObserver — provide a no-op stub
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

HTMLElement.prototype.scrollIntoView ??= () => undefined

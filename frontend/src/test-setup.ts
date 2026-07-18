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

// Semi Design loads lottie-web from its package entry. Lottie creates a 1×1
// canvas during module evaluation; jsdom returns null unless a canvas backend
// is installed. The workspace tests only need the initialization surface.
HTMLCanvasElement.prototype.getContext = (() => ({
  fillStyle: '',
  fillRect: () => undefined,
})) as typeof HTMLCanvasElement.prototype.getContext

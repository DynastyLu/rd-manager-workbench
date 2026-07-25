import '@douyinfe/semi-ui/lib/es/react19-adapter'
import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

configure({ defaultHidden: true, asyncUtilTimeout: 15_000 })

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
const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function getContext(
  contextId: string,
  ...args: unknown[]
) {
  if (contextId === '2d') {
    return { fillStyle: '', fillRect: () => undefined } as CanvasRenderingContext2D
  }
  return originalCanvasGetContext.call(this, contextId as '2d', ...args)
} as typeof HTMLCanvasElement.prototype.getContext

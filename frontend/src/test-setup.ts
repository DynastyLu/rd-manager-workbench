import '@douyinfe/semi-ui/lib/es/react19-adapter'
import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'
import { afterEach } from 'vitest'

configure({ defaultHidden: true, asyncUtilTimeout: 30_000 })

// jsdom does not implement ResizeObserver — provide a no-op stub
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

HTMLElement.prototype.scrollIntoView ??= () => undefined

afterEach(() => {
  // Semi renders popovers and toasts outside the React test container. Remove
  // any portal left by an animated close so it cannot be mistaken for the
  // active control in the following test.
  document
    .querySelectorAll('.semi-popover-wrapper, .semi-toast-wrapper')
    .forEach((element) => element.remove())
  document.body.style.removeProperty('overflow')
  document.body.style.removeProperty('width')
  document.body.removeAttribute('data-position')
})

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

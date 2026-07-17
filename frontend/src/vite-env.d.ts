/// <reference types="vite/client" />

/** Injected by vite.config.ts → define.__APP_VERSION__ */
declare const __APP_VERSION__: string

declare module '*.less' {
  const content: Record<string, string>
  export default content
}

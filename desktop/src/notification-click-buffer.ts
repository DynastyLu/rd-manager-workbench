export type NotificationClickHandler = (sourcePath: string) => void

export class NotificationClickBuffer {
  private pendingSourcePaths: string[] = []
  private handler: NotificationClickHandler | null = null

  push(sourcePath: string) {
    if (this.handler) {
      this.handler(sourcePath)
      return
    }
    this.pendingSourcePaths.push(sourcePath)
  }

  subscribe(handler: NotificationClickHandler) {
    this.handler = handler
    for (const sourcePath of this.pendingSourcePaths.splice(0)) handler(sourcePath)

    return () => {
      if (this.handler === handler) this.handler = null
    }
  }
}

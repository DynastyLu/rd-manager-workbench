export interface DockMotionResult {
  size: number
  displacement: number
}

export interface DockMetrics {
  baseSize: number
  maxSize: number
  itemSlot: number
  influenceRadius: number
}

export const REGULAR_DOCK_METRICS: DockMetrics = {
  baseSize: 46,
  maxSize: 76,
  itemSlot: 56,
  influenceRadius: 138,
}

export const COMPACT_DOCK_METRICS: DockMetrics = {
  baseSize: 40,
  maxSize: 62,
  itemSlot: 48,
  influenceRadius: 120,
}

export function getDockMetrics(viewportHeight: number): DockMetrics {
  return viewportHeight < 720 ? COMPACT_DOCK_METRICS : REGULAR_DOCK_METRICS
}

export function mapDockDistance(
  distance: number,
  reduceMotion: boolean,
  metrics: DockMetrics = REGULAR_DOCK_METRICS,
): DockMotionResult {
  if (reduceMotion) return { size: metrics.baseSize, displacement: 0 }

  const ratio = Math.max(0, 1 - Math.abs(distance) / metrics.influenceRadius)
  if (ratio === 0) return { size: metrics.baseSize, displacement: 0 }

  const eased = ratio * ratio * (3 - 2 * ratio)
  return {
    size:
      Math.round((metrics.baseSize + (metrics.maxSize - metrics.baseSize) * eased) * 100) /
      100,
    displacement: Math.round(-Math.sign(distance) * 8 * eased * 100) / 100,
  }
}

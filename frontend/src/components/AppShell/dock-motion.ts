export interface DockMotionResult {
  size: number
  outwardX: number
  spreadY: number
  influence: number
}

export interface DockMetrics {
  baseSize: number
  maxSize: number
  itemSlot: number
  influenceRadius: number
  outwardBoost: number
  maxSpread: number
}

export const REGULAR_DOCK_METRICS: DockMetrics = {
  baseSize: 46,
  maxSize: 92,
  itemSlot: 56,
  influenceRadius: 168,
  outwardBoost: 12,
  maxSpread: 46,
}

export const COMPACT_DOCK_METRICS: DockMetrics = {
  baseSize: 40,
  maxSize: 78,
  itemSlot: 48,
  influenceRadius: 144,
  outwardBoost: 10,
  maxSpread: 38,
}

export function getDockMetrics(viewportHeight: number): DockMetrics {
  return viewportHeight < 720 ? COMPACT_DOCK_METRICS : REGULAR_DOCK_METRICS
}

export function mapDockDistance(
  distance: number,
  reduceMotion: boolean,
  metrics: DockMetrics = REGULAR_DOCK_METRICS,
): DockMotionResult {
  const staticResult: DockMotionResult = {
    size: metrics.baseSize,
    outwardX: 0,
    spreadY: 0,
    influence: 0,
  }

  if (reduceMotion || !Number.isFinite(distance)) return staticResult

  const normalized = Math.min(Math.abs(distance) / metrics.influenceRadius, 1)
  const influence = normalized < 1 ? Math.cos((normalized * Math.PI) / 2) ** 2 : 0
  const size = metrics.baseSize + (metrics.maxSize - metrics.baseSize) * influence
  const outwardX = (size - metrics.baseSize) / 2 + metrics.outwardBoost * influence
  const spreadY =
    distance === 0
      ? 0
      : Math.sign(distance) * metrics.maxSpread * Math.sin((normalized * Math.PI) / 2)

  return {
    size: Math.round(size * 100) / 100,
    outwardX: Math.round(outwardX * 100) / 100,
    spreadY: Math.round(spreadY * 100) / 100,
    influence: Math.round(influence * 100) / 100,
  }
}

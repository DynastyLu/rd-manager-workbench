import { describe, expect, it } from 'vitest'
import { getDockMetrics, mapDockDistance } from '../dock-motion'

describe('dock motion model', () => {
  it('forms a right-facing fisheye arc across three item slots', () => {
    const center = mapDockDistance(0, false)
    const firstBelow = mapDockDistance(56, false)
    const secondBelow = mapDockDistance(112, false)
    const edgeBelow = mapDockDistance(168, false)

    expect(center.size).toBe(92)
    expect(center.outwardX).toBeGreaterThan(firstBelow.outwardX)
    expect(firstBelow.outwardX).toBeGreaterThan(secondBelow.outwardX)
    expect(secondBelow.outwardX).toBeGreaterThan(edgeBelow.outwardX)
    expect(edgeBelow.outwardX).toBe(0)
    expect(center.influence).toBe(1)
    expect(edgeBelow.influence).toBe(0)
  })

  it('spreads neighbours away from the pointer instead of pulling them inward', () => {
    expect(mapDockDistance(-56, false).spreadY).toBeLessThan(0)
    expect(mapDockDistance(56, false).spreadY).toBeGreaterThan(0)
    expect(mapDockDistance(112, false).spreadY).toBeGreaterThan(
      mapDockDistance(56, false).spreadY,
    )
  })

  it('keeps far icons at base size while preserving cumulative expansion', () => {
    expect(mapDockDistance(220, false)).toEqual({
      size: 46,
      outwardX: 0,
      spreadY: 46,
      influence: 0,
    })
  })

  it('uses compact dimensions for short viewports', () => {
    expect(getDockMetrics(600)).toMatchObject({
      baseSize: 40,
      maxSize: 78,
      itemSlot: 48,
      influenceRadius: 144,
      outwardBoost: 10,
      maxSpread: 38,
    })
    expect(getDockMetrics(800)).toMatchObject({
      baseSize: 46,
      maxSize: 92,
      itemSlot: 56,
      influenceRadius: 168,
      outwardBoost: 12,
      maxSpread: 46,
    })
  })

  it('returns static dimensions when motion is reduced', () => {
    expect(mapDockDistance(0, true)).toEqual({
      size: 46,
      outwardX: 0,
      spreadY: 0,
      influence: 0,
    })
  })

  it('returns static dimensions when the pointer leaves the Dock', () => {
    expect(mapDockDistance(Number.POSITIVE_INFINITY, false)).toEqual({
      size: 46,
      outwardX: 0,
      spreadY: 0,
      influence: 0,
    })
  })
})

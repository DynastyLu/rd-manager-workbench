import { describe, expect, it } from 'vitest'
import { getDockMetrics, mapDockDistance } from '../dock-motion'

describe('dock motion model', () => {
  it('continuously decays from the hovered icon across two neighbours', () => {
    const values = [0, 46, 92, 138].map((distance) => mapDockDistance(distance, false))

    expect(values[0]?.size).toBe(76)
    expect(values[0]!.size).toBeGreaterThan(values[1]!.size)
    expect(values[1]!.size).toBeGreaterThan(values[2]!.size)
    expect(values[2]!.size).toBeGreaterThan(values[3]!.size)
    expect(values[3]).toEqual({ size: 46, displacement: 0 })
  })

  it('mirrors displacement above and below the pointer', () => {
    expect(mapDockDistance(-46, false).displacement).toBeGreaterThan(0)
    expect(mapDockDistance(46, false).displacement).toBeLessThan(0)
  })

  it('uses compact dimensions for short viewports', () => {
    expect(getDockMetrics(600)).toMatchObject({ baseSize: 40, itemSlot: 48 })
    expect(getDockMetrics(800)).toMatchObject({ baseSize: 46, itemSlot: 56 })
  })

  it('returns static dimensions when motion is reduced', () => {
    expect(mapDockDistance(0, true)).toEqual({ size: 46, displacement: 0 })
  })
})

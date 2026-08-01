import { motion, useReducedMotion, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useId, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { NavigationItem } from '@/router/routes'
import { getDockMetrics, mapDockDistance } from './dock-motion'
import { WorkspaceDockIcon } from './WorkspaceDockIcon'

interface DockItemProps {
  item: NavigationItem
  active: boolean
  mouseY: MotionValue<number>
}

function getViewportHeight(): number {
  return typeof window === 'undefined' ? 800 : window.innerHeight
}

export function DockItem({ item, active, mouseY }: DockItemProps) {
  const slotRef = useRef<HTMLDivElement>(null)
  const tooltipId = `dock-tooltip-${useId().replace(/:/g, '')}`
  const reduceMotion = useReducedMotion() ?? false
  const [metrics, setMetrics] = useState(() => getDockMetrics(getViewportHeight()))

  useEffect(() => {
    const handleResize = () => setMetrics(getDockMetrics(getViewportHeight()))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const distance = useTransform(mouseY, (pointerY) => {
    const rect = slotRef.current?.getBoundingClientRect()
    if (!rect || !Number.isFinite(pointerY)) return Number.POSITIVE_INFINITY
    return pointerY - (rect.top + rect.height / 2)
  })
  const sizeTarget = useTransform(
    distance,
    (value) => mapDockDistance(value, reduceMotion, metrics).size
  )
  const displacementTarget = useTransform(
    distance,
    (value) => mapDockDistance(value, reduceMotion, metrics).displacement
  )
  const size = useSpring(sizeTarget, { mass: 0.12, stiffness: 180, damping: 16 })
  const y = useSpring(displacementTarget, { mass: 0.12, stiffness: 180, damping: 16 })

  return (
    <motion.div
      ref={slotRef}
      className="workspace-dock__slot"
      style={{ height: metrics.itemSlot, y }}
    >
      <NavLink
        to={item.path}
        className={`workspace-dock__item${active ? ' workspace-dock__item--active' : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-label={item.title}
        aria-describedby={tooltipId}
      >
        <motion.span
          className="workspace-dock__tile"
          aria-hidden="true"
          tabIndex={-1}
          style={{ width: size, height: size }}
          animate={active && !reduceMotion ? { scale: [1, 1.045, 1] } : { scale: 1 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          whileTap={reduceMotion ? undefined : { scale: 0.94 }}
        >
          <span className="workspace-dock__icon">
            <WorkspaceDockIcon icon={item.icon} />
          </span>
        </motion.span>
        <span id={tooltipId} role="tooltip" className="workspace-dock__label">
          {item.title}
        </span>
        {active && <span className="workspace-dock__dot" aria-hidden="true" />}
      </NavLink>
    </motion.div>
  )
}

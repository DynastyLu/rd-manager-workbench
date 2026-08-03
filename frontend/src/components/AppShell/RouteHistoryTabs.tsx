import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { motion } from 'framer-motion'
import { selectVisibleHistoryKeys, type RouteHistoryEntry } from './routeHistory'
import type { RouteHistoryController } from './useRouteHistory'

interface RouteHistoryTabsProps {
  controller: RouteHistoryController
  /** Deterministic width for tests; production reads the container with ResizeObserver. */
  availableWidth?: number
}

interface ContextMenuState {
  key: string
  x: number
  y: number
}

function focusRelativeTab(
  entries: RouteHistoryEntry[],
  key: string,
  direction: -1 | 1,
  open: RouteHistoryController['open'],
) {
  const index = entries.findIndex((entry) => entry.key === key)
  if (index < 0) return
  const target = entries[(index + direction + entries.length) % entries.length]
  if (target) open(target.key)
}

export function RouteHistoryTabs({ controller, availableWidth }: RouteHistoryTabsProps) {
  const { entries, activeKey, open, close, closeOthers } = controller
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const [containerWidth, setContainerWidth] = useState(Number.POSITIVE_INFINITY)
  const [measuredWidths, setMeasuredWidths] = useState<Map<string, number>>(new Map())
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  useLayoutEffect(() => {
    if (availableWidth !== undefined) return undefined

    const root = rootRef.current
    if (!root) return undefined
    const updateWidth = () => setContainerWidth(root.clientWidth)
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(updateWidth)
    observer.observe(root)
    return () => observer.disconnect()
  }, [availableWidth])

  const effectiveContainerWidth = availableWidth ?? containerWidth

  useLayoutEffect(() => {
    setMeasuredWidths((current) => {
      const next = new Map(current)
      let changed = false
      for (const [key, element] of itemRefs.current) {
        const width = Math.ceil(element.getBoundingClientRect().width)
        if (width > 0 && next.get(key) !== width) {
          next.set(key, width)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [entries, effectiveContainerWidth])

  useEffect(() => {
    if (!overflowOpen && !contextMenu) return undefined
    const dismiss = () => {
      setOverflowOpen(false)
      setContextMenu(null)
    }
    const dismissOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('click', dismiss)
    window.addEventListener('keydown', dismissOnEscape)
    return () => {
      window.removeEventListener('click', dismiss)
      window.removeEventListener('keydown', dismissOnEscape)
    }
  }, [contextMenu, overflowOpen])

  const visibleKeys = useMemo(
    () => selectVisibleHistoryKeys(entries, activeKey, effectiveContainerWidth, measuredWidths),
    [activeKey, effectiveContainerWidth, entries, measuredWidths],
  )
  const visibleEntries = entries.filter((entry) => visibleKeys.has(entry.key))
  const hiddenEntries = entries.filter((entry) => !visibleKeys.has(entry.key))

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, entry: RouteHistoryEntry) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusRelativeTab(entries, entry.key, event.key === 'ArrowLeft' ? -1 : 1, open)
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && !entry.pinned) {
      event.preventDefault()
      close(entry.key)
    }
  }

  function showContextMenu(event: MouseEvent, entry: RouteHistoryEntry) {
    event.preventDefault()
    setContextMenu({ key: entry.key, x: event.clientX, y: event.clientY })
  }

  return (
    <div ref={rootRef} className="route-history" aria-label="历史访问页面">
      <div className="route-history__tabs" role="tablist" aria-label="历史路由">
        {visibleEntries.map((entry) => {
          const active = entry.key === activeKey
          return (
            <div
              ref={(element) => {
                if (element) itemRefs.current.set(entry.key, element)
                else itemRefs.current.delete(entry.key)
              }}
              key={entry.key}
              className={`route-history__item${active ? ' is-active' : ''}`}
              onContextMenu={(event) => showContextMenu(event, entry)}
            >
              {active ? (
                <motion.span
                  layoutId="route-history-active"
                  className="route-history__active-indicator"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                />
              ) : null}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className="route-history__tab"
                title={entry.title}
                onClick={() => open(entry.key)}
                onKeyDown={(event) => handleTabKeyDown(event, entry)}
              >
                <span className="route-history__title">{entry.title}</span>
              </button>
              {!entry.pinned ? (
                <button
                  type="button"
                  className="route-history__close"
                  aria-label={`关闭${entry.title}`}
                  title={`关闭${entry.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    close(entry.key)
                  }}
                >
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
            </div>
          )
        })}

        {hiddenEntries.length ? (
          <div className="route-history__overflow">
            <button
              type="button"
              className="route-history__more"
              aria-label="更多历史页面"
              aria-expanded={overflowOpen}
              onClick={(event) => {
                event.stopPropagation()
                setOverflowOpen((openState) => !openState)
              }}
            >
              <span aria-hidden="true">•••</span>
              <span className="route-history__more-count">{hiddenEntries.length}</span>
            </button>
            {overflowOpen ? (
              <div className="route-history__menu" role="menu" tabIndex={-1}>
                {hiddenEntries.map((entry) => (
                  <div key={entry.key} className="route-history__menu-row">
                    <button
                      type="button"
                      role="menuitem"
                      className="route-history__menu-open"
                      onClick={() => {
                        setOverflowOpen(false)
                        open(entry.key)
                      }}
                    >
                      <span>{entry.title}</span>
                    </button>
                    <button
                      type="button"
                      className="route-history__menu-close"
                      aria-label={`关闭${entry.title}`}
                      onClick={() => close(entry.key)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {contextMenu ? (
        <div
          className="route-history__context-menu"
          role="menu"
          tabIndex={-1}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {entries.find((entry) => entry.key === contextMenu.key)?.pinned ? null : (
            <button type="button" role="menuitem" onClick={() => close(contextMenu.key)}>
              关闭当前页
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => closeOthers(contextMenu.key)}>
            关闭其他页
          </button>
        </div>
      ) : null}
    </div>
  )
}

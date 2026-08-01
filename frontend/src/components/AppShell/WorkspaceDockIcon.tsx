import { useId, type ReactNode } from 'react'
import type { NavigationIcon } from '@/router/routes'

interface WorkspaceDockIconProps {
  icon: NavigationIcon
}

interface DockIconPalette {
  start: string
  end: string
  glow: string
}

const palettes: Record<NavigationIcon, DockIconPalette> = {
  home: { start: '#66A6FF', end: '#3157D8', glow: '#B8D7FF' },
  tasks: { start: '#9B82FF', end: '#5A3FC7', glow: '#D8CDFF' },
  projects: { start: '#3ED6B2', end: '#07866F', glow: '#B6F4E5' },
  employees: { start: '#FFB45E', end: '#E46B2D', glow: '#FFE0B7' },
  docs: { start: '#55B7FF', end: '#2860D8', glow: '#C3E4FF' },
  base: { start: '#C678FF', end: '#7041C9', glow: '#E8C8FF' },
  calendar: { start: '#FF7588', end: '#D63B58', glow: '#FFC9D1' },
  search: { start: '#63D2FF', end: '#2879D7', glow: '#CBEEFF' },
  settings: { start: '#98A4B7', end: '#535D70', glow: '#DDE3EC' },
}

function renderGlyph(icon: NavigationIcon): ReactNode {
  switch (icon) {
    case 'home':
      return (
        <>
          <path d="M17 29.5 32 17l15 12.5" />
          <path d="M21 27.5V47h22V27.5M28 47V35h8v12" />
        </>
      )
    case 'tasks':
      return (
        <>
          <path d="m17 20 3 3 5-6M17 32l3 3 5-6M17 44l3 3 5-6" />
          <path d="M30 21h18M30 33h18M30 45h13" />
        </>
      )
    case 'projects':
      return (
        <>
          <path d="M14.5 23h14l4.5 5h16.5v19h-35z" />
          <path d="M14.5 28H33M24 36h16" />
        </>
      )
    case 'employees':
      return (
        <>
          <circle cx="26" cy="26" r="7" />
          <circle cx="42" cy="29" r="5" />
          <path d="M14 48c1.8-9.5 21.8-9.5 23.5 0M37 45.5c1.4-6.4 12.2-6.4 13.5 0" />
        </>
      )
    case 'docs':
      return (
        <>
          <path d="M14.5 18.5c8-2.8 13.3-.2 17.5 4.3v26c-4.2-4.2-9.5-6.5-17.5-3.7z" />
          <path d="M49.5 18.5c-8-2.8-13.3-.2-17.5 4.3v26c4.2-4.2 9.5-6.5 17.5-3.7z" />
          <path d="M20 27h7M37 27h7M20 33h7M37 33h7" />
        </>
      )
    case 'base':
      return (
        <>
          <rect x="14.5" y="14.5" width="15" height="15" rx="3.5" />
          <rect x="34.5" y="14.5" width="15" height="15" rx="3.5" />
          <rect x="14.5" y="34.5" width="15" height="15" rx="3.5" />
          <rect x="34.5" y="34.5" width="15" height="15" rx="3.5" />
          <path d="M22 19v6M42 19v6M19 42h6M39 42h6" />
        </>
      )
    case 'calendar':
      return (
        <>
          <rect x="14.5" y="18" width="35" height="31.5" rx="5" />
          <path d="M14.5 28h35M23 14.5v8M41 14.5v8" />
          <circle cx="25" cy="37" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="33" cy="37" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="41" cy="37" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="25" cy="44" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="33" cy="44" r="1.5" fill="currentColor" stroke="none" />
        </>
      )
    case 'search':
      return (
        <>
          <circle cx="28.5" cy="28.5" r="13" />
          <path d="m38.5 38.5 11 11" />
          <path d="M22 25c2-3.8 6.5-5.4 10.5-3.6" opacity=".72" />
        </>
      )
    case 'settings':
      return (
        <>
          <circle cx="32" cy="32" r="8" />
          <path d="M32 14v6M32 44v6M14 32h6M44 32h6M19.3 19.3l4.3 4.3M40.4 40.4l4.3 4.3M44.7 19.3l-4.3 4.3M23.6 40.4l-4.3 4.3" />
        </>
      )
  }
}

export function WorkspaceDockIcon({ icon }: WorkspaceDockIconProps) {
  const uniqueId = useId().replace(/:/g, '')
  const gradientId = `dock-gradient-${icon}-${uniqueId}`
  const highlightId = `dock-highlight-${icon}-${uniqueId}`
  const palette = palettes[icon]

  return (
    <svg
      className="workspace-dock-icon"
      data-dock-icon={icon}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="9" y1="5" x2="55" y2="59">
          <stop stopColor={palette.start} />
          <stop offset="1" stopColor={palette.end} />
        </linearGradient>
        <linearGradient id={highlightId} x1="32" y1="4" x2="32" y2="36">
          <stop stopColor="#fff" stopOpacity=".4" />
          <stop offset="1" stopColor={palette.glow} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${gradientId})`} />
      <rect x="3" y="3" width="58" height="31" rx="15" fill={`url(#${highlightId})`} />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="15.25"
        fill="none"
        stroke="#fff"
        strokeOpacity=".32"
        strokeWidth="1.5"
      />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {renderGlyph(icon)}
      </g>
    </svg>
  )
}

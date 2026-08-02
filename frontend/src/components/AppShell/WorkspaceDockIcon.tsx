import { useId, type ReactNode } from 'react'
import type { NavigationIcon } from '@/router/routes'

interface WorkspaceDockIconProps {
  icon: NavigationIcon
}

function renderArtwork(icon: NavigationIcon, id: string): ReactNode {
  switch (icon) {
    case 'home':
      return (
        <>
          <defs>
            <linearGradient id={`${id}-surface`} x1="9" y1="5" x2="57" y2="60">
              <stop stopColor="#65A8FF" />
              <stop offset="1" stopColor="#2854D9" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-surface)`} />
          <path d="M12 27.5 32 11l20 16.5v24A4.5 4.5 0 0 1 47.5 56h-31a4.5 4.5 0 0 1-4.5-4.5z" fill="#fff" />
          <rect x="18" y="31" width="12" height="9" rx="3" fill="#56C8FF" />
          <rect x="34" y="31" width="12" height="9" rx="3" fill="#FF7798" />
          <rect x="24" y="44" width="16" height="12" rx="4" fill="#DDE8FF" />
        </>
      )
    case 'tasks':
      return (
        <>
          <defs>
            <linearGradient id={`${id}-paper`} x1="11" y1="3" x2="54" y2="61">
              <stop stopColor="#FEFEFF" />
              <stop offset="1" stopColor="#DDE6FA" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-paper)`} />
          <rect x="14" y="12" width="36" height="43" rx="8" fill="#4D6FEA" />
          <rect x="21" y="8" width="22" height="10" rx="5" fill="#2F46A9" />
          <circle cx="22" cy="28" r="5" fill="#57D6A1" />
          <path d="m19.5 28 2 2 3.5-4" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <circle cx="22" cy="42" r="5" fill="#FFB14D" />
          <path d="m19.5 42 2 2 3.5-4" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d="M31 27h12M31 31h8M31 41h12M31 45h7" stroke="#fff" strokeLinecap="round" strokeWidth="2.6" />
        </>
      )
    case 'projects':
      return (
        <>
          <defs>
            <linearGradient id={`${id}-sky`} x1="8" y1="3" x2="55" y2="62">
              <stop stopColor="#DFF6FF" />
              <stop offset="1" stopColor="#6FC6FF" />
            </linearGradient>
            <linearGradient id={`${id}-folder`} x1="13" y1="23" x2="52" y2="55">
              <stop stopColor="#3C9CFF" />
              <stop offset="1" stopColor="#1762DF" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-sky)`} />
          <path d="M10 20a5 5 0 0 1 5-5h13l5 6h16a5 5 0 0 1 5 5v23a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="#FFCF4F" />
          <path d="M10 29h44v20a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill={`url(#${id}-folder)`} />
          <path d="M16 35h32" stroke="#86C7FF" strokeLinecap="round" strokeWidth="3" />
          <rect x="23" y="40" width="18" height="9" rx="4.5" fill="#fff" opacity=".92" />
        </>
      )
    case 'employees':
      return (
        <>
          <defs>
            <linearGradient id={`${id}-people`} x1="8" y1="5" x2="56" y2="60">
              <stop stopColor="#43E29B" />
              <stop offset="1" stopColor="#0A9A74" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-people)`} />
          <circle cx="25" cy="25" r="9" fill="#fff" />
          <circle cx="43" cy="28" r="7" fill="#D9FFF0" />
          <path d="M10 51c1.7-12 27.8-12 30 0v5H10z" fill="#fff" />
          <path d="M35 51c1.2-8.3 17.5-8.3 19 0v5H35z" fill="#D9FFF0" />
          <circle cx="47" cy="15" r="7" fill="#4F73F5" />
          <path d="M43.5 15h7M47 11.5v7" stroke="#fff" strokeLinecap="round" strokeWidth="2" />
        </>
      )
    case 'docs':
      return (
        <>
          <defs>
            <linearGradient id={`${id}-book`} x1="7" y1="3" x2="57" y2="61">
              <stop stopColor="#6CCBFF" />
              <stop offset="1" stopColor="#315AE3" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-book)`} />
          <path d="M10 16c9-3 16-.7 22 5.5V54c-6-5.2-13-7-22-4z" fill="#fff" />
          <path d="M54 16c-9-3-16-.7-22 5.5V54c6-5.2 13-7 22-4z" fill="#EAF3FF" />
          <path d="M18 24h9M18 30h9M18 36h7M37 24h9M37 30h9M37 36h7" stroke="#6F8CD8" strokeLinecap="round" strokeWidth="2.2" />
          <path d="M43 14v12l-4-3-4 3V17" fill="#FFCA47" />
        </>
      )
    case 'base':
      return (
        <>
          <defs>
            <linearGradient id={`${id}-grid`} x1="8" y1="4" x2="57" y2="61">
              <stop stopColor="#5DE2D5" />
              <stop offset="1" stopColor="#0C8EAD" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-grid)`} />
          <rect x="11" y="12" width="42" height="40" rx="8" fill="#fff" opacity=".96" />
          <path d="M11 23h42M24 23v29M39 23v29M11 37h42" stroke="#B9DAE6" strokeWidth="2" />
          <rect x="14" y="15" width="36" height="6" rx="3" fill="#246CD6" />
          <rect x="27" y="26" width="9" height="8" rx="2" fill="#69DCAA" />
          <rect x="42" y="40" width="8" height="8" rx="2" fill="#FF9A75" />
        </>
      )
    case 'calendar':
      return (
        <>
          <defs>
            <linearGradient id={`${id}-calendar`} x1="9" y1="2" x2="54" y2="62">
              <stop stopColor="#FFF" />
              <stop offset="1" stopColor="#E7EAF1" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-calendar)`} />
          <path d="M2 18A16 16 0 0 1 18 2h28a16 16 0 0 1 16 16v8H2z" fill="#FF4D5E" />
          <path d="M17 15V9M47 15V9" stroke="#fff" strokeLinecap="round" strokeWidth="3" />
          <path
            d="M22 35.5c.4-6.4 4.3-10 10.2-10 5.8 0 9.8 3.2 9.8 8.1 0 4-2.2 6.6-7.6 10.1l-5.1 3.4h13.2"
            fill="none"
            stroke="#263248"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
        </>
      )
    case 'search':
      return (
        <>
          <defs>
            <radialGradient id={`${id}-search`} cx="30%" cy="20%" r="90%">
              <stop stopColor="#FFF" />
              <stop offset="1" stopColor="#DDE5F3" />
            </radialGradient>
            <linearGradient id={`${id}-lens`} x1="15" y1="13" x2="44" y2="46">
              <stop stopColor="#65D6FF" />
              <stop offset="1" stopColor="#3971EF" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-search)`} />
          <circle cx="28" cy="28" r="15" fill={`url(#${id}-lens)`} />
          <circle cx="28" cy="28" r="9" fill="#EAF8FF" opacity=".9" />
          <path d="m39 39 13 13" stroke="#2455C7" strokeLinecap="round" strokeWidth="7" />
          <circle cx="22" cy="21" r="3.5" fill="#fff" opacity=".75" />
        </>
      )
    case 'settings':
      return (
        <>
          <defs>
            <linearGradient id={`${id}-metal`} x1="7" y1="3" x2="58" y2="62">
              <stop stopColor="#F9FAFC" />
              <stop offset=".48" stopColor="#AEB8C7" />
              <stop offset="1" stopColor="#6D7788" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-metal)`} />
          <path d="M35.8 10.5 38 17a16 16 0 0 1 4.2 2.4l6.6-1.3 4.7 8.2-4.4 5a17 17 0 0 1 0 4.8l4.4 5-4.7 8.2-6.6-1.3a16 16 0 0 1-4.2 2.4L35.8 57h-9.6L24 50.5a16 16 0 0 1-4.2-2.4l-6.6 1.3-4.7-8.2 4.4-5a17 17 0 0 1 0-4.8l-4.4-5 4.7-8.2 6.6 1.3A16 16 0 0 1 24 17l2.2-6.5z" fill="#4D5666" />
          <circle cx="31" cy="34" r="11" fill="#E9EDF4" />
          <circle cx="31" cy="34" r="6" fill="#4B8EFF" />
          <circle cx="29" cy="31" r="2" fill="#BDE4FF" />
        </>
      )
  }
}

export function WorkspaceDockIcon({ icon }: WorkspaceDockIconProps) {
  const uniqueId = `dock-${icon}-${useId().replace(/:/g, '')}`

  return (
    <svg
      className="workspace-dock-icon"
      data-dock-icon={icon}
      data-dock-artwork={icon}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      {renderArtwork(icon, uniqueId)}
    </svg>
  )
}

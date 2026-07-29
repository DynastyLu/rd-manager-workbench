import { motion, useReducedMotion } from 'framer-motion'
import { useId } from 'react'

const NOVA_LETTERS = [
  {
    id: 'n',
    d: 'M15 52 L15 13 L55 52 L55 13',
    delay: 0.18,
    duration: 1.06,
  },
  {
    id: 'o',
    d: 'M97 13 C81 13 72 21 72 33 S81 53 97 53 122 45 122 33 113 13 97 13 Z',
    delay: 1.38,
    duration: 0.92,
  },
  {
    id: 'v',
    d: 'M132 14 L153 52 L174 14',
    delay: 2.44,
    duration: 0.72,
  },
  {
    id: 'a',
    d: 'M182 52 L205 13 L228 52 M190 38 L220 38',
    delay: 3.3,
    duration: 1.02,
  },
] as const

const DRAW_EASING = [0.46, 0.02, 0.23, 1] as const

export function NovaWordmark() {
  const reduceMotion = useReducedMotion()
  const gradientId = `nova-wordmark-gradient-${useId().replace(/:/g, '')}`

  return (
    <div className="nova-wordmark" role="img" aria-label="NOVA">
      <svg className="nova-wordmark__art" viewBox="0 0 244 66" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1f2329" />
            <stop offset="62%" stopColor="#343941" />
            <stop offset="100%" stopColor="#3370ff" />
          </linearGradient>
        </defs>

        {NOVA_LETTERS.map((letter) => (
          <motion.path
            key={letter.id}
            className="nova-wordmark__letter"
            data-letter={letter.id}
            data-delay={letter.delay}
            data-duration={letter.duration}
            d={letter.d}
            stroke={`url(#${gradientId})`}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              pathLength: {
                delay: letter.delay,
                duration: letter.duration,
                ease: DRAW_EASING,
              },
              opacity: {
                delay: letter.delay,
                duration: 0.08,
              },
            }}
          />
        ))}
      </svg>
      <motion.span
        className="nova-wordmark__caption"
        initial={reduceMotion ? false : { opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 4.42, duration: 0.42 }}
      >
        LOCAL KNOWLEDGE ASSISTANT
      </motion.span>
    </div>
  )
}

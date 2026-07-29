import { motion, useReducedMotion } from 'framer-motion'

interface NovaBotProps {
  active?: boolean
  compact?: boolean
  label?: string
}

const bounceTransition = {
  duration: 1.38,
  ease: 'easeInOut' as const,
  repeat: Number.POSITIVE_INFINITY,
  times: [0, 0.1, 0.42, 0.68, 0.8, 1],
}

export function NovaBot({ active = false, compact = false, label = 'NOVA 助手' }: NovaBotProps) {
  const reduceMotion = useReducedMotion()
  const shouldAnimate = active && !reduceMotion

  return (
    <span
      className={['nova-bot', active ? 'nova-bot--active' : '', compact ? 'nova-bot--compact' : '']
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label={label}
    >
      <motion.span
        className="nova-bot__orb"
        aria-hidden="true"
        animate={
          shouldAnimate
            ? {
                y: [0, 1, -12, 0, -4, 0],
                scaleX: [1.04, 1.1, 0.97, 1.08, 0.99, 1.03],
                scaleY: [0.96, 0.89, 1.05, 0.92, 1.02, 0.98],
              }
            : { y: 0, scaleX: 1, scaleY: 1 }
        }
        transition={shouldAnimate ? bounceTransition : { duration: 0 }}
      >
        <span className="nova-bot__eyes">
          {[0, 1].map((eye) => (
            <motion.i
              key={eye}
              className="nova-bot__eye"
              animate={reduceMotion ? { scaleY: 1 } : { scaleY: [1, 1, 0.12, 1, 1] }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      delay: eye * 0.04,
                      duration: 4.8,
                      ease: 'easeInOut',
                      repeat: Number.POSITIVE_INFINITY,
                      times: [0, 0.91, 0.945, 0.98, 1],
                    }
              }
            />
          ))}
        </span>
      </motion.span>
      {active ? (
        <span className="nova-bot__ground-shadow" aria-hidden="true">
          <motion.span
            className="nova-bot__ground-shadow-shape"
            animate={
              shouldAnimate
                ? {
                    opacity: [0.68, 0.72, 0.25, 0.68, 0.45, 0.68],
                    scaleX: [1, 1.08, 0.54, 1, 0.76, 1],
                  }
                : { opacity: 0.58, scaleX: 1 }
            }
            transition={shouldAnimate ? bounceTransition : { duration: 0 }}
          />
        </span>
      ) : null}
    </span>
  )
}

/**
 * Shared Framer Motion animation variants.
 * Import these into page/component files instead of defining inline.
 */

import type { Variants } from 'framer-motion'

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
}

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15 } },
}

/** Use on the container wrapping a list of items for staggered reveal. */
export const listVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
}

/** Use on each item inside a listVariants container. */
export const itemVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
}

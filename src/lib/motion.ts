import type { Transition, Variants } from 'motion/react'

/*
 * Deliberate and snappy, per the brand. Durations are short enough that the UI
 * never feels like it is easing in; the spring is used only where something
 * physically moves rather than merely appears.
 */
export const DURATION = {
  instant: 0.12,
  fast: 0.18,
  base: 0.26,
  slow: 0.42,
} as const

export const EASE = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const

export const springy: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.8,
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
}

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

/** Staggers a grid of cards so a dashboard assembles rather than snapping in. */
export function stagger(amount = 0.045, delay = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: amount, delayChildren: delay } },
  }
}

export const transition: Transition = {
  duration: DURATION.base,
  ease: EASE.out,
}

export const fastTransition: Transition = {
  duration: DURATION.fast,
  ease: EASE.out,
}

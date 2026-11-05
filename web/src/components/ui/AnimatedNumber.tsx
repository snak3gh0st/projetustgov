'use client'

import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'

interface AnimatedNumberProps {
  value: number
  format?: (n: number) => string
  className?: string
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString('pt-BR')

// Número que desliza do valor anterior ao novo quando o dado muda (não no primeiro render).
export default function AnimatedNumber({ value, format = defaultFormat, className = '' }: AnimatedNumberProps) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(value)
  const previous = useRef(value)

  useEffect(() => {
    const from = previous.current
    previous.current = value
    if (reduce || from === value) {
      setDisplay(value)
      return
    }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setDisplay,
    })
    return () => controls.stop()
  }, [value, reduce])

  return <span className={`tabular ${className}`}>{format(display)}</span>
}

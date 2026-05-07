'use client'

import { useEffect, useRef } from 'react'
import { isEnabled } from '@/lib/flags'

interface Props {
  nodeCount: number
}

export function PerfMonitor({ nodeCount }: Props) {
  const rendersElRef = useRef<HTMLDivElement | null>(null)
  const fpsElRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | undefined>(undefined)
  const lastTimeRef = useRef(0)
  const frameCountRef = useRef(0)
  const renderCountRef = useRef(0)

  useEffect(() => {
    renderCountRef.current += 1
  })

  useEffect(() => {
    if (!isEnabled('PERF_MONITOR')) return
    const id = window.setInterval(() => {
      if (rendersElRef.current) {
        rendersElRef.current.textContent = `Re-renders: ${renderCountRef.current}`
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!isEnabled('PERF_MONITOR')) return

    function countFrames(time: number) {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = time
      }
      frameCountRef.current += 1
      const elapsed = time - lastTimeRef.current
      if (elapsed >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsed)
        if (fpsElRef.current) {
          fpsElRef.current.textContent = `FPS: ${fps}`
        }
        frameCountRef.current = 0
        lastTimeRef.current = time
      }
      frameRef.current = requestAnimationFrame(countFrames)
    }

    frameRef.current = requestAnimationFrame(countFrames)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  if (!isEnabled('PERF_MONITOR')) return null

  return (
    <div
      style={{
        position: 'absolute',
        right: 18,
        bottom: 88,
        zIndex: 95,
        borderRadius: 10,
        border: '1px solid rgba(148,163,184,0.3)',
        background: 'rgba(2,8,16,0.9)',
        color: '#94A3B8',
        fontSize: 10,
        fontFamily: 'DM Sans, sans-serif',
        padding: '8px 10px',
        lineHeight: 1.5,
      }}
    >
      <div>Nodes: {nodeCount}</div>
      <div ref={rendersElRef}>Re-renders: 0</div>
      <div ref={fpsElRef}>FPS: 0</div>
    </div>
  )
}


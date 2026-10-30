import { useEffect, useState, useSyncExternalStore } from 'react'
import { simClock } from '../sim/clock'

export function useClockState() {
  return useSyncExternalStore(simClock.subscribe, simClock.getState)
}

/** Simulated time, refreshed for the UI at a modest rate (3D runs per frame). */
export function useSimNow(intervalMs = 100) {
  const [now, setNow] = useState(() => simClock.now())
  useEffect(() => {
    let id = 0
    const tick = () => setNow(simClock.now())
    id = window.setInterval(tick, intervalMs)
    const unsub = simClock.subscribe(tick)
    return () => {
      window.clearInterval(id)
      unsub()
    }
  }, [intervalMs])
  return now
}

/**
 * Simulation clock: the single source of time for every panel.
 * Live mode follows the real UTC clock. Otherwise simulated time advances
 * at `rate` simulated ms per real ms while playing.
 */

export const SPEEDS = [
  { id: 'real', label: 'Real time', rate: 1 },
  { id: 'day', label: '1 day/s', rate: 86400 },
  { id: 'month', label: '1 month/s', rate: (365.2425 / 12) * 86400 },
  { id: 'year', label: '1 year/s', rate: 365.2425 * 86400 },
] as const

export type SpeedId = (typeof SPEEDS)[number]['id']

export interface ClockState {
  live: boolean
  playing: boolean
  speed: SpeedId
}

type Listener = () => void

const MIN_MS = Date.UTC(1600, 0, 1)
const MAX_MS = Date.UTC(2400, 11, 31)

export class SimClock {
  private anchorSim = Date.now()
  private anchorReal = performance.now()
  state: ClockState = { live: true, playing: true, speed: 'real' }
  private listeners = new Set<Listener>()

  now(): number {
    if (this.state.live) return Date.now()
    if (!this.state.playing) return this.anchorSim
    const rate = SPEEDS.find((s) => s.id === this.state.speed)!.rate
    const t = this.anchorSim + (performance.now() - this.anchorReal) * rate
    if (t > MAX_MS || t < MIN_MS) {
      this.anchorSim = Math.min(MAX_MS, Math.max(MIN_MS, t))
      this.anchorReal = performance.now()
      this.state = { ...this.state, playing: false }
      this.emit()
      return this.anchorSim
    }
    return t
  }

  private rebase() {
    this.anchorSim = this.now()
    this.anchorReal = performance.now()
  }

  setTime(ms: number) {
    this.anchorSim = Math.min(MAX_MS, Math.max(MIN_MS, ms))
    this.anchorReal = performance.now()
    this.state = { ...this.state, live: false }
    this.emit()
  }

  goLive() {
    this.state = { live: true, playing: true, speed: 'real' }
    this.emit()
  }

  setPlaying(playing: boolean) {
    this.rebase()
    this.state = { ...this.state, live: false, playing }
    this.emit()
  }

  setSpeed(speed: SpeedId) {
    this.rebase()
    this.state = { ...this.state, live: false, playing: true, speed }
    this.emit()
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getState = () => this.state

  private emit() {
    this.listeners.forEach((l) => l())
  }
}

export const simClock = new SimClock()

import { MAX_YEAR, MIN_YEAR } from '../astro/bodies'
import { daysInMonth, daysInYear, monthDayFromDayOfYear, zonedToUtc, type CivilParts } from '../astro/time'
import { SPEEDS, simClock } from '../sim/clock'
import { useClockState } from './hooks'

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

export function TimeControls({ parts, tz, doy }: { parts: CivilParts; tz: string; doy: number }) {
  const state = useClockState()

  const setCivil = (y: number, m: number, d: number) => {
    const day = Math.min(d, daysInMonth(y, m))
    simClock.setTime(zonedToUtc(tz, y, m, day, parts.hour, parts.minute, parts.second))
  }

  const stepYear = (delta: number) => {
    const y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, parts.year + delta))
    setCivil(y, parts.month, parts.day)
  }

  const dateValue = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`

  return (
    <div className="time-controls">
      <div className="control-row">
        <button className={state.live ? 'chip active' : 'chip'} onClick={() => simClock.goLive()} aria-pressed={state.live}>
          <span className={state.live ? 'live-dot on' : 'live-dot'} /> Live
        </button>
        <button
          className="chip"
          onClick={() => simClock.setPlaying(state.live ? false : !state.playing)}
          aria-label={state.playing ? 'Pause' : 'Play'}
        >
          {state.playing ? 'Pause' : 'Play'}
        </button>
        <div className="segmented" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={!state.live && state.speed === s.id}
              className={!state.live && state.speed === s.id ? 'seg active' : 'seg'}
              onClick={() => simClock.setSpeed(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-row">
        <div className="year-stepper">
          <button className="chip icon" onClick={() => stepYear(-1)} aria-label="Previous year">
            −
          </button>
          <input
            className="year-input mono"
            type="number"
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={parts.year}
            aria-label="Year"
            onChange={(e) => {
              const y = Number(e.target.value)
              if (Number.isFinite(y) && y >= MIN_YEAR && y <= MAX_YEAR) setCivil(y, parts.month, parts.day)
            }}
          />
          <button className="chip icon" onClick={() => stepYear(1)} aria-label="Next year">
            +
          </button>
        </div>
        <input
          className="date-input mono"
          type="date"
          value={dateValue}
          min={`${MIN_YEAR}-01-01`}
          max={`${MAX_YEAR}-12-31`}
          aria-label="Date"
          onChange={(e) => {
            const [y, m, d] = e.target.value.split('-').map(Number)
            if (y && m && d) setCivil(y, m, d)
          }}
        />
      </div>

      <label className="scrubber">
        <span className="sr-only">Day of year</span>
        <input
          type="range"
          min={1}
          max={daysInYear(parts.year)}
          step={1}
          value={doy}
          onChange={(e) => {
            const md = monthDayFromDayOfYear(parts.year, Number(e.target.value))
            setCivil(parts.year, md.month, md.day)
          }}
        />
      </label>
    </div>
  )
}

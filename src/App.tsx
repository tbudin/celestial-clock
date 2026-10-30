import { useEffect, useMemo, useState } from 'react'
import { PLANET_BY_ID, YEAR_SCALES, type YearPlanetId } from './astro/bodies'
import { calendarScale, yearScale } from './astro/clockScales'
import { browserTimeZone, civilParts, dayOfYear, MONTH_NAMES, zonedToUtc } from './astro/time'
import { Orrery } from './render/Orrery'
import { loadTextures, type TextureKey, type TextureSet } from './render/textures'
import { renderThumbnails } from './render/thumbnails'
import { PlanetSelector } from './ui/PlanetSelector'
import { TimeControls } from './ui/TimeControls'
import { useClockState, useSimNow } from './ui/hooks'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad = (n: number) => String(n).padStart(2, '0')

function zoneLabel(tz: string, at: number) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(at))
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz
  } catch {
    return tz
  }
}

export default function App() {
  const tz = useMemo(() => browserTimeZone(), [])
  const now = useSimNow(100)
  const clock = useClockState()
  const parts = civilParts(now, tz)
  const doy = dayOfYear(parts.year, parts.month, parts.day)

  const [yearPlanet, setYearPlanet] = useState<YearPlanetId>('jupiter')
  const [textures, setTextures] = useState<TextureSet | null>(null)
  const [failed, setFailed] = useState<TextureKey[]>([])
  const [thumbs, setThumbs] = useState<Partial<Record<YearPlanetId, string>>>({})

  useEffect(() => {
    let cancelled = false
    loadTextures().then(({ textures, failed }) => {
      if (cancelled) return
      setTextures(textures)
      setFailed(failed)
      setThumbs(renderThumbnails(textures, Date.now()))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const calendar = useMemo(() => calendarScale(parts.year, tz), [parts.year, tz])
  const yScale = useMemo(() => yearScale(yearPlanet, parts.year, tz), [yearPlanet, parts.year, tz])
  const orbitEpochMs = useMemo(() => zonedToUtc(tz, parts.year, 7, 1), [parts.year, tz])

  const planet = PLANET_BY_ID[yearPlanet]

  return (
    <main className="app">
      <header className="masthead">
        <h1>Celestial Clock</h1>
        <span className="masthead-note">{clock.live ? 'Live' : clock.playing ? 'Simulating' : 'Paused'}</span>
      </header>

      <section className="orrery-section" aria-label="Solar system clock">
        <div className="readouts">
          <div className="readout readout-date">
            <span className="readout-label">Date · Earth</span>
            <span className="readout-value">
              {parts.day} {MONTH_NAMES[parts.month - 1]}
            </span>
            <span className="readout-sub mono">
              {WEEKDAYS[parts.weekday]} · day {doy} · {pad(parts.hour)}:{pad(parts.minute)}:{pad(parts.second)} {zoneLabel(tz, now)}
            </span>
          </div>
          <div className="readout readout-year">
            <span className="readout-label">Year · {planet.name}</span>
            <span className="readout-value mono gold">{parts.year}</span>
            <span className="readout-sub">
              {YEAR_SCALES[yearPlanet].labelInterval === 1 ? 'Labelled yearly' : `Labelled every ${YEAR_SCALES[yearPlanet].labelInterval}`}
              <span className="wide-only"> · scale {yScale.fromYear}–{yScale.toYear}</span>
            </span>
          </div>
        </div>

        <div className="orrery-canvas">
          {textures ? (
            <Orrery
              textures={textures}
              calendar={calendar}
              yearScale={yScale}
              yearPlanet={yearPlanet}
              currentDayIndex={doy - 1}
              currentMonth={parts.month}
              orbitEpochMs={orbitEpochMs}
            />
          ) : (
            <div className="loading">Loading textures…</div>
          )}
        </div>

        {failed.length > 0 && (
          <p className="warning" role="alert">
            Some textures failed to load ({failed.join(', ')}). Plain materials are shown instead.
          </p>
        )}

        <p className="scale-note">
          Directions are exact; distances are compressed and planet sizes enlarged for legibility. Time zone: {tz}.
        </p>
      </section>

      <section className="controls-section" aria-label="Controls">
        <PlanetSelector value={yearPlanet} onChange={setYearPlanet} thumbnails={thumbs} />
        <TimeControls parts={parts} tz={tz} doy={doy} />
      </section>
    </main>
  )
}

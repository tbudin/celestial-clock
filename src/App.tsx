import { useCallback, useEffect, useMemo, useState } from 'react'
import { PLANET_BY_ID, YEAR_SCALES, type YearPlanetId } from './astro/bodies'
import { calendarScale, yearScale } from './astro/clockScales'
import { approximatePlace, isValidTimeZone, type Place } from './astro/places'
import { browserTimeZone, civilParts, dayOfYear, zonedToUtc, zoneOffsetMs } from './astro/time'
import { Orrery } from './render/Orrery'
import { loadTextures, type TextureKey, type TextureSet } from './render/textures'
import { renderThumbnails } from './render/thumbnails'
import { EarthPanel, zoneLabel } from './ui/EarthPanel'
import { LocationPicker } from './ui/LocationPicker'
import { MoonPanel } from './ui/MoonPanel'
import { PlanetSelector } from './ui/PlanetSelector'
import { TimeControls } from './ui/TimeControls'
import { useClockState, useSimNow } from './ui/hooks'
import { Reading } from './ui/Reading'
import { simClock } from './sim/clock'


export type ViewMode = 'full' | 'ambient' | 'orrery' | 'earth' | 'moon'
const PLANET_IDS: YearPlanetId[] = ['jupiter', 'saturn', 'uranus', 'neptune']

/** URL options, for embedding and ambient displays. See README. */
function readParams() {
  const q = new URLSearchParams(window.location.search)
  const view = (q.get('view') ?? 'full') as ViewMode
  const planet = q.get('planet') as YearPlanetId | null
  const tzParam = q.get('tz')
  const lat = q.get('lat')
  const lon = q.get('lon')
  let place: Place | null = null
  const tz = tzParam && isValidTimeZone(tzParam) ? tzParam : null
  if (lat !== null && lon !== null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
    place = {
      name: q.get('name') ?? `${Number(lat).toFixed(2)}, ${Number(lon).toFixed(2)}`,
      latitude: Math.max(-90, Math.min(90, Number(lat))),
      longitude: Math.max(-180, Math.min(180, Number(lon))),
      timeZone: tz ?? browserTimeZone(),
      source: 'custom',
    }
  }
  // ?t=2026-03-20T12:00:00Z starts the clock at that instant (still running)
  const t = q.get('t')
  if (t && Number.isFinite(Date.parse(t))) simClock.setTime(Date.parse(t))
  return {
    view: (['full', 'ambient', 'orrery', 'earth', 'moon'] as ViewMode[]).includes(view) ? view : 'full',
    planet: planet && PLANET_IDS.includes(planet) ? planet : 'jupiter',
    place,
    tz,
  }
}

type GeoStatus = 'idle' | 'pending' | 'denied' | 'unavailable' | 'granted'

function usePlace(initial: Place | null, tzOverride: string | null) {
  const [place, setPlace] = useState<Place>(() => {
    if (initial) return initial
    const tz = tzOverride ?? browserTimeZone()
    return approximatePlace(tz, zoneOffsetMs(Date.now(), tz) / 60000)
  })
  const [geo, setGeo] = useState<GeoStatus>('idle')

  const requestDevice = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeo('unavailable')
      return
    }
    setGeo('pending')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo('granted')
        setPlace({
          name: 'Your location',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          timeZone: browserTimeZone(),
          source: 'device',
        })
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 15000 },
    )
  }, [])

  // Use the device location automatically only when permission is already granted
  useEffect(() => {
    if (initial) return
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        if (s.state === 'granted') requestDevice()
        else if (s.state === 'denied') setGeo('denied')
      })
      .catch(() => {})
  }, [initial, requestDevice])

  return { place, setPlace, geo, requestDevice }
}

export interface CelestialClockProps {
  /** Which parts to show. Defaults to the URL's ?view= or 'full'. */
  view?: ViewMode
  /** Year-hand planet. Defaults to ?planet= or Jupiter. */
  planet?: YearPlanetId
  /** Observer. Defaults to ?lat=&lon=, the device location if already permitted, or an approximation from the time zone. */
  place?: Place
  /** Read options from the page URL (default true; set false when embedding as a component). */
  useUrl?: boolean
}

export default function App(props: CelestialClockProps = {}) {
  const params = useMemo(() => {
    const url = props.useUrl === false ? { view: 'full' as ViewMode, planet: 'jupiter' as YearPlanetId, place: null, tz: null } : readParams()
    return {
      view: props.view ?? url.view,
      planet: props.planet ?? url.planet,
      place: props.place ?? url.place,
      tz: url.tz,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const { place, setPlace, geo, requestDevice } = usePlace(params.place, params.tz)
  const tz = place.timeZone
  const now = useSimNow(100)
  const clock = useClockState()
  const parts = civilParts(now, tz)
  const doy = dayOfYear(parts.year, parts.month, parts.day)
  const view = params.view

  const [yearPlanet, setYearPlanet] = useState<YearPlanetId>(params.planet)
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

  useEffect(() => {
    document.documentElement.dataset.view = view
  }, [view])

  const calendar = useMemo(() => calendarScale(parts.year, tz), [parts.year, tz])
  const yScale = useMemo(() => yearScale(yearPlanet, parts.year, tz), [yearPlanet, parts.year, tz])
  const orbitEpochMs = useMemo(() => zonedToUtc(tz, parts.year, 7, 1), [parts.year, tz])
  const planet = PLANET_BY_ID[yearPlanet]

  const showTelemetry = view === 'full' || view === 'ambient' || view === 'earth' || view === 'moon'
  const showOrrery = view === 'full' || view === 'ambient' || view === 'orrery'
  const showControls = view === 'full'

  return (
    <main className={`app view-${view}`}>
      {view === 'full' && (
        <header className="masthead">
          <h1>Celestial Clock</h1>
          <span className="masthead-note">{clock.live ? 'Live' : clock.playing ? 'Simulating' : 'Paused'}</span>
        </header>
      )}

      {showControls && <LocationPicker place={place} onChange={setPlace} onUseDevice={requestDevice} geoStatus={geo} />}

      <div className="side">
        {view !== 'earth' && view !== 'moon' && <Reading parts={parts} doy={doy} zone={zoneLabel(tz, now)} yearPlanet={yearPlanet} />}
        {showTelemetry && (
          <section className={`telemetry ${view === 'earth' || view === 'moon' ? 'single' : ''}`} aria-label="Earth and Moon telemetry">
            {view !== 'moon' && <EarthPanel place={place} now={now} />}
            {view !== 'earth' && <MoonPanel place={place} now={now} />}
          </section>
        )}
      </div>

      {showOrrery && (
        <section className="orrery-section" aria-label="Solar system clock">
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

          {view === 'full' && (
            <p className="scale-note">
              The green hand reads the day and month on the calendar ring; the gold hand reads the year on {planet.name}’s orbit (scale {yScale.fromYear}–{yScale.toYear},
              labelled {YEAR_SCALES[yearPlanet].labelInterval === 1 ? 'every year' : `every ${YEAR_SCALES[yearPlanet].labelInterval} years`}). Directions are exact; distances are
              compressed and planet sizes enlarged.
            </p>
          )}
        </section>
      )}

      {showControls && (
        <section className="controls-section" aria-label="Controls">
          <PlanetSelector value={yearPlanet} onChange={setYearPlanet} thumbnails={thumbs} />
          <TimeControls parts={parts} tz={tz} doy={doy} />
          <footer className="credits">
            Ephemerides: Astronomy Engine (VSOP87, IAU 2015 rotation models). Textures: Solar System Scope (CC BY 4.0) and NASA Earth at night.{' '}
            <a href="/?view=ambient">Ambient mode</a>
          </footer>
        </section>
      )}
    </main>
  )
}

import { useMemo } from 'react'
import { earthView, sunTimes } from '../astro/observer'
import type { Place } from '../astro/places'
import { civilParts, zonedToUtc } from '../astro/time'
import { EARTH_CAMERA_DISTANCE, EARTH_FOV, EarthGlobe } from '../render/EarthGlobe'

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')

function hm(ms: number | null, tz: string) {
  if (ms === null) return '—'
  const p = civilParts(ms, tz)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

function hoursOf(ms: number, tz: string) {
  const p = civilParts(ms, tz)
  return p.hour + p.minute / 60 + p.second / 3600
}

function fmtHours(h: number) {
  const s = Math.floor(h * 3600) % 86400
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`
}

/** Apparent radius of the globe as a fraction of the half-size of the panel. */
export const GLOBE_FRACTION = Math.tan(Math.asin(1 / EARTH_CAMERA_DISTANCE)) / Math.tan(((EARTH_FOV / 2) * Math.PI) / 180)

export function zoneLabel(tz: string, at: number) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(at))
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz
  } catch {
    return tz
  }
}

export function EarthPanel({ place, now }: { place: Place; now: number }) {
  const tz = place.timeZone
  const parts = civilParts(now, tz)
  const civilHours = parts.hour + parts.minute / 60 + parts.second / 3600
  const ev = earthView(place, now)

  const dayKey = `${parts.year}-${parts.month}-${parts.day}`
  const times = useMemo(() => {
    const [y, m, d] = dayKey.split('-').map(Number)
    const start = zonedToUtc(tz, y, m, d)
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    const end = zonedToUtc(tz, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
    return sunTimes(place, start, end)
  }, [dayKey, tz, place])

  const eot = ev.equationOfTimeMin
  return (
    <article className="panel" aria-label="Earth telemetry">
      <header className="panel-head">
        <span className="panel-kicker">Earth · hour</span>
        <span className="panel-place">{place.name}</span>
      </header>
      <div className="globe-wrap">
        <EarthGlobe location={place} />
        <HourDial
          civilHours={civilHours}
          solarHours={ev.apparentSolarHours}
          sunrise={times.sunrise !== null ? hoursOf(times.sunrise, tz) : null}
          sunset={times.sunset !== null ? hoursOf(times.sunset, tz) : null}
          noon={times.solarNoon !== null ? hoursOf(times.solarNoon, tz) : null}
          polar={times.polar}
        />
      </div>
      <div className="panel-readout">
        <div className="big-time mono">
          {pad(parts.hour)}:{pad(parts.minute)}
          <span className="secs">:{pad(parts.second)}</span>
        </div>
        <div className="sub">
          Civil time · {zoneLabel(tz, now)} · {tz}
        </div>
        <dl className="facts">
          <div>
            <dt>Solar time</dt>
            <dd className="mono gold">{fmtHours(ev.apparentSolarHours)}</dd>
          </div>
          <div>
            <dt>Eq. of time</dt>
            <dd className="mono">
              {eot >= 0 ? '+' : '−'}
              {Math.abs(eot).toFixed(1)} min
            </dd>
          </div>
          <div>
            <dt>Sunrise</dt>
            <dd className="mono">{times.polar === 'day' ? 'Polar day' : times.polar === 'night' ? 'Polar night' : hm(times.sunrise, tz)}</dd>
          </div>
          <div>
            <dt>Solar noon</dt>
            <dd className="mono">{hm(times.solarNoon, tz)}</dd>
          </div>
          <div>
            <dt>Sunset</dt>
            <dd className="mono">{times.polar ? '—' : hm(times.sunset, tz)}</dd>
          </div>
          <div>
            <dt>Sun altitude</dt>
            <dd className="mono">{ev.sunAltitude.toFixed(1)}°</dd>
          </div>
        </dl>
      </div>
    </article>
  )
}

/**
 * 24-hour dial, noon at the top, midnight at the bottom, clockwise.
 * Outer ticks are civil time; the inner track carries the Sun at local
 * apparent solar time. Both are calibrated in hours.
 */
function HourDial({
  civilHours,
  solarHours,
  sunrise,
  sunset,
  noon,
  polar,
}: {
  civilHours: number
  solarHours: number
  sunrise: number | null
  sunset: number | null
  noon: number | null
  polar: 'day' | 'night' | null
}) {
  const S = 400
  const c = S / 2
  const rGlobe = GLOBE_FRACTION * c
  const rIn = rGlobe + 10
  const rOut = Math.min(c - 6, rGlobe + 34)
  const rTrack = rGlobe + 5
  const ang = (h: number) => ((h / 24) * 2 + 1) * Math.PI
  const pt = (h: number, r: number) => [c + r * Math.sin(ang(h)), c - r * Math.cos(ang(h))] as const

  const arc = (h0: number, h1: number, r: number) => {
    let span = h1 - h0
    if (span < 0) span += 24
    const [x0, y0] = pt(h0, r)
    const [x1, y1] = pt(h0 + span, r)
    return `M ${x0} ${y0} A ${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${x1} ${y1}`
  }

  const ticks = []
  for (let q = 0; q < 96; q++) {
    const h = q / 4
    const major = q % 4 === 0
    const [x0, y0] = pt(h, rOut)
    const [x1, y1] = pt(h, rOut - (major ? 9 : 4))
    ticks.push(<line key={q} x1={x0} y1={y0} x2={x1} y2={y1} className={major ? 'dial-tick major' : 'dial-tick'} />)
  }
  const labels = []
  for (let h = 0; h < 24; h += 3) {
    const [x, y] = pt(h, rOut - 18)
    labels.push(
      <text key={h} x={x} y={y} className="dial-label" textAnchor="middle" dominantBaseline="central">
        {String(h).padStart(2, '0')}
      </text>,
    )
  }
  const [hx0, hy0] = pt(civilHours, rIn - 4)
  const [hx1, hy1] = pt(civilHours, rOut + 2)
  const [sx, sy] = pt(solarHours, rTrack)
  const daylight = polar === 'day' ? 'full' : polar === 'night' ? null : sunrise !== null && sunset !== null ? arc(sunrise, sunset, rOut - 1) : null

  return (
    <svg className="dial" viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
      <circle cx={c} cy={c} r={rOut} className="dial-ring" />
      {daylight === 'full' ? <circle cx={c} cy={c} r={rOut - 1} className="dial-day" /> : daylight && <path d={daylight} className="dial-day" />}
      {ticks}
      {labels}
      {noon !== null && <line x1={pt(noon, rOut + 1)[0]} y1={pt(noon, rOut + 1)[1]} x2={pt(noon, rOut - 9)[0]} y2={pt(noon, rOut - 9)[1]} className="dial-noon" />}
      {sunrise !== null && <circle cx={pt(sunrise, rOut - 1)[0]} cy={pt(sunrise, rOut - 1)[1]} r={2.4} className="dial-rise" />}
      {sunset !== null && <circle cx={pt(sunset, rOut - 1)[0]} cy={pt(sunset, rOut - 1)[1]} r={2.4} className="dial-rise" />}
      <circle cx={c} cy={c} r={rTrack} className="dial-track" />
      <circle cx={sx} cy={sy} r={4.2} className="dial-sun" />
      <line x1={hx0} y1={hy0} x2={hx1} y2={hy1} className="dial-hand" />
      <circle cx={c} cy={c} r={3.2} className="observer-dot" />
      <circle cx={c} cy={c} r={8} className="observer-ring" />
    </svg>
  )
}

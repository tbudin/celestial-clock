import { useMemo } from 'react'
import { moonEvents, moonView, phaseName } from '../astro/observer'
import type { Place } from '../astro/places'
import { civilParts, MONTH_SHORT, zonedToUtc } from '../astro/time'
import { MoonGlobe } from '../render/MoonGlobe'

const pad = (n: number) => String(n).padStart(2, '0')

function hm(ms: number | null, tz: string) {
  if (ms === null) return '—'
  const p = civilParts(ms, tz)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function MoonPanel({ place, now }: { place: Place; now: number }) {
  const tz = place.timeZone
  const m = moonView(place, now)
  const parts = civilParts(now, tz)
  const dayKey = `${parts.year}-${parts.month}-${parts.day}`
  // Events change at most a few times a day; refresh on the civil day and hourly
  const hourKey = Math.floor(now / 3600000)
  const ev = useMemo(() => {
    const [y, mo, d] = dayKey.split('-').map(Number)
    const start = zonedToUtc(tz, y, mo, d)
    const next = new Date(Date.UTC(y, mo - 1, d + 1))
    const end = zonedToUtc(tz, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
    return moonEvents(place, start, end, hourKey * 3600000)
  }, [dayKey, tz, place, hourKey])

  const nextParts = civilParts(ev.next.timeMs, tz)
  const below = m.altitude < 0

  return (
    <article className="panel" aria-label="Moon telemetry">
      <header className="panel-head">
        <span className="panel-kicker">Lunar cycle · the Moon</span>
        <span className="panel-place">{below ? 'Below the horizon' : `${m.altitude.toFixed(0)}° up, ${COMPASS[Math.round(m.azimuth / 45) % 8]}`}</span>
      </header>
      <div className="globe-wrap">
        <MoonGlobe location={place} />
        <svg className="dial" viewBox="0 0 400 400" aria-hidden="true">
          {/* Zenith marker: the panel shows the Moon as it stands in your sky, zenith up */}
          <line x1="200" y1="14" x2="200" y2="26" className="dial-tick major" />
          <text x="200" y="38" className="dial-label" textAnchor="middle" dominantBaseline="central">
            ZENITH
          </text>
        </svg>
      </div>
      <div className="panel-readout">
        <div className="big-time">{phaseName(m.phaseLon)}</div>
        <div className="sub">
          {(m.illuminated * 100).toFixed(1)}% illuminated · {m.phaseLon.toFixed(0)}° through the cycle
        </div>
        <dl className="facts">
          <div>
            <dt>Moonrise</dt>
            <dd className="mono">{hm(ev.moonrise, tz)}</dd>
          </div>
          <div>
            <dt>Moonset</dt>
            <dd className="mono">{hm(ev.moonset, tz)}</dd>
          </div>
          <div>
            <dt>Next</dt>
            <dd className="mono">
              {ev.next.name.replace(' Moon', '').replace(' quarter', ' qtr')} {nextParts.day} {MONTH_SHORT[nextParts.month - 1]}
            </dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd className="mono">{Math.round(m.distanceKm).toLocaleString('en-GB')} km</dd>
          </div>
          <div>
            <dt>Elongation</dt>
            <dd className="mono">{m.elongation.toFixed(1)}°</dd>
          </div>
          <div>
            <dt title="Bright limb position angle, from celestial north / from your zenith">Bright limb</dt>
            <dd className="mono">
              {m.brightLimbPA.toFixed(0)}° · {m.brightLimbFromZenith.toFixed(0)}°z
            </dd>
          </div>
        </dl>
      </div>
    </article>
  )
}

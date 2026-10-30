import { describe, expect, it } from 'vitest'
import * as Astronomy from 'astronomy-engine'
import { earthView, moonView, sunTimes, type Location } from './observer'
import { zonedToUtc } from './time'

const CITIES: Record<string, Location & { tz: string }> = {
  Singapore: { latitude: 1.2903, longitude: 103.852, tz: 'Asia/Singapore' },
  London: { latitude: 51.5074, longitude: -0.1278, tz: 'Europe/London' },
  'New York': { latitude: 40.7128, longitude: -74.006, tz: 'America/New_York' },
  Sydney: { latitude: -33.8688, longitude: 151.2093, tz: 'Australia/Sydney' },
}

type V = { x: number; y: number; z: number }
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const scale = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const norm = (a: V): V => scale(a, 1 / Math.hypot(a.x, a.y, a.z))
const angDiff = (a: number, b: number) => {
  const d = (((a - b) % 360) + 540) % 360 - 180
  return Math.abs(d)
}

/**
 * Reproduce what the Moon panel's camera sees: looking from the observer at the
 * Moon with the zenith up. Returns the direction of the Sun on screen, measured
 * from "up" towards the left (east on the sky), degrees.
 */
function renderedBrightLimbAngle(m: ReturnType<typeof moonView>) {
  const f = scale(m.toObserver, -1) // camera forward
  const up = norm(sub(m.zenith, scale(f, dot(m.zenith, f))))
  const right = cross(f, up)
  const s = norm(sub(m.toSun, scale(f, dot(m.toSun, f))))
  return ((Math.atan2(-dot(s, right), dot(s, up)) * 180) / Math.PI + 360) % 360
}

describe('Moon as seen by the observer', () => {
  const times = [Date.UTC(2026, 9, 30, 14), Date.UTC(2026, 2, 3, 20), Date.UTC(2027, 5, 10, 6), Date.UTC(2026, 11, 24, 2)]
  for (const [name, loc] of Object.entries(CITIES)) {
    it(`rendered bright limb agrees with Meeus' bright-limb and parallactic angles in ${name}`, () => {
      for (const t of times) {
        const m = moonView(loc, t)
        if (m.illuminated < 0.03 || m.illuminated > 0.97) continue // limb direction undefined near new/full
        expect(angDiff(renderedBrightLimbAngle(m), m.brightLimbFromZenith)).toBeLessThan(0.6)
      }
    })
  }

  it('illuminated fraction matches Astronomy Engine (geocentric) within topocentric parallax', () => {
    for (const t of [Date.UTC(2026, 9, 30), Date.UTC(2026, 10, 5), Date.UTC(2026, 10, 12)]) {
      const m = moonView(CITIES.London, t)
      const ref = Astronomy.Illumination(Astronomy.Body.Moon, new Date(t)).phase_fraction
      expect(Math.abs(m.illuminated - ref)).toBeLessThan(0.01)
    }
  })

  it('is full near the published full Moon (2026-11-24 14:53 UT) and new near 2026-11-09 07:02 UT', () => {
    const full = moonView(CITIES.Singapore, Date.UTC(2026, 10, 24, 14, 53))
    const fresh = moonView(CITIES.Singapore, Date.UTC(2026, 10, 9, 7, 2))
    expect(full.illuminated).toBeGreaterThan(0.99)
    expect(fresh.illuminated).toBeLessThan(0.01)
    expect(Math.abs(full.phaseLon - 180)).toBeLessThan(0.5)
  })

  it('a waxing crescent seen from the north is lit on the right, from the south on the left', () => {
    // Evening crescent, Moon in the west after sunset
    const t = Date.UTC(2026, 10, 12, 10) // ~3 days after new Moon
    const ny = moonView(CITIES['New York'], Date.UTC(2026, 10, 12, 22, 30))
    const syd = moonView(CITIES.Sydney, Date.UTC(2026, 10, 12, 9, 0))
    expect(ny.phaseLon).toBeGreaterThan(20)
    expect(ny.phaseLon).toBeLessThan(90)
    // Right of zenith-up = 270° in our "from up towards the left" convention
    expect(angDiff(renderedBrightLimbAngle(ny), 270)).toBeLessThan(80)
    expect(angDiff(renderedBrightLimbAngle(syd), 90)).toBeLessThan(80)
    expect(t).toBeGreaterThan(0)
  })
})

describe('Earth as seen from above the observer', () => {
  it('Sun is overhead near solar noon on the equinox at the equator', () => {
    const t = Astronomy.Seasons(2026).mar_equinox.date.getTime()
    const e = earthView({ latitude: 0, longitude: 0 }, t)
    expect(Math.abs(e.subsolar.latitude)).toBeLessThan(0.05)
    // Solar time at longitude 0 equals 12 + subsolar offset
    const expected = (12 - e.subsolar.longitude / 15 + 24) % 24
    expect(Math.abs(e.apparentSolarHours - expected)).toBeLessThan(0.01)
  })

  it('equation of time is about +16 min in early November and -14 min in mid February', () => {
    const nov = earthView(CITIES.London, Date.UTC(2026, 10, 3, 12))
    const feb = earthView(CITIES.London, Date.UTC(2026, 1, 11, 12))
    expect(nov.equationOfTimeMin).toBeGreaterThan(15.5)
    expect(nov.equationOfTimeMin).toBeLessThan(17)
    expect(feb.equationOfTimeMin).toBeLessThan(-13.5)
    expect(feb.equationOfTimeMin).toBeGreaterThan(-15)
  })

  it('sunrise and sunset in London on the June solstice match published times', () => {
    // timeanddate: 21 June 2026, sunrise 04:43, sunset 21:21 BST
    const start = zonedToUtc('Europe/London', 2026, 6, 21)
    const end = zonedToUtc('Europe/London', 2026, 6, 22)
    const s = sunTimes(CITIES.London, start, end)
    expect(Math.abs(s.sunrise! - zonedToUtc('Europe/London', 2026, 6, 21, 4, 43))).toBeLessThan(2 * 60000)
    expect(Math.abs(s.sunset! - zonedToUtc('Europe/London', 2026, 6, 21, 21, 21))).toBeLessThan(2 * 60000)
  })

  it('Singapore days are about 12 hours long all year', () => {
    for (const m of [1, 6, 12]) {
      const s = sunTimes(CITIES.Singapore, zonedToUtc('Asia/Singapore', 2026, m, 15), zonedToUtc('Asia/Singapore', 2026, m, 16))
      const h = (s.sunset! - s.sunrise!) / 3600000
      expect(h).toBeGreaterThan(11.9)
      expect(h).toBeLessThan(12.3)
    }
  })

  it('reports polar night in Tromsø in December', () => {
    const tz = 'Europe/Oslo'
    const s = sunTimes({ latitude: 69.65, longitude: 18.96 }, zonedToUtc(tz, 2026, 12, 21), zonedToUtc(tz, 2026, 12, 22))
    expect(s.polar).toBe('night')
  })
})

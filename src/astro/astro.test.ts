import { describe, expect, it } from 'vitest'
import * as Astronomy from 'astronomy-engine'
import { bodyAxes, helioEcliptic, helioLongitude } from './ephemeris'
import { calendarScale, yearScale } from './clockScales'
import { civilParts, dayBoundaries, zonedToUtc } from './time'
import { CALENDAR_RADIUS, ORBIT_SLOTS, radialScale } from '../geometry/projection'
import { PLANETS } from './bodies'

const DEG = 180 / Math.PI
const angDiff = (a: number, b: number) => {
  let d = ((a - b) * DEG) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}
/** General precession in longitude since J2000, degrees (IAU 2006, first-order). */
const precessionDeg = (ms: number) => (((ms - Date.UTC(2000, 0, 1, 12)) / 86400000 / 36525) * 5028.796) / 3600

describe('time zones', () => {
  it('converts civil midnight to UTC', () => {
    expect(new Date(zonedToUtc('Asia/Singapore', 2026, 1, 1)).toISOString()).toBe('2025-12-31T16:00:00.000Z')
    expect(new Date(zonedToUtc('Europe/London', 2026, 7, 1)).toISOString()).toBe('2026-06-30T23:00:00.000Z')
    expect(new Date(zonedToUtc('America/New_York', 2026, 3, 8, 12)).toISOString()).toBe('2026-03-08T16:00:00.000Z')
    expect(new Date(zonedToUtc('Australia/Sydney', 2026, 1, 1)).toISOString()).toBe('2025-12-31T13:00:00.000Z')
  })
  it('round-trips civil parts', () => {
    const t = zonedToUtc('America/New_York', 2028, 2, 29, 23, 30)
    const p = civilParts(t, 'America/New_York')
    expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2028, 2, 29, 23, 30])
  })
  it('handles leap years', () => {
    expect(dayBoundaries(2028, 'UTC')).toHaveLength(367)
    expect(dayBoundaries(2026, 'UTC')).toHaveLength(366)
    expect(dayBoundaries(2100, 'UTC')).toHaveLength(366)
    expect(dayBoundaries(2000, 'UTC')).toHaveLength(367)
  })
})

describe('Earth position against the seasons', () => {
  // At the March equinox the Sun is at apparent longitude 0° of date,
  // so Earth is at heliocentric longitude 180° of date.
  for (const year of [2000, 2024, 2026, 2050]) {
    it(`March equinox ${year}`, () => {
      const t = Astronomy.Seasons(year).mar_equinox.date.getTime()
      const lonJ2000 = helioLongitude('Earth', t) * DEG
      // Of-date longitude = J2000 + precession; allow for aberration (~20")
      expect(Math.abs(angDiff((lonJ2000 + precessionDeg(t)) / DEG, Math.PI))).toBeLessThan(0.02)
    })
  }
  it('June solstice 2026 puts Earth at 270° of date', () => {
    const t = Astronomy.Seasons(2026).jun_solstice.date.getTime()
    const lon = helioLongitude('Earth', t) * DEG + precessionDeg(t)
    expect(Math.abs(angDiff(lon / DEG, (270 / DEG)))).toBeLessThan(0.02)
  })
  it('equinox and solstice dates match published values', () => {
    const s = Astronomy.Seasons(2026)
    // USNO: 2026 Mar 20 14:46 UT, Jun 21 08:24 UT
    expect(Math.abs(s.mar_equinox.date.getTime() - Date.UTC(2026, 2, 20, 14, 46))).toBeLessThan(2 * 60000)
    expect(Math.abs(s.jun_solstice.date.getTime() - Date.UTC(2026, 5, 21, 8, 24))).toBeLessThan(2 * 60000)
  })
})

describe('planet positions against published oppositions', () => {
  // At opposition Earth and the planet share heliocentric longitude.
  const cases: Array<[string, number]> = [
    ['Jupiter', Date.UTC(2026, 0, 10)],
    ['Saturn', Date.UTC(2025, 8, 21)],
    ['Mars', Date.UTC(2025, 0, 16)],
    ['Uranus', Date.UTC(2025, 10, 21)],
    ['Neptune', Date.UTC(2025, 8, 23)],
  ]
  for (const [body, t] of cases) {
    it(`${body} opposition ${new Date(t).toISOString().slice(0, 10)}`, () => {
      const d = angDiff(helioLongitude(body, t), helioLongitude('Earth', t))
      expect(Math.abs(d)).toBeLessThan(1.0)
    })
  }
  it('distances are plausible', () => {
    const t = Date.UTC(2026, 9, 30)
    for (const p of PLANETS) {
      const h = helioEcliptic(p.body, t)
      expect(h.r / p.semiMajorAxisAu).toBeGreaterThan(0.7)
      expect(h.r / p.semiMajorAxisAu).toBeLessThan(1.3)
    }
  })
})

describe('calendar scale', () => {
  it('is calibrated to Earth, not uniform', () => {
    const cal = calendarScale(2026, 'UTC')
    const span = (i: number) => angDiff(cal.ticks[i + 1].lon, cal.ticks[i].lon)
    const jan = span(2) // 3 January, near perihelion
    const jul = span(184) // 4 July, near aphelion
    expect(jan).toBeGreaterThan(1.01)
    expect(jul).toBeLessThan(0.96)
    // A full year of ticks closes the circle to within a day's motion
    const total = cal.ticks.slice(0, -1).reduce((s, _t, i) => s + span(i), 0)
    expect(total).toBeGreaterThan(359)
    expect(total).toBeLessThan(361)
  })
  it('includes 29 February in leap years', () => {
    const cal = calendarScale(2028, 'Europe/London')
    expect(cal.ticks.some((t) => t.month === 2 && t.day === 29)).toBe(true)
    expect(cal.ticks).toHaveLength(367)
  })
  it('places the date inside the right day sector', () => {
    const tz = 'Asia/Singapore'
    const t = zonedToUtc(tz, 2026, 10, 30, 22, 0)
    const cal = calendarScale(2026, tz)
    const lon = helioLongitude('Earth', t)
    const i = cal.ticks.findIndex((tk, k) => k < cal.ticks.length - 1 && angDiff(lon, tk.lon) >= 0 && angDiff(cal.ticks[k + 1].lon, lon) > 0)
    expect(cal.ticks[i].month).toBe(10)
    expect(cal.ticks[i].day).toBe(30)
  })
})

describe('year scales', () => {
  for (const planet of ['jupiter', 'saturn', 'uranus', 'neptune'] as const) {
    it(`${planet} window spans less than one revolution`, () => {
      const ys = yearScale(planet, 2026, 'UTC')
      let total = 0
      for (let i = 1; i < ys.markers.length; i++) {
        const d = angDiff(ys.markers[i].lon, ys.markers[i - 1].lon)
        expect(d).toBeGreaterThan(0) // always prograde, so markers never fold back
        total += d
      }
      expect(total).toBeLessThan(360)
      expect(ys.markers.find((m) => m.current)?.year).toBe(2026)
    })
  }
  it('Jupiter year markers are not evenly spaced', () => {
    const ys = yearScale('jupiter', 2026, 'UTC')
    const spans = ys.markers.slice(1).map((m, i) => angDiff(m.lon, ys.markers[i].lon))
    expect(Math.max(...spans) - Math.min(...spans)).toBeGreaterThan(3)
  })
})

describe('body orientation', () => {
  it("Earth's pole is tilted 23.44° from ecliptic north", () => {
    const ax = bodyAxes('Earth', Date.UTC(2026, 0, 1))
    expect(Math.acos(ax.z.z) * DEG).toBeCloseTo(23.44, 1)
  })
  it("Earth's prime meridian faces the Sun near 12:00 UTC", () => {
    const t = Date.UTC(2026, 2, 20, 12, 7) // equation of time ≈ -7 min
    const ax = bodyAxes('Earth', t)
    const e = helioEcliptic('Earth', t)
    const toSun = { x: -e.x / e.r, y: -e.y / e.r, z: -e.z / e.r }
    const c = ax.x.x * toSun.x + ax.x.y * toSun.y + ax.x.z * toSun.z
    expect(Math.acos(Math.min(1, c)) * DEG).toBeLessThan(1)
  })
  it('axes are orthonormal and right-handed', () => {
    const ax = bodyAxes('Saturn', Date.UTC(2026, 5, 1))
    const cross = {
      x: ax.x.y * ax.y.z - ax.x.z * ax.y.y,
      y: ax.x.z * ax.y.x - ax.x.x * ax.y.z,
      z: ax.x.x * ax.y.y - ax.x.y * ax.y.x,
    }
    expect(cross.x).toBeCloseTo(ax.z.x, 9)
    expect(cross.y).toBeCloseTo(ax.z.y, 9)
    expect(cross.z).toBeCloseTo(ax.z.z, 9)
  })
})

describe('radial projection', () => {
  it('passes through every orbit slot and is monotone', () => {
    for (const p of PLANETS) expect(radialScale(p.semiMajorAxisAu)).toBeCloseTo(ORBIT_SLOTS[p.id], 6)
    let prev = -1
    for (let r = 0; r <= 31; r += 0.01) {
      const s = radialScale(r)
      expect(s).toBeGreaterThan(prev)
      prev = s
    }
  })
  it("keeps every planet's full orbit inside the calendar ring", () => {
    expect(radialScale(30.4)).toBeLessThan(CALENDAR_RADIUS - 0.45)
  })
})

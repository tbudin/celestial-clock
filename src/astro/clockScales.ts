import { PLANET_BY_ID, YEAR_SCALES, type YearPlanetId } from './bodies'
import { helioLongitude } from './ephemeris'
import { civilParts, dayBoundaries, monthDayFromDayOfYear, zonedToUtc } from './time'

/**
 * Calendar and year scales, expressed as heliocentric ecliptic longitudes.
 * Pure astronomy: no screen geometry here.
 */

export interface DayTick {
  /** Day of year, 1-based */
  doy: number
  month: number
  day: number
  /** Local midnight that starts this day (UTC ms) */
  startMs: number
  /** Earth's heliocentric longitude at startMs, radians */
  lon: number
}

export interface CalendarScale {
  year: number
  timeZone: string
  /** One tick per day, plus a final tick for 1 January of the next year */
  ticks: DayTick[]
}

/**
 * Earth's longitude at the start of every local day of `year`.
 * Not uniform: Earth moves faster near perihelion (early January).
 */
export function calendarScale(year: number, tz: string): CalendarScale {
  const bounds = dayBoundaries(year, tz)
  const ticks: DayTick[] = bounds.map((startMs, i) => {
    const doy = i + 1
    const md = i < bounds.length - 1 ? monthDayFromDayOfYear(year, doy) : { month: 1, day: 1 }
    return { doy, month: md.month, day: md.day, startMs, lon: helioLongitude('Earth', startMs) }
  })
  return { year, timeZone: tz, ticks }
}

export interface YearMarker {
  year: number
  /** Local 1 January 00:00 (UTC ms) */
  startMs: number
  /** Planet's heliocentric longitude at startMs, radians */
  lon: number
  /** Labelled (major) marker */
  major: boolean
  current: boolean
}

export interface YearScale {
  planet: YearPlanetId
  labelInterval: number
  /** First and last year shown. The window spans less than one revolution, */
  /** so every longitude on the scale maps to exactly one year. */
  fromYear: number
  toYear: number
  markers: YearMarker[]
}

/**
 * Year markers for a planet: its longitude on 1 January of each year, within
 * a window centred on the simulated year and strictly shorter than one orbit.
 * That window is the cycle context that removes the one-revolution ambiguity.
 */
export function yearScale(planet: YearPlanetId, simYear: number, tz: string): YearScale {
  const spec = YEAR_SCALES[planet]
  const period = PLANET_BY_ID[planet].periodYears
  // Number of whole years that fit in one revolution, minus a safety year
  const span = Math.floor(period) - 1
  const before = Math.floor(span / 2)
  const fromYear = simYear - before
  const toYear = fromYear + span
  const markers: YearMarker[] = []
  for (let y = fromYear; y <= toYear; y++) {
    const startMs = zonedToUtc(tz, y, 1, 1)
    markers.push({
      year: y,
      startMs,
      lon: helioLongitude(PLANET_BY_ID[planet].body, startMs),
      major: y % spec.labelInterval === 0,
      current: y === simYear,
    })
  }
  return { planet, labelInterval: spec.labelInterval, fromYear, toYear, markers }
}

/** Civil date components of the simulated instant in a zone. */
export function simDate(timeMs: number, tz: string) {
  return civilParts(timeMs, tz)
}

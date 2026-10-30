/**
 * Civil-time helpers. Astronomy runs on UTC timestamps (ms since epoch);
 * calendar dates belong to an IANA time zone. These are separate concepts:
 * a time zone gives civil time, never a geographic position.
 */

export interface CivilParts {
  year: number
  month: number // 1..12
  day: number // 1..31
  hour: number
  minute: number
  second: number
  weekday: number // 0 = Sunday
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
      era: 'short',
    })
    fmtCache.set(tz, f)
  }
  return f
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function civilParts(timeMs: number, tz: string): CivilParts {
  const parts = formatter(tz).formatToParts(new Date(timeMs))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  let year = Number(get('year'))
  if (get('era') === 'BC') year = 1 - year
  return {
    year,
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  }
}

/** Offset of the zone from UTC at the given instant, in ms (positive east of Greenwich). */
export function zoneOffsetMs(timeMs: number, tz: string): number {
  const p = civilParts(timeMs, tz)
  const asUtc = utcMs(p.year, p.month, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(timeMs / 1000) * 1000
}

function utcMs(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  const dt = new Date(Date.UTC(2000, mo - 1, d, h, mi, s))
  dt.setUTCFullYear(y)
  return dt.getTime()
}

/** UTC timestamp of a civil wall-clock time in `tz`. */
export function zonedToUtc(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const guess = utcMs(year, month, day, hour, minute, second)
  const off1 = zoneOffsetMs(guess, tz)
  let t = guess - off1
  const off2 = zoneOffsetMs(t, tz)
  if (off2 !== off1) t = guess - off2
  return t
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInYear(y: number): number {
  return isLeapYear(y) ? 366 : 365
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}

/** Day of year, 1-based. */
export function dayOfYear(y: number, m: number, d: number): number {
  let n = d
  for (let i = 1; i < m; i++) n += daysInMonth(y, i)
  return n
}

export function monthDayFromDayOfYear(y: number, doy: number): { month: number; day: number } {
  let rem = doy
  for (let m = 1; m <= 12; m++) {
    const dim = daysInMonth(y, m)
    if (rem <= dim) return { month: m, day: rem }
    rem -= dim
  }
  return { month: 12, day: 31 }
}

/**
 * Local midnights for every day of a civil year, plus the following 1 January.
 * Length is daysInYear + 1, so day `i` (0-based) spans [b[i], b[i+1]).
 */
export function dayBoundaries(year: number, tz: string): number[] {
  const out: number[] = []
  const n = daysInYear(year)
  for (let doy = 1; doy <= n; doy++) {
    const { month, day } = monthDayFromDayOfYear(year, doy)
    out.push(zonedToUtc(tz, year, month, day))
  }
  out.push(zonedToUtc(tz, year + 1, 1, 1))
  return out
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3))

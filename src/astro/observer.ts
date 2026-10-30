import * as Astronomy from 'astronomy-engine'

/**
 * Observer-dependent astronomy for the Earth and Moon panels.
 * All vectors are in the J2000 equatorial frame (EQJ), in AU, geocentric
 * unless stated. Pure functions: no React, no Three.
 */

export interface Location {
  latitude: number // degrees, north positive
  longitude: number // degrees, east positive
  elevationM?: number
}

export interface V3 {
  x: number
  y: number
  z: number
}

const v = (a: Astronomy.Vector): V3 => ({ x: a.x, y: a.y, z: a.z })
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const len = (a: V3) => Math.hypot(a.x, a.y, a.z)
const norm = (a: V3): V3 => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}
const DEG = Math.PI / 180

export function observerOf(loc: Location): Astronomy.Observer {
  return new Astronomy.Observer(loc.latitude, loc.longitude, loc.elevationM ?? 0)
}

export interface BodyFrame {
  /** Prime meridian, 90° east and north pole, unit vectors in EQJ */
  x: V3
  y: V3
  z: V3
}

export function bodyFrameEqj(body: string, timeMs: number): BodyFrame {
  const t = Astronomy.MakeTime(new Date(timeMs))
  const info = Astronomy.RotationAxis(body as Astronomy.Body, t)
  const n = v(info.north)
  const node = norm({ x: -n.y, y: n.x, z: 0 })
  const q = { x: n.y * node.z - n.z * node.y, y: n.z * node.x - n.x * node.z, z: n.x * node.y - n.y * node.x }
  const w = info.spin * DEG
  const c = Math.cos(w)
  const s = Math.sin(w)
  return {
    x: { x: node.x * c + q.x * s, y: node.y * c + q.y * s, z: node.z * c + q.z * s },
    y: { x: -node.x * s + q.x * c, y: -node.y * s + q.y * c, z: -node.z * s + q.z * c },
    z: n,
  }
}

/* ---------------------------------------------------------------- Earth -- */

export interface EarthView {
  /** Unit vector from Earth's centre to the observer (EQJ) */
  observerDir: V3
  /** Unit vector from Earth's centre to the Sun (EQJ) */
  sunDir: V3
  earthFrame: BodyFrame
  /** Sub-solar point, degrees */
  subsolar: { latitude: number; longitude: number }
  /** Sun altitude at the observer, degrees */
  sunAltitude: number
  sunAzimuth: number
  /** Local apparent solar time, hours 0..24 (12 = Sun on the meridian) */
  apparentSolarHours: number
  /** Local mean solar time, hours 0..24 */
  meanSolarHours: number
  /** Equation of time, minutes (apparent minus mean) */
  equationOfTimeMin: number
}

export function earthView(loc: Location, timeMs: number): EarthView {
  const date = new Date(timeMs)
  const t = Astronomy.MakeTime(date)
  const obs = observerOf(loc)
  const observerDir = norm(v(Astronomy.ObserverVector(t, obs, false)))
  const sunDir = norm(v(Astronomy.GeoVector(Astronomy.Body.Sun, t, true)))
  const eq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true)
  const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal')
  const gast = Astronomy.SiderealTime(t) // hours
  // Hour angle of the Sun at the observer: local sidereal time minus RA
  const ha = (((gast + loc.longitude / 15 - eq.ra) % 24) + 24) % 24
  const apparentSolarHours = (ha + 12) % 24
  // Mean solar time from UT
  const utHours = (timeMs / 3600000) % 24
  const meanSolarHours = (((utHours + loc.longitude / 15) % 24) + 24) % 24
  let eot = (apparentSolarHours - meanSolarHours) * 60
  if (eot > 720) eot -= 1440
  if (eot < -720) eot += 1440
  // Sub-solar point from the geocentric (of-date) Sun
  const geoEq = Astronomy.Equator(Astronomy.Body.Sun, t, new Astronomy.Observer(0, 0, 0), true, true)
  let sublon = (geoEq.ra - gast) * 15
  sublon = ((((sublon + 180) % 360) + 360) % 360) - 180
  return {
    observerDir,
    sunDir,
    earthFrame: bodyFrameEqj('Earth', timeMs),
    subsolar: { latitude: geoEq.dec, longitude: sublon },
    sunAltitude: hor.altitude,
    sunAzimuth: hor.azimuth,
    apparentSolarHours,
    meanSolarHours,
    equationOfTimeMin: eot,
  }
}

export interface SunTimes {
  sunrise: number | null
  sunset: number | null
  solarNoon: number | null
  /** Sun never rises / never sets on this day */
  polar: 'day' | 'night' | null
}

/** Rise, set and transit for the civil day that starts at `dayStartMs`. */
export function sunTimes(loc: Location, dayStartMs: number, dayEndMs: number): SunTimes {
  const obs = observerOf(loc)
  const start = new Date(dayStartMs)
  const days = (dayEndMs - dayStartMs) / 86400000
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, +1, start, days)
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, -1, start, days)
  const noon = Astronomy.SearchHourAngle(Astronomy.Body.Sun, obs, 0, start, +1)
  const noonMs = noon.time.date.getTime()
  let polar: SunTimes['polar'] = null
  if (!rise && !set) polar = noon.hor.altitude > 0 ? 'day' : 'night'
  return {
    sunrise: rise ? rise.date.getTime() : null,
    sunset: set ? set.date.getTime() : null,
    solarNoon: noonMs < dayEndMs ? noonMs : null,
    polar,
  }
}

/* ----------------------------------------------------------------- Moon -- */

export interface MoonView {
  /** Unit vector from the Moon to the observer (EQJ): the viewing direction reversed */
  toObserver: V3
  /** Unit vector from the Moon to the Sun (EQJ) */
  toSun: V3
  /** Observer's zenith, unit vector (EQJ). "Up" in the sky. */
  zenith: V3
  moonFrame: BodyFrame
  /** Topocentric distance, km */
  distanceKm: number
  altitude: number
  azimuth: number
  /** Sun-Moon elongation seen from the observer, degrees */
  elongation: number
  /** Phase angle (Sun-Moon-observer), degrees */
  phaseAngle: number
  /** Illuminated fraction 0..1 */
  illuminated: number
  /** Geocentric ecliptic phase, degrees: 0 new, 90 first quarter, 180 full, 270 last quarter */
  phaseLon: number
  /** Position angle of the bright limb's midpoint, from celestial north through east, degrees */
  brightLimbPA: number
  /** Parallactic angle, degrees */
  parallacticAngle: number
  /** Bright limb measured from the observer's zenith, through east (anticlockwise as seen), degrees */
  brightLimbFromZenith: number
  topocentric: { ra: number; dec: number }
  geocentric: { ra: number; dec: number }
}

const AU_KM = 149597870.7

export function moonView(loc: Location, timeMs: number): MoonView {
  const t = Astronomy.MakeTime(new Date(timeMs))
  const obs = observerOf(loc)
  const obsVec = v(Astronomy.ObserverVector(t, obs, false))
  const moonGeo = v(Astronomy.GeoVector(Astronomy.Body.Moon, t, true))
  const sunGeo = v(Astronomy.GeoVector(Astronomy.Body.Sun, t, true))
  const moonTopo = sub(moonGeo, obsVec)
  const toObserver = norm({ x: -moonTopo.x, y: -moonTopo.y, z: -moonTopo.z })
  const toSun = norm(sub(sunGeo, moonGeo))

  // Zenith: geodetic vertical, from a point 1 km above the observer
  const up = v(Astronomy.ObserverVector(t, new Astronomy.Observer(loc.latitude, loc.longitude, (loc.elevationM ?? 0) + 1000), false))
  const zenith = norm(sub(up, obsVec))

  const eqTopo = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true)
  const eqGeo = Astronomy.Equator(Astronomy.Body.Moon, t, new Astronomy.Observer(0, 0, 0), true, true)
  const sunEq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true)
  const hor = Astronomy.Horizon(t, obs, eqTopo.ra, eqTopo.dec, 'normal')

  // Phase angle and illumination seen from the observer
  const cosPhase = toObserver.x * toSun.x + toObserver.y * toSun.y + toObserver.z * toSun.z
  const phaseAngle = Math.acos(Math.max(-1, Math.min(1, cosPhase))) / DEG
  const illuminated = (1 + cosPhase) / 2
  const mt = norm(moonTopo)
  const st = norm(sub(sunGeo, obsVec))
  const elongation = Math.acos(Math.max(-1, Math.min(1, mt.x * st.x + mt.y * st.y + mt.z * st.z))) / DEG

  // Bright limb position angle (Meeus, Astronomical Algorithms, eq. 48.5), topocentric of-date
  const a0 = sunEq.ra * 15 * DEG
  const d0 = sunEq.dec * DEG
  const a = eqTopo.ra * 15 * DEG
  const d = eqTopo.dec * DEG
  const chi = Math.atan2(Math.cos(d0) * Math.sin(a0 - a), Math.sin(d0) * Math.cos(d) - Math.cos(d0) * Math.sin(d) * Math.cos(a0 - a))
  // Parallactic angle (Meeus eq. 14.1)
  const lst = Astronomy.SiderealTime(t) + loc.longitude / 15
  const H = (lst - eqTopo.ra) * 15 * DEG
  const phi = loc.latitude * DEG
  const q = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(d) - Math.sin(d) * Math.cos(H))
  const wrap = (x: number) => ((x % 360) + 360) % 360

  return {
    toObserver,
    toSun,
    zenith,
    moonFrame: bodyFrameEqj('Moon', timeMs),
    distanceKm: len(moonTopo) * AU_KM,
    altitude: hor.altitude,
    azimuth: hor.azimuth,
    elongation,
    phaseAngle,
    illuminated,
    phaseLon: Astronomy.MoonPhase(t),
    brightLimbPA: wrap(chi / DEG),
    parallacticAngle: q / DEG,
    brightLimbFromZenith: wrap((chi - q) / DEG),
    topocentric: { ra: eqTopo.ra, dec: eqTopo.dec },
    geocentric: { ra: eqGeo.ra, dec: eqGeo.dec },
  }
}

export function phaseName(phaseLon: number): string {
  const p = ((phaseLon % 360) + 360) % 360
  if (p < 6 || p >= 354) return 'New Moon'
  if (p < 84) return 'Waxing crescent'
  if (p < 96) return 'First quarter'
  if (p < 174) return 'Waxing gibbous'
  if (p < 186) return 'Full Moon'
  if (p < 264) return 'Waning gibbous'
  if (p < 276) return 'Last quarter'
  return 'Waning crescent'
}

export interface MoonEvents {
  moonrise: number | null
  moonset: number | null
  next: { name: string; timeMs: number }
}

const QUARTER_NAMES = ['New Moon', 'First quarter', 'Full Moon', 'Last quarter']

export function moonEvents(loc: Location, dayStartMs: number, dayEndMs: number, nowMs: number): MoonEvents {
  const obs = observerOf(loc)
  const start = new Date(dayStartMs)
  const days = (dayEndMs - dayStartMs) / 86400000
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, obs, +1, start, days)
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Moon, obs, -1, start, days)
  const mq = Astronomy.SearchMoonQuarter(new Date(nowMs))
  return {
    moonrise: rise ? rise.date.getTime() : null,
    moonset: set ? set.date.getTime() : null,
    next: { name: QUARTER_NAMES[mq.quarter], timeMs: mq.time.date.getTime() },
  }
}

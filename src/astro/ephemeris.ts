import * as Astronomy from 'astronomy-engine'

/**
 * Reference frame used everywhere in this project:
 * mean ecliptic and equinox of J2000 (astronomy-engine "ECL"), heliocentric, AU.
 *
 * Using one fixed frame keeps the calendar ring, year scales and planets
 * mutually consistent. Precession (about 50" a year) shifts the calendar
 * relative to this frame very slowly; the calendar is recomputed for each
 * simulated year, so this never misaligns the clock.
 */

const EQJ_TO_ECL = Astronomy.Rotation_EQJ_ECL()

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface HelioPosition extends Vec3 {
  /** Ecliptic longitude, radians, 0..2π */
  lon: number
  /** Ecliptic latitude, radians */
  lat: number
  /** Distance from the Sun, AU */
  r: number
  /** Distance projected onto the ecliptic plane, AU */
  rho: number
}

const TAU = Math.PI * 2

export function normaliseAngle(a: number): number {
  const m = a % TAU
  return m < 0 ? m + TAU : m
}

/** Heliocentric geometric position of a body in the J2000 ecliptic frame. */
export function helioEcliptic(body: string, timeMs: number): HelioPosition {
  const eqj = Astronomy.HelioVector(body as Astronomy.Body, new Date(timeMs))
  const v = Astronomy.RotateVector(EQJ_TO_ECL, eqj)
  const rho = Math.hypot(v.x, v.y)
  return {
    x: v.x,
    y: v.y,
    z: v.z,
    lon: normaliseAngle(Math.atan2(v.y, v.x)),
    lat: Math.atan2(v.z, rho),
    r: Math.hypot(rho, v.z),
    rho,
  }
}

export function helioLongitude(body: string, timeMs: number): number {
  return helioEcliptic(body, timeMs).lon
}

/**
 * Body-fixed orientation (IAU WGCCRE 2015 model) expressed in the J2000
 * ecliptic frame. Returns the three body axes:
 *  - `x`: prime meridian (longitude 0) on the equator
 *  - `y`: longitude 90° east on the equator
 *  - `z`: north pole
 */
export interface BodyAxes {
  x: Vec3
  y: Vec3
  z: Vec3
}

function rot(v: Astronomy.Vector): Vec3 {
  const r = Astronomy.RotateVector(EQJ_TO_ECL, v)
  return { x: r.x, y: r.y, z: r.z }
}

export function bodyAxes(body: string, timeMs: number): BodyAxes {
  const t = Astronomy.MakeTime(new Date(timeMs))
  const info = Astronomy.RotationAxis(body as Astronomy.Body, t)
  const n = info.north
  // Ascending node of the body equator on the ICRF equator: ẑ × n
  let nx = -n.y
  let ny = n.x
  const nl = Math.hypot(nx, ny) || 1
  nx /= nl
  ny /= nl
  // n × node
  const qx = n.y * 0 - n.z * ny
  const qy = n.z * nx - n.x * 0
  const qz = n.x * ny - n.y * nx
  const w = (info.spin * Math.PI) / 180
  const c = Math.cos(w)
  const s = Math.sin(w)
  const pm = new Astronomy.Vector(nx * c + qx * s, ny * c + qy * s, qz * s, t)
  const east = new Astronomy.Vector(-nx * s + qx * c, -ny * s + qy * c, qz * c, t)
  return { x: rot(pm), y: rot(east), z: rot(n) }
}

import { PLANETS, type PlanetId } from '../astro/bodies'
import { helioEcliptic } from '../astro/ephemeris'

/**
 * The single projection used by everything in the orrery: planets, orbits,
 * hands, ticks and labels.
 *
 * Heliocentric ecliptic position (λ, ρ) maps to the scene's ecliptic plane:
 *   scene.x =  f(ρ) cos λ
 *   scene.z = -f(ρ) sin λ      (so +λ runs anticlockwise seen from ecliptic north)
 *   scene.y =  0               (ecliptic latitude is not shown in the top-down view)
 *
 * f is a monotone radial compression. Angles are untouched, so every hand,
 * tick and planet sits at its exact ecliptic longitude.
 */

/** Scene radius of each planet's mean distance (design choice, scene units). */
export const ORBIT_SLOTS: Record<PlanetId, number> = {
  mercury: 1.0,
  venus: 1.45,
  earth: 1.95,
  mars: 2.45,
  jupiter: 3.35,
  saturn: 4.2,
  uranus: 5.0,
  neptune: 5.75,
}

export const CALENDAR_RADIUS = 6.5
export const CALENDAR_TICK_MINOR = 0.12
export const CALENDAR_TICK_MAJOR = 0.3
export const MONTH_LABEL_RADIUS = 6.62
/** Scene radius that must fit the canvas, before the px label margin */
export const SCENE_EXTENT = 6.72

// Monotone cubic (Fritsch-Carlson) through (distance AU, scene radius)
const knots: Array<[number, number]> = [
  [0, 0],
  ...PLANETS.map((p) => [p.semiMajorAxisAu, ORBIT_SLOTS[p.id]] as [number, number]),
]

const xs = knots.map((k) => k[0])
const ys = knots.map((k) => k[1])
const n = xs.length
const slopes: number[] = []
{
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  slopes.push(d[0])
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) slopes.push(0)
    else {
      const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1])
      const w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1])
      slopes.push((w1 + w2) / (w1 / d[i - 1] + w2 / d[i]))
    }
  }
  slopes.push(d[n - 2])
}

export function radialScale(rhoAu: number): number {
  if (rhoAu <= 0) return 0
  if (rhoAu >= xs[n - 1]) return ys[n - 1] + slopes[n - 1] * (rhoAu - xs[n - 1])
  let i = 0
  while (rhoAu > xs[i + 1]) i++
  const h = xs[i + 1] - xs[i]
  const t = (rhoAu - xs[i]) / h
  const t2 = t * t
  const t3 = t2 * t
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i] +
    (t3 - 2 * t2 + t) * h * slopes[i] +
    (-2 * t3 + 3 * t2) * ys[i + 1] +
    (t3 - t2) * h * slopes[i + 1]
  )
}

export interface ScenePoint {
  x: number
  y: number
  z: number
}

/** Point at scene radius `radius` in the direction of ecliptic longitude `lon`. */
export function polarToScene(lon: number, radius: number): ScenePoint {
  return { x: radius * Math.cos(lon), y: 0, z: -radius * Math.sin(lon) }
}

/** Project a heliocentric ecliptic position. */
export function projectHelio(lon: number, rhoAu: number): ScenePoint {
  return polarToScene(lon, radialScale(rhoAu))
}

/** Convert an ecliptic-frame direction vector to scene axes (for orientation, not position). */
export function eclipticDirToScene(v: { x: number; y: number; z: number }): ScenePoint {
  return { x: v.x, y: v.z, z: -v.y }
}

export function planetScenePosition(body: string, timeMs: number): ScenePoint & { lon: number } {
  const h = helioEcliptic(body, timeMs)
  return { ...projectHelio(h.lon, h.rho), lon: h.lon }
}

/**
 * Orbit path sampled through the same projection, centred on `timeMs`
 * and spanning one sidereal period.
 */
export function sampleOrbit(body: string, periodYears: number, timeMs: number, samples = 720): Float32Array {
  const periodMs = periodYears * 365.25 * 86400000
  const out = new Float32Array((samples + 1) * 3)
  for (let i = 0; i <= samples; i++) {
    const t = timeMs + (i / samples - 0.5) * periodMs
    const p = planetScenePosition(body, t)
    out[i * 3] = p.x
    out[i * 3 + 1] = p.y
    out[i * 3 + 2] = p.z
  }
  return out
}

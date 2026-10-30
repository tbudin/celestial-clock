/**
 * Static reference data for the bodies drawn by the clock.
 * Orbital figures are mean values (NASA planetary fact sheets) and are used
 * only for layout and scale choices. Actual positions always come from the
 * ephemeris in `ephemeris.ts`.
 */

export type PlanetId =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'

export type YearPlanetId = 'jupiter' | 'saturn' | 'uranus' | 'neptune'

export interface PlanetInfo {
  id: PlanetId
  name: string
  /** astronomy-engine body name */
  body: string
  /** Mean distance from the Sun, AU */
  semiMajorAxisAu: number
  /** Sidereal orbital period, Julian years */
  periodYears: number
  /** Equatorial radius, km */
  radiusKm: number
}

export const PLANETS: readonly PlanetInfo[] = [
  { id: 'mercury', name: 'Mercury', body: 'Mercury', semiMajorAxisAu: 0.387, periodYears: 0.2408, radiusKm: 2440 },
  { id: 'venus', name: 'Venus', body: 'Venus', semiMajorAxisAu: 0.723, periodYears: 0.6152, radiusKm: 6052 },
  { id: 'earth', name: 'Earth', body: 'Earth', semiMajorAxisAu: 1.0, periodYears: 1.0, radiusKm: 6378 },
  { id: 'mars', name: 'Mars', body: 'Mars', semiMajorAxisAu: 1.524, periodYears: 1.8809, radiusKm: 3396 },
  { id: 'jupiter', name: 'Jupiter', body: 'Jupiter', semiMajorAxisAu: 5.203, periodYears: 11.862, radiusKm: 71492 },
  { id: 'saturn', name: 'Saturn', body: 'Saturn', semiMajorAxisAu: 9.537, periodYears: 29.457, radiusKm: 60268 },
  { id: 'uranus', name: 'Uranus', body: 'Uranus', semiMajorAxisAu: 19.19, periodYears: 84.011, radiusKm: 25559 },
  { id: 'neptune', name: 'Neptune', body: 'Neptune', semiMajorAxisAu: 30.07, periodYears: 164.79, radiusKm: 24764 },
]

export const PLANET_BY_ID: Record<PlanetId, PlanetInfo> = Object.fromEntries(
  PLANETS.map((p) => [p.id, p]),
) as Record<PlanetId, PlanetInfo>

export interface YearScaleSpec {
  id: YearPlanetId
  /** Labelled marker every N years */
  labelInterval: number
}

export const YEAR_SCALES: Record<YearPlanetId, YearScaleSpec> = {
  jupiter: { id: 'jupiter', labelInterval: 1 },
  saturn: { id: 'saturn', labelInterval: 5 },
  uranus: { id: 'uranus', labelInterval: 10 },
  neptune: { id: 'neptune', labelInterval: 20 },
}

/** Saturn ring extent in Saturn equatorial radii (inner C ring to outer A ring). */
export const SATURN_RING_INNER = 1.239
export const SATURN_RING_OUTER = 2.27

/** Supported simulation range. Astronomy Engine (VSOP87 truncated) is valid far beyond this. */
export const MIN_YEAR = 1600
export const MAX_YEAR = 2400

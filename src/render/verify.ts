import * as THREE from 'three'
import type { RefObject } from 'react'
import type { Line2 } from 'three-stdlib'
import { PLANETS, PLANET_BY_ID, type PlanetId, type YearPlanetId } from '../astro/bodies'
import type { CalendarScale, YearScale } from '../astro/clockScales'
import { normaliseAngle } from '../astro/ephemeris'
import { sampleOrbit } from '../geometry/projection'
import { simClock } from '../sim/clock'

/**
 * Runtime alignment check, measured in screen pixels from the rendered
 * objects themselves (not from the inputs that placed them).
 * Exposed as window.__celestialClock.verify() for automated visual tests.
 */

interface Ctx {
  camera: THREE.Camera
  size: { width: number; height: number }
  objects: Record<PlanetId, { root: THREE.Object3D }>
  earthHand: RefObject<Line2 | null>
  yearHand: RefObject<Line2 | null>
  yearPlanet: YearPlanetId
  calendar: CalendarScale
  yearScale: YearScale
}

export interface AlignmentReport {
  viewport: { width: number; height: number }
  earth: HandReport & { dayIndex: number; month: number; day: number }
  year: HandReport & { planet: YearPlanetId; year: number }
  orbitOffsetsPx: Record<string, number>
}

interface HandReport {
  /** Perpendicular distance from the planet's rendered centre to its hand, px */
  centreToHandPx: number
  /** Planet centre lies between Sun and hand tip */
  planetOnHand: boolean
  /** Distance from planet centre to its drawn orbit path, px */
  centreToOrbitPx: number
  /** Hand direction, radians, scene ecliptic longitude */
  handLon: number
}

declare global {
  interface Window {
    __celestialClock?: { verify: () => AlignmentReport }
  }
}

export function installVerifier(ctx: Ctx) {
  const toPx = (v: THREE.Vector3) => {
    const p = v.clone().project(ctx.camera)
    return new THREE.Vector2(((p.x + 1) / 2) * ctx.size.width, ((1 - p.y) / 2) * ctx.size.height)
  }

  const handEnd = (line: Line2 | null) => {
    const attr = line?.geometry.attributes.instanceEnd as THREE.InterleavedBufferAttribute | undefined
    if (!attr) return new THREE.Vector3()
    return new THREE.Vector3(attr.getX(0), attr.getY(0), attr.getZ(0))
  }

  const orbitDistancePx = (id: PlanetId, centre: THREE.Vector2, t: number) => {
    const p = PLANET_BY_ID[id]
    // Orbit sampled independently around a different epoch than the frame, to test the path itself
    const arr = sampleOrbit(p.body, p.periodYears, t - p.periodYears * 365.25 * 86400000 * 0.37, 1440)
    let best = Infinity
    let prev: THREE.Vector2 | null = null
    for (let i = 0; i < arr.length; i += 3) {
      const q = toPx(new THREE.Vector3(arr[i], 0, arr[i + 2]))
      if (prev) best = Math.min(best, distToSegment(centre, prev, q))
      prev = q
    }
    return best
  }

  const handReport = (id: PlanetId, line: Line2 | null, t: number): HandReport => {
    const world = new THREE.Vector3()
    ctx.objects[id].root.getWorldPosition(world)
    const c = toPx(world)
    const sun = toPx(new THREE.Vector3())
    const endW = handEnd(line)
    const end = toPx(endW)
    const dir = end.clone().sub(sun)
    const rel = c.clone().sub(sun)
    const along = rel.dot(dir) / dir.lengthSq()
    return {
      centreToHandPx: Math.abs(dir.x * rel.y - dir.y * rel.x) / dir.length(),
      planetOnHand: along > 0 && along < 1,
      centreToOrbitPx: orbitDistancePx(id, c, t),
      handLon: normaliseAngle(Math.atan2(-endW.z, endW.x)),
    }
  }

  const sectorIndex = (lons: number[], lon: number) => {
    for (let i = 0; i < lons.length - 1; i++) {
      const a = normaliseAngle(lon - lons[i])
      const span = normaliseAngle(lons[i + 1] - lons[i])
      if (a < span) return i
    }
    return -1
  }

  window.__celestialClock = {
    verify: () => {
      const t = simClock.now()
      const earth = handReport('earth', ctx.earthHand.current, t)
      const dayIndex = sectorIndex(
        ctx.calendar.ticks.map((x) => x.lon),
        earth.handLon,
      )
      const tick = ctx.calendar.ticks[dayIndex]
      const year = handReport(ctx.yearPlanet, ctx.yearHand.current, t)
      const yi = sectorIndex(
        ctx.yearScale.markers.map((m) => m.lon),
        year.handLon,
      )
      const orbitOffsetsPx: Record<string, number> = {}
      for (const p of PLANETS) {
        const w = new THREE.Vector3()
        ctx.objects[p.id].root.getWorldPosition(w)
        orbitOffsetsPx[p.id] = Number(orbitDistancePx(p.id, toPx(w), t).toFixed(3))
      }
      return {
        viewport: { ...ctx.size },
        earth: { ...earth, dayIndex, month: tick?.month ?? -1, day: tick?.day ?? -1 },
        year: { ...year, planet: ctx.yearPlanet, year: ctx.yearScale.markers[yi]?.year ?? -1 },
        orbitOffsetsPx,
      }
    },
  }
  return () => {
    delete window.__celestialClock
  }
}

function distToSegment(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
  const ab = b.clone().sub(a)
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)))
  return p.distanceTo(a.clone().add(ab.multiplyScalar(t)))
}

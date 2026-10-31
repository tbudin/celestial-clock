import * as THREE from 'three'
import type { RefObject } from 'react'
import type { Line2 } from 'three-stdlib'
import { PLANETS, PLANET_BY_ID, type PlanetId, type YearPlanetId } from '../astro/bodies'
import type { CalendarScale, YearScale } from '../astro/clockScales'
import { normaliseAngle } from '../astro/ephemeris'
import { sampleOrbit } from '../geometry/projection'
import { DISPLAY_RADIUS, SUN_DISPLAY_RADIUS } from './planetFactory'
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
  labels: LabelReport
}

interface LabelReport {
  visible: number
  /** Pairs of visible labels whose boxes overlap */
  overlaps: string[]
  /** Visible labels covering a planet or the Sun */
  onBodies: string[]
  /** Visible labels crossing a clock hand */
  onHands: string[]
  /** Labels poking outside the orrery */
  clipped: string[]
  dateWindow: string
  yearWindow: string
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

  const labelReport = (): LabelReport => {
    const layer = document.querySelector('.label-layer')
    const base = layer?.getBoundingClientRect()
    const els = Array.from(document.querySelectorAll<HTMLElement>('.label-layer [data-label]')).filter((e) => e.dataset.visible === 'true')
    const boxes = els.map((e) => {
      const r = e.getBoundingClientRect()
      return { id: e.dataset.label!, x0: r.left - base!.left, y0: r.top - base!.top, x1: r.right - base!.left, y1: r.bottom - base!.top }
    })
    const overlaps: string[] = []
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a]
        const B = boxes[b]
        if (A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1) overlaps.push(`${A.id}/${B.id}`)
      }
    const zoom = (ctx.camera as THREE.OrthographicCamera).zoom
    const bodies = [{ id: 'sun', c: toPx(new THREE.Vector3()), r: SUN_DISPLAY_RADIUS * zoom }]
    for (const p of PLANETS) {
      const w = new THREE.Vector3()
      ctx.objects[p.id].root.getWorldPosition(w)
      bodies.push({ id: p.id, c: toPx(w), r: DISPLAY_RADIUS[p.id] * zoom })
    }
    const onBodies: string[] = []
    const onHands: string[] = []
    const clipped: string[] = []
    const sun = toPx(new THREE.Vector3())
    const hands = [handEnd(ctx.earthHand.current), handEnd(ctx.yearHand.current)].map((v) => toPx(v))
    for (const b of boxes) {
      if (b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > ctx.size.width + 0.5 || b.y1 > ctx.size.height + 0.5) clipped.push(b.id)
      for (const d of bodies) {
        const nx = Math.max(b.x0, Math.min(d.c.x, b.x1))
        const ny = Math.max(b.y0, Math.min(d.c.y, b.y1))
        if (Math.hypot(nx - d.c.x, ny - d.c.y) < d.r) onBodies.push(`${b.id}@${d.id}`)
      }
      if (b.id.endsWith('pill')) continue // windows sit on their own hand's tip
      hands.forEach((h, i) => {
        for (let k = 0; k <= 200; k++) {
          const x = sun.x + ((h.x - sun.x) * k) / 200
          const y = sun.y + ((h.y - sun.y) * k) / 200
          if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) {
            onHands.push(`${b.id}@${i === 0 ? 'earth' : 'year'}-hand`)
            break
          }
        }
      })
    }
    const text = (id: string) => document.querySelector<HTMLElement>(`.label-layer [data-label="${id}"]`)?.textContent ?? ''
    return { visible: boxes.length, overlaps, onBodies, onHands, clipped, dateWindow: text('date-pill'), yearWindow: text('year-pill') }
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
      const labels = labelReport()
      return {
        labels,
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

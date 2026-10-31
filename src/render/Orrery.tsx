import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2 } from 'three-stdlib'
import { PLANETS, PLANET_BY_ID, type PlanetId, type YearPlanetId } from '../astro/bodies'
import { bodyAxes, helioEcliptic, normaliseAngle } from '../astro/ephemeris'
import type { CalendarScale, YearScale } from '../astro/clockScales'
import { MONTH_SHORT } from '../astro/time'
import {
  CALENDAR_RADIUS,
  CALENDAR_TICK_MAJOR,
  CALENDAR_TICK_MINOR,
  SCENE_EXTENT,
  polarToScene,
  projectHelio,
  radialScale,
  sampleOrbit,
} from '../geometry/projection'
import { simClock } from '../sim/clock'
import { DISPLAY_RADIUS, SUN_DISPLAY_RADIUS, applyBodyAxes, createPlanetObject } from './planetFactory'
import { SATURN_RING_OUTER } from '../astro/bodies'
import { layoutLabels, radialCandidates, type Disc, type LabelRequest, type Pt, type Seg } from '../geometry/labelLayout'
import type { TextureSet } from './textures'
import { PALETTE } from './palette'
import { installVerifier } from './verify'

type V3 = [number, number, number]

/** Room kept around the calendar ring for month labels and the date window, px */
const LABEL_MARGIN_PX = 30

/** How far the year hand runs past its planet's orbit, scene units */
const YEAR_HAND_OVERSHOOT = 0.2

/**
 * Labels drawn in a DOM layer above the canvas and positioned every frame by
 * the layout engine (geometry/labelLayout.ts), so none can overlap each other,
 * a planet, the Sun or a hand.
 */
export type LabelKind = 'month' | 'year' | 'date-pill' | 'year-pill'

export interface LabelSpec {
  id: string
  kind: LabelKind
  text: string
  active?: boolean
  /** Ecliptic longitude of the anchor, radians (pills: taken from the hand each frame) */
  lon: number
  /** Scene radius of the anchor (pills: computed each frame) */
  radius: number
}

interface LabelStore {
  els: Map<string, HTMLElement>
  sizes: Map<string, { w: number; h: number }>
  previous: Map<string, number>
  shown: Map<string, string>
}

/** Stable initial points: a new array each render would make drei reset the hand geometry. */
const HAND_INITIAL: V3[] = [
  [0, 0, 0],
  [1, 0, 0],
]

export interface OrreryProps {
  textures: TextureSet
  calendar: CalendarScale
  yearScale: YearScale
  yearPlanet: YearPlanetId
  /** Index into calendar.ticks of the current day */
  currentDayIndex: number
  currentMonth: number
  /** Epoch (ms) the orbit paths are sampled around */
  orbitEpochMs: number
}

export function Orrery(props: OrreryProps) {
  const store = useMemo<LabelStore>(() => ({ els: new Map(), sizes: new Map(), previous: new Map(), shown: new Map() }), [])
  const specs = useLabelSpecs(props)

  // Measure label boxes after each render and once web fonts are ready
  useLayoutEffect(() => {
    const measure = () => {
      for (const s of specs) {
        const el = store.els.get(s.id)
        if (el) store.sizes.set(s.id, { w: el.offsetWidth, h: el.offsetHeight })
      }
    }
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
  }, [specs, store])

  return (
    <div className="orrery-stage">
      <Canvas
        orthographic
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 40, 0], up: [0, 0, -1], near: 1, far: 100, zoom: 40 }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
          camera.lookAt(0, 0, 0)
        }}
        style={{ background: PALETTE.background }}
      >
        <FitCamera />
        <ambientLight intensity={0.035} />
        <pointLight position={[0, 0, 0]} intensity={3.2} decay={0} />
        <Sun textures={props.textures} />
        <Orbits epochMs={props.orbitEpochMs} yearPlanet={props.yearPlanet} />
        <CalendarRing calendar={props.calendar} currentDayIndex={props.currentDayIndex} currentMonth={props.currentMonth} />
        <YearScaleMarks scale={props.yearScale} />
        <PlanetsAndHands
          textures={props.textures}
          yearPlanet={props.yearPlanet}
          calendar={props.calendar}
          yearScale={props.yearScale}
          specs={specs}
          store={store}
        />
      </Canvas>
      <div className="label-layer" aria-hidden="true">
        {specs.map((s) => (
          <span
            key={s.id}
            ref={(el) => {
              if (el) store.els.set(s.id, el)
              else store.els.delete(s.id)
            }}
            data-label={s.id}
            data-kind={s.kind}
            className={`scale-label ${s.kind}${s.active ? ' active' : ''}`}
          >
            {s.text}
          </span>
        ))}
      </div>
    </div>
  )
}

function monthSpans(calendar: CalendarScale) {
  const ticks = calendar.ticks
  return Array.from({ length: 12 }, (_, m) => {
    const start = ticks.find((t) => t.month === m + 1 && t.day === 1)!
    const nextIdx = m === 11 ? ticks.length - 1 : ticks.findIndex((t) => t.month === m + 2 && t.day === 1)
    let span = normaliseAngle(ticks[nextIdx].lon - start.lon)
    if (span === 0) span = Math.PI * 2
    return { month: m + 1, startLon: start.lon, span, mid: start.lon + span / 2 }
  })
}

function useLabelSpecs({ calendar, yearScale, currentDayIndex, currentMonth }: OrreryProps): LabelSpec[] {
  const day = calendar.ticks[currentDayIndex]?.day ?? 1
  return useMemo(() => {
    const out: LabelSpec[] = [
      { id: 'date-pill', kind: 'date-pill', text: `${day} ${MONTH_SHORT[currentMonth - 1].toUpperCase()}`, lon: 0, radius: CALENDAR_RADIUS },
      { id: 'year-pill', kind: 'year-pill', text: String(yearScale.fromYear), lon: 0, radius: 0 },
    ]
    for (const m of monthSpans(calendar)) {
      out.push({ id: `m${m.month}`, kind: 'month', text: MONTH_SHORT[m.month - 1].toUpperCase(), active: m.month === currentMonth, lon: m.mid, radius: CALENDAR_RADIUS })
    }
    const body = PLANET_BY_ID[yearScale.planet].body
    for (const mk of yearScale.markers) {
      if (!mk.major || mk.current) continue // the current year is read from the hand's window
      out.push({ id: `y${mk.year}`, kind: 'year', text: String(mk.year), lon: mk.lon, radius: radialScale(helioEcliptic(body, mk.startMs).rho) })
    }
    return out
  }, [calendar, yearScale, day, currentMonth])
}

/** Fit the whole instrument into the shorter side of the canvas. */
function FitCamera() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    // Month labels are nudged a fixed number of px outside the ring, so reserve
    // a px margin rather than a scene-unit one: it then holds at every size.
    cam.zoom = (Math.min(size.width, size.height) - 2 * LABEL_MARGIN_PX) / (2 * SCENE_EXTENT)
    cam.position.set(0, 40, 0)
    cam.up.set(0, 0, -1)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
  }, [camera, size])
  return null
}

function Sun({ textures }: { textures: TextureSet }) {
  const ref = useRef<THREE.Mesh>(null)
  const halo = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(128, 128, 30, 128, 128, 128)
    grd.addColorStop(0, 'rgba(255,214,150,0.35)')
    grd.addColorStop(0.45, 'rgba(255,190,110,0.08)')
    grd.addColorStop(1, 'rgba(255,170,90,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useFrame(() => {
    if (ref.current) applyBodyAxes(ref.current, bodyAxes('Sun', simClock.now()))
  })
  return (
    <group>
      <mesh ref={ref} scale={SUN_DISPLAY_RADIUS}>
        <sphereGeometry args={[1, 64, 32]} />
        <meshBasicMaterial map={textures.sun ?? null} color={textures.sun ? '#fff0d8' : '#f6c35b'} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[SUN_DISPLAY_RADIUS * 4.2, SUN_DISPLAY_RADIUS * 4.2]} />
        <meshBasicMaterial map={halo} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Orbits({ epochMs, yearPlanet }: { epochMs: number; yearPlanet: YearPlanetId }) {
  const paths = useMemo(
    () =>
      PLANETS.map((p) => {
        const arr = sampleOrbit(p.body, p.periodYears, epochMs, p.periodYears > 1 ? 1440 : 720)
        const pts: V3[] = []
        for (let i = 0; i < arr.length; i += 3) pts.push([arr[i], -0.02, arr[i + 2]])
        return { id: p.id, pts }
      }),
    [epochMs],
  )
  return (
    <group>
      {paths.map(({ id, pts }) => {
        const active = id === yearPlanet
        return (
          <Line
            key={id}
            points={pts}
            color={active ? PALETTE.yearHand : PALETTE.orbit}
            lineWidth={active ? 1.1 : 0.8}
            transparent
            opacity={active ? 0.55 : PALETTE.orbitOpacity}
            depthWrite={false}
          />
        )
      })}
    </group>
  )
}

function CalendarRing({
  calendar,
  currentDayIndex,
  currentMonth,
}: {
  calendar: CalendarScale
  currentDayIndex: number
  currentMonth: number
}) {
  const { minor, major, months, ring } = useMemo(() => {
    const minor: V3[] = []
    const major: V3[] = []
    const ticks = calendar.ticks
    for (let i = 0; i < ticks.length - 1; i++) {
      const t = ticks[i]
      const isMonthStart = t.day === 1
      const len = isMonthStart ? CALENDAR_TICK_MAJOR : t.day % 5 === 0 ? CALENDAR_TICK_MINOR * 1.6 : CALENDAR_TICK_MINOR
      const a = polarToScene(t.lon, CALENDAR_RADIUS)
      const b = polarToScene(t.lon, CALENDAR_RADIUS - len)
      ;(isMonthStart ? major : minor).push([a.x, 0, a.z], [b.x, 0, b.z])
    }
    const months = monthSpans(calendar)
    const ring: V3[] = []
    for (let i = 0; i <= 360; i++) {
      const p = polarToScene((i / 360) * Math.PI * 2, CALENDAR_RADIUS)
      ring.push([p.x, 0, p.z])
    }
    return { minor, major, months, ring }
  }, [calendar])

  const dayArc = useMemo(() => {
    const a = calendar.ticks[currentDayIndex]
    const b = calendar.ticks[currentDayIndex + 1]
    if (!a || !b) return null
    const span = normaliseAngle(b.lon - a.lon)
    const pts: V3[] = []
    for (let i = 0; i <= 8; i++) {
      const p = polarToScene(a.lon + (span * i) / 8, CALENDAR_RADIUS - 0.05)
      pts.push([p.x, 0.01, p.z])
    }
    return pts
  }, [calendar, currentDayIndex])

  const monthArc = useMemo(() => {
    const m = months[currentMonth - 1]
    const pts: V3[] = []
    for (let i = 0; i <= 64; i++) {
      const p = polarToScene(m.startLon + (m.span * i) / 64, CALENDAR_RADIUS + 0.07)
      pts.push([p.x, 0, p.z])
    }
    return pts
  }, [months, currentMonth])

  return (
    <group>
      <Line points={ring} color={PALETTE.tick} lineWidth={0.8} transparent opacity={0.45} />
      <Line points={minor} segments color={PALETTE.tick} lineWidth={0.8} transparent opacity={0.75} />
      <Line points={major} segments color={PALETTE.tickMajor} lineWidth={1.2} />
      <Line points={monthArc} color={PALETTE.earthHand} lineWidth={1.4} transparent opacity={0.6} />
      {dayArc && <Line points={dayArc} color={PALETTE.earthHand} lineWidth={4} />}
    </group>
  )
}

function YearScaleMarks({ scale }: { scale: YearScale }) {
  const planet = PLANET_BY_ID[scale.planet]
  const { minor, major } = useMemo(() => {
    const minor: V3[] = []
    const major: V3[] = []
    for (const m of scale.markers) {
      const r = radialScale(helioEcliptic(planet.body, m.startMs).rho)
      const half = m.major || m.current ? 0.11 : 0.06
      const a = polarToScene(m.lon, r - half)
      const b = polarToScene(m.lon, r + half)
      ;(m.major || m.current ? major : minor).push([a.x, 0.01, a.z], [b.x, 0.01, b.z])
    }
    return { minor, major }
  }, [scale, planet])

  return (
    <group>
      {minor.length > 0 && <Line points={minor} segments color={PALETTE.yearHand} lineWidth={0.9} transparent opacity={0.55} />}
      {major.length > 0 && <Line points={major} segments color={PALETTE.yearHand} lineWidth={1.4} />}
    </group>
  )
}

function PlanetsAndHands({
  textures,
  yearPlanet,
  calendar,
  yearScale,
  specs,
  store,
}: {
  textures: TextureSet
  yearPlanet: YearPlanetId
  calendar: CalendarScale
  yearScale: YearScale
  specs: LabelSpec[]
  store: LabelStore
}) {
  const objects = useMemo(() => {
    const map = {} as Record<PlanetId, ReturnType<typeof createPlanetObject>>
    for (const p of PLANETS) map[p.id] = createPlanetObject(p.id, textures, p.id === 'jupiter' || p.id === 'saturn' ? 96 : 64)
    return map
  }, [textures])
  useEffect(() => () => Object.values(objects).forEach((o) => o.dispose()), [objects])

  const earthHand = useRef<Line2>(null)
  const yearHand = useRef<Line2>(null)
  const earthDot = useRef<THREE.Mesh>(null)
  const { camera, size } = useThree()
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const t = simClock.now()
    let earthLon = 0
    let yearLon = 0
    let yearR = 0
    for (const p of PLANETS) {
      const o = objects[p.id]
      const h = helioEcliptic(p.body, t)
      const s = projectHelio(h.lon, h.rho)
      o.root.position.set(s.x, s.y, s.z)
      if (o.ringShadow) o.ringShadow.uPlanetCentre.value.copy(o.root.position) // Sun stays at the origin
      applyBodyAxes(o.body, bodyAxes(p.body, t))
      if (p.id === 'earth') earthLon = h.lon
      if (p.id === yearPlanet) {
        yearLon = h.lon
        yearR = radialScale(h.rho)
      }
    }
    // Hands are built from the same longitude and projection as the planets,
    // so they pass through each planet's rendered centre by construction.
    const e = polarToScene(earthLon, CALENDAR_RADIUS - 0.02)
    earthHand.current?.geometry.setPositions([0, 0.02, 0, e.x, 0.02, e.z])
    earthDot.current?.position.set(e.x, 0.03, e.z)
    const yEnd = yearR + YEAR_HAND_OVERSHOOT
    const y = polarToScene(yearLon, yEnd)
    yearHand.current?.geometry.setPositions([0, 0.02, 0, y.x, 0.02, y.z])

    // ---- Labels: project anchors and obstacles to px, lay out, write to the DOM
    const toPx = (x: number, z: number): Pt => {
      tmp.set(x, 0, z).project(camera)
      return { x: ((tmp.x + 1) / 2) * size.width, y: ((1 - tmp.y) / 2) * size.height }
    }
    const pxPerUnit = (camera as THREE.OrthographicCamera).zoom
    const centre = toPx(0, 0)
    const dir = (lon: number): Pt => ({ x: Math.cos(lon), y: -Math.sin(lon) })
    const discs: Disc[] = [{ ...centre, r: SUN_DISPLAY_RADIUS * pxPerUnit + 4 }]
    for (const p of PLANETS) {
      const pos = objects[p.id].root.position
      const r = DISPLAY_RADIUS[p.id] * (p.id === 'saturn' ? SATURN_RING_OUTER : 1)
      discs.push({ ...toPx(pos.x, pos.z), r: r * pxPerUnit + 3 })
    }
    const eTip = toPx(e.x, e.z)
    const yTip = toPx(y.x, y.z)
    const segs: Seg[] = [
      { x0: centre.x, y0: centre.y, x1: eTip.x, y1: eTip.y, half: 3 },
      { x0: centre.x, y0: centre.y, x1: yTip.x, y1: yTip.y, half: 3 },
    ]
    const requests: LabelRequest[] = []
    for (const s of specs) {
      const sz = store.sizes.get(s.id)
      if (!sz || sz.w === 0) continue
      if (s.kind === 'date-pill') {
        const a = toPx(polarToScene(earthLon, CALENDAR_RADIUS).x, polarToScene(earthLon, CALENDAR_RADIUS).z)
        requests.push({ id: s.id, w: sz.w, h: sz.h, priority: 0, pinned: true, candidates: radialCandidates(a, dir(earthLon), [5], sz.w, sz.h, [0, 10, -10, 20, -20]) })
      } else if (s.kind === 'year-pill') {
        requests.push({ id: s.id, w: sz.w, h: sz.h, priority: 0, pinned: true, candidates: radialCandidates(yTip, dir(yearLon), [3, 12, 22], sz.w, sz.h, [0, 10, -10]) })
      } else if (s.kind === 'month') {
        const p = polarToScene(s.lon, CALENDAR_RADIUS)
        requests.push({ id: s.id, w: sz.w, h: sz.h, priority: 1, candidates: radialCandidates(toPx(p.x, p.z), dir(s.lon), [6], sz.w, sz.h) })
      } else {
        const p = polarToScene(s.lon, s.radius)
        const a = toPx(p.x, p.z)
        const u = dir(s.lon)
        const out = radialCandidates(a, u, [6], sz.w, sz.h, [0, 7, -7])
        const inw = radialCandidates(a, { x: -u.x, y: -u.y }, [6], sz.w, sz.h, [0, 7, -7])
        requests.push({ id: s.id, w: sz.w, h: sz.h, priority: 2, candidates: [...out, ...inw] })
      }
    }
    const placed = layoutLabels(requests, { discs, segs }, { x0: 2, y0: 2, x1: size.width - 2, y1: size.height - 2 }, store.previous)
    const seen = new Set<string>()
    for (const pl of placed) {
      seen.add(pl.id)
      store.previous.set(pl.id, pl.candidate)
      const el = store.els.get(pl.id)
      if (!el) continue
      const key = pl.visible ? `${Math.round(pl.cx - pl.w / 2)},${Math.round(pl.cy - pl.h / 2)}` : 'hidden'
      if (store.shown.get(pl.id) === key) continue
      store.shown.set(pl.id, key)
      if (pl.visible) {
        el.style.transform = `translate3d(${Math.round(pl.cx - pl.w / 2)}px, ${Math.round(pl.cy - pl.h / 2)}px, 0)`
        el.dataset.visible = 'true'
      } else {
        el.dataset.visible = 'false'
      }
    }
    for (const s of specs) {
      if (!seen.has(s.id)) store.els.get(s.id)?.setAttribute('data-visible', 'false')
    }
  })

  useEffect(
    () => installVerifier({ camera, size, objects, earthHand, yearHand, yearPlanet, calendar, yearScale }),
    [camera, size, objects, yearPlanet, calendar, yearScale],
  )

  return (
    <group>
      <Line ref={earthHand} points={HAND_INITIAL} color={PALETTE.earthHand} lineWidth={1.4} />
      <Line ref={yearHand} points={HAND_INITIAL} color={PALETTE.yearHand} lineWidth={1.4} />
      <mesh ref={earthDot} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.045, 24]} />
        <meshBasicMaterial color={PALETTE.earthHand} toneMapped={false} />
      </mesh>
      {PLANETS.map((p) => (
        <primitive key={p.id} object={objects[p.id].root} />
      ))}
    </group>
  )
}

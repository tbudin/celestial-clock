import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type React from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
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
  MONTH_LABEL_RADIUS,
  SCENE_EXTENT,
  polarToScene,
  projectHelio,
  radialScale,
  sampleOrbit,
} from '../geometry/projection'
import { simClock } from '../sim/clock'
import { SUN_DISPLAY_RADIUS, applyBodyAxes, createPlanetObject } from './planetFactory'
import type { TextureSet } from './textures'
import { PALETTE } from './palette'
import { installVerifier } from './verify'

/** Which side of its orbit each year scale's labels sit on (chosen to clear neighbours). */
export const YEAR_LABEL_OFFSET: Record<YearPlanetId, number> = {
  jupiter: -0.3,
  saturn: -0.3,
  uranus: 0.26,
  neptune: -0.26,
}

type V3 = [number, number, number]

const LABEL_MARGIN_PX = 26

/** Push a label along its radial direction by a fixed number of CSS px, so text clears the ticks at any zoom. */
function radialNudge(lon: number, px: number): React.CSSProperties {
  return { transform: `translate(${(Math.cos(lon) * px).toFixed(2)}px, ${(-Math.sin(lon) * px).toFixed(2)}px)` }
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
  return (
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
      <PlanetsAndHands textures={props.textures} yearPlanet={props.yearPlanet} calendar={props.calendar} yearScale={props.yearScale} />
    </Canvas>
  )
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
    const months = Array.from({ length: 12 }, (_, m) => {
      const start = ticks.find((t) => t.month === m + 1 && t.day === 1)!
      const nextIdx = m === 11 ? ticks.length - 1 : ticks.findIndex((t) => t.month === m + 2 && t.day === 1)
      const end = ticks[nextIdx]
      let span = normaliseAngle(end.lon - start.lon)
      if (span === 0) span = Math.PI * 2
      const mid = start.lon + span / 2
      const p = polarToScene(mid, MONTH_LABEL_RADIUS)
      return { month: m + 1, pos: [p.x, 0, p.z] as V3, startLon: start.lon, span, mid }
    })
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
      {months.map((m) => (
        <Html key={m.month} position={m.pos} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <span className={m.month === currentMonth ? 'scale-label month active' : 'scale-label month'} style={radialNudge(m.mid, 12)}>
            {MONTH_SHORT[m.month - 1].toUpperCase()}
          </span>
        </Html>
      ))}
    </group>
  )
}

function YearScaleMarks({ scale }: { scale: YearScale }) {
  const planet = PLANET_BY_ID[scale.planet]
  const offset = YEAR_LABEL_OFFSET[scale.planet]
  const { minor, major, labels } = useMemo(() => {
    const minor: V3[] = []
    const major: V3[] = []
    const labels: Array<{ year: number; pos: V3; current: boolean; lon: number }> = []
    for (const m of scale.markers) {
      const r = radialScale(helioEcliptic(planet.body, m.startMs).rho)
      const half = m.major ? 0.11 : 0.06
      const a = polarToScene(m.lon, r - half)
      const b = polarToScene(m.lon, r + half)
      ;(m.major ? major : minor).push([a.x, 0.01, a.z], [b.x, 0.01, b.z])
      if (m.major || m.current) {
        const p = polarToScene(m.lon, r + offset)
        labels.push({ year: m.year, pos: [p.x, 0, p.z], current: m.current, lon: m.lon })
      }
    }
    return { minor, major, labels }
  }, [scale, planet, offset])

  return (
    <group>
      {minor.length > 0 && <Line points={minor} segments color={PALETTE.yearHand} lineWidth={0.9} transparent opacity={0.55} />}
      {major.length > 0 && <Line points={major} segments color={PALETTE.yearHand} lineWidth={1.4} />}
      {labels.map((l) => (
        <Html key={l.year} position={l.pos} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <span className={l.current ? 'scale-label year active' : 'scale-label year'} style={radialNudge(l.lon, Math.sign(offset) * 13)}>
            {l.year}
          </span>
        </Html>
      ))}
    </group>
  )
}

function PlanetsAndHands({
  textures,
  yearPlanet,
  calendar,
  yearScale,
}: {
  textures: TextureSet
  yearPlanet: YearPlanetId
  calendar: CalendarScale
  yearScale: YearScale
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

  const yearOffset = YEAR_LABEL_OFFSET[yearPlanet]

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
    const yEnd = yearR + Math.max(0.24, yearOffset > 0 ? yearOffset + 0.18 : 0.24)
    const y = polarToScene(yearLon, yEnd)
    yearHand.current?.geometry.setPositions([0, 0.02, 0, y.x, 0.02, y.z])
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

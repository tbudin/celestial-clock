import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { bodyFrameEqj, observerOf, type Location } from '../astro/observer'
import * as Astronomy from 'astronomy-engine'
import { simClock } from '../sim/clock'
import { applyAxesInWorld } from './planetFactory'
import { usePanelTextures } from './panelTextures'

/**
 * Observer-centred Earth. World frame = J2000 equatorial (EQJ).
 * The globe carries the IAU Earth orientation; the camera sits above the
 * observer, so the observer stays centred while the terminator, driven only
 * by the Sun's computed direction, sweeps across the globe.
 */

export const EARTH_CAMERA_DISTANCE = 5.2
export const EARTH_FOV = 30

const KEYS = ['earthDay', 'earthNight', 'earthRough'] as const

export function EarthGlobe({ location }: { location: Location }) {
  const tex = usePanelTextures(KEYS)
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: EARTH_FOV, near: 0.1, far: 50, position: [0, 0, EARTH_CAMERA_DISTANCE] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0
      }}
    >
      {tex.ready && <EarthScene location={location} textures={tex.textures} />}
    </Canvas>
  )
}

function EarthScene({ location, textures }: { location: Location; textures: Partial<Record<(typeof KEYS)[number], THREE.Texture>> }) {
  const earth = useRef<THREE.Group>(null)
  const light = useRef<THREE.DirectionalLight>(null)
  const { camera } = useThree()
  const sunView = useMemo(() => ({ value: new THREE.Vector3(1, 0, 0) }), [])
  const sunWorld = useMemo(() => ({ value: new THREE.Vector3(1, 0, 0) }), [])
  const observer = useMemo(() => observerOf(location), [location])

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: textures.earthDay ?? null,
      color: textures.earthDay ? 0xffffff : 0x2f5f95,
      roughnessMap: textures.earthRough ?? null,
      roughness: 1,
      metalness: 0,
      emissiveMap: textures.earthNight ?? null,
      emissive: new THREE.Color(textures.earthNight ? 0xffd9a8 : 0x000000),
      emissiveIntensity: 1.6,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uSunView = sunView
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunView;')
        .replace(
          '#include <emissivemap_fragment>',
          `#ifdef USE_EMISSIVEMAP
            vec3 night = texture2D( emissiveMap, vEmissiveMapUv ).rgb;
            // City lights only: drop the map's blue base, show them on the night side
            night = max(night - vec3(0.07, 0.07, 0.11), 0.0) * 1.4;
            float ndl = dot( normalize( normal ), uSunView );
            totalEmissiveRadiance *= night * (1.0 - smoothstep(-0.12, 0.08, ndl));
          #endif`,
        )
    }
    return m
  }, [textures, sunView])

  const atmosphere = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSun: sunWorld },
        vertexShader: `
          varying vec3 vN; varying vec3 vV; varying vec3 vWN;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWN = normalize(mat3(modelMatrix) * normal);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-(viewMatrix * wp).xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vWN;
          void main() {
            float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
            float lit = smoothstep(-0.25, 0.35, dot(vWN, uSun));
            vec3 day = vec3(0.35, 0.6, 1.0);
            vec3 dusk = vec3(1.0, 0.55, 0.3);
            float twilight = (1.0 - abs(dot(vWN, uSun))) * lit;
            vec3 col = mix(day, dusk, pow(twilight, 3.0) * 0.6);
            gl_FragColor = vec4(col * rim * lit * 1.15, rim * lit);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [sunWorld],
  )

  const tmp = useMemo(() => ({ up: new THREE.Vector3(), obs: new THREE.Vector3(), n: new THREE.Vector3() }), [])

  useFrame(() => {
    const t = simClock.now()
    const time = Astronomy.MakeTime(new Date(t))
    const frame = bodyFrameEqj('Earth', t)
    if (earth.current) applyAxesInWorld(earth.current, frame)
    const o = Astronomy.ObserverVector(time, observer, false)
    tmp.obs.set(o.x, o.y, o.z).normalize()
    const s = Astronomy.GeoVector(Astronomy.Body.Sun, time, true)
    sunWorld.value.set(s.x, s.y, s.z).normalize()
    light.current?.position.copy(sunWorld.value).multiplyScalar(20)
    // Camera above the observer, Earth's north pole up
    camera.position.copy(tmp.obs).multiplyScalar(EARTH_CAMERA_DISTANCE)
    tmp.n.set(frame.z.x, frame.z.y, frame.z.z)
    tmp.up.copy(tmp.n).addScaledVector(tmp.obs, -tmp.n.dot(tmp.obs))
    if (tmp.up.lengthSq() < 1e-8) tmp.up.set(0, 1, 0).addScaledVector(tmp.obs, -tmp.obs.y)
    camera.up.copy(tmp.up.normalize())
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    sunView.value.copy(sunWorld.value).transformDirection(camera.matrixWorldInverse)
  })

  return (
    <>
      <ambientLight intensity={0.015} />
      <directionalLight ref={light} intensity={3.4} />
      <group ref={earth}>
        <mesh material={material}>
          <sphereGeometry args={[1, 128, 64]} />
        </mesh>
      </group>
      <mesh material={atmosphere} scale={1.022}>
        <sphereGeometry args={[1, 96, 48]} />
      </mesh>
    </>
  )
}

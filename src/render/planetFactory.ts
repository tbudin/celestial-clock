import * as THREE from 'three'
import { SATURN_RING_INNER, SATURN_RING_OUTER, type PlanetId } from '../astro/bodies'
import type { BodyAxes } from '../astro/ephemeris'
import { eclipticDirToScene } from '../geometry/projection'
import { FALLBACK_COLOURS, type TextureSet } from './textures'

/**
 * One factory for planet models, used by the orrery and by the
 * planet-selector thumbnails, so both show the same object.
 *
 * Display radii are exaggerated (scene units). Distances are compressed
 * separately in projection.ts. Neither is to astronomical scale.
 */
export const DISPLAY_RADIUS: Record<PlanetId, number> = {
  mercury: 0.075,
  venus: 0.115,
  earth: 0.125,
  mars: 0.095,
  jupiter: 0.27,
  saturn: 0.21,
  uranus: 0.16,
  neptune: 0.16,
}

export const SUN_DISPLAY_RADIUS = 0.42

const sphereCache = new Map<number, THREE.SphereGeometry>()
function sphere(segments: number) {
  let g = sphereCache.get(segments)
  if (!g) {
    g = new THREE.SphereGeometry(1, segments, Math.round(segments / 2))
    sphereCache.set(segments, g)
  }
  return g
}

function ringGeometry(inner: number, outer: number): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(inner, outer, 192, 1)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i))
    uv.setXY(i, (r - inner) / (outer - inner), 0.5)
  }
  // Lie in the local XZ plane: the body's equator (local +Y is the north pole)
  g.rotateX(-Math.PI / 2)
  return g
}

export interface RingShadowUniforms {
  /** Planet centre, world space */
  uPlanetCentre: { value: THREE.Vector3 }
  /** Planet radius, world units */
  uPlanetRadius: { value: number }
  /** Sun position, world space (far away for a directional light) */
  uSunPos: { value: THREE.Vector3 }
}

export interface PlanetObject {
  /** Present for Saturn: update each frame so the globe's shadow falls on the rings */
  ringShadow?: RingShadowUniforms
  /** Positioned in the orrery (translation only) */
  root: THREE.Group
  /** Oriented to the body's real pole and prime meridian */
  body: THREE.Group
  dispose: () => void
}

export function createPlanetObject(id: PlanetId, textures: TextureSet, segments = 64): PlanetObject {
  const radius = DISPLAY_RADIUS[id]
  const root = new THREE.Group()
  root.name = id
  const body = new THREE.Group()
  root.add(body)

  const map = textures[id]
  const material = new THREE.MeshStandardMaterial({
    map: map ?? null,
    color: map ? 0xffffff : FALLBACK_COLOURS[id],
    roughness: 1,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(sphere(segments), material)
  mesh.scale.setScalar(radius)
  body.add(mesh)

  const disposables: Array<{ dispose: () => void }> = [material]
  let ringShadow: RingShadowUniforms | undefined

  if (id === 'saturn') {
    const ringMap = textures.saturnRing
    const ringMat = new THREE.MeshStandardMaterial({
      map: ringMap ?? null,
      color: ringMap ? 0xffffff : FALLBACK_COLOURS.saturnRing,
      transparent: true,
      opacity: ringMap ? 1 : 0.6,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: ringMap ?? null,
      emissiveIntensity: 0.12,
    })
    ringShadow = {
      uPlanetCentre: { value: new THREE.Vector3() },
      uPlanetRadius: { value: radius },
      uSunPos: { value: new THREE.Vector3() },
    }
    const u = ringShadow
    ringMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRingWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvRingWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vRingWorld;
          uniform vec3 uPlanetCentre; uniform float uPlanetRadius; uniform vec3 uSunPos;
          float ringShadowFactor() {
            // Ray from this ring point towards the Sun: does it hit the globe?
            vec3 d = normalize(uSunPos - vRingWorld);
            vec3 oc = vRingWorld - uPlanetCentre;
            float b = dot(oc, d);
            float c = dot(oc, oc) - uPlanetRadius * uPlanetRadius;
            float h = b * b - c;
            if (h <= 0.0 || b > 0.0) return 1.0;
            // Soften the umbra edge slightly
            return mix(1.0, 0.08, smoothstep(0.0, 0.05 * uPlanetRadius * uPlanetRadius, h));
          }`,
        )
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat rsf = ringShadowFactor();\ndiffuseColor.rgb *= rsf;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= rsf;')
    }
    const ringGeo = ringGeometry(radius * SATURN_RING_INNER, radius * SATURN_RING_OUTER)
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.renderOrder = 2
    body.add(ring)
    disposables.push(ringMat, ringGeo)
  }

  return { root, body, ringShadow, dispose: () => disposables.forEach((d) => d.dispose()) }
}

const _m = new THREE.Matrix4()
const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()

/**
 * Orient a body group from IAU axes given in the ecliptic frame.
 * Three's SphereGeometry puts texture longitude 0 at local +X and the north
 * pole at local +Y; east longitude 90° falls at local -Z.
 */
export function applyBodyAxes(target: THREE.Object3D, axes: BodyAxes) {
  applyAxesInWorld(target, {
    x: eclipticDirToScene(axes.x),
    y: eclipticDirToScene(axes.y),
    z: eclipticDirToScene(axes.z),
  })
}

/** Same as applyBodyAxes, for axes already expressed in world coordinates. */
export function applyAxesInWorld(target: THREE.Object3D, axes: BodyAxes) {
  const px = axes.x
  const py = axes.y
  const pz = axes.z
  _x.set(px.x, px.y, px.z)
  _y.set(pz.x, pz.y, pz.z)
  _z.set(-py.x, -py.y, -py.z)
  _m.makeBasis(_x, _y, _z)
  target.quaternion.setFromRotationMatrix(_m)
}

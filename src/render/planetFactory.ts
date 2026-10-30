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

export interface PlanetObject {
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
    const ringGeo = ringGeometry(radius * SATURN_RING_INNER, radius * SATURN_RING_OUTER)
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.renderOrder = 2
    body.add(ring)
    disposables.push(ringMat, ringGeo)
  }

  return { root, body, dispose: () => disposables.forEach((d) => d.dispose()) }
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
  const px = eclipticDirToScene(axes.x)
  const py = eclipticDirToScene(axes.y)
  const pz = eclipticDirToScene(axes.z)
  _x.set(px.x, px.y, px.z)
  _y.set(pz.x, pz.y, pz.z)
  _z.set(-py.x, -py.y, -py.z)
  _m.makeBasis(_x, _y, _z)
  target.quaternion.setFromRotationMatrix(_m)
}

import * as THREE from 'three'
import { SATURN_RING_OUTER, type YearPlanetId } from '../astro/bodies'
import { bodyAxes } from '../astro/ephemeris'
import { DISPLAY_RADIUS, applyBodyAxes, createPlanetObject } from './planetFactory'
import type { TextureSet } from './textures'

/**
 * Pre-render the planet-selector thumbnails from the same models the orrery
 * uses, lit from the side and viewed from just above the ecliptic so Saturn's
 * rings show their real tilt. One short-lived WebGL context, then disposed.
 */
export function renderThumbnails(textures: TextureSet, timeMs: number, sizePx = 160): Record<YearPlanetId, string> {
  const ids: YearPlanetId[] = ['jupiter', 'saturn', 'uranus', 'neptune']
  const out = {} as Record<YearPlanetId, string>
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = sizePx
  let renderer: THREE.WebGLRenderer | null = null
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  } catch {
    return out
  }
  renderer.setPixelRatio(1)
  renderer.setSize(sizePx, sizePx, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setClearColor(0x000000, 0)

  for (const id of ids) {
    const scene = new THREE.Scene()
    const obj = createPlanetObject(id, textures, 96)
    applyBodyAxes(obj.body, bodyAxes(id[0].toUpperCase() + id.slice(1), timeMs))
    scene.add(obj.root)
    const r = DISPLAY_RADIUS[id]
    const extent = id === 'saturn' ? r * SATURN_RING_OUTER * 1.06 : r * 1.12
    const cam = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0.01, 10)
    // View from within the ecliptic plane, from the side the north pole leans
    // towards. Rings then open by the planet's true obliquity (26.7° for Saturn),
    // the widest opening ever seen from the Sun's direction.
    const pole = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.body.quaternion)
    const h = new THREE.Vector3(pole.x, 0, pole.z)
    if (h.lengthSq() < 1e-6) h.set(1, 0, 0)
    h.normalize()
    cam.position.copy(h).multiplyScalar(3)
    cam.up.set(0, 1, 0)
    cam.lookAt(0, 0, 0)
    // Sunlight from the viewer's left: a three-quarter phase
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), h).normalize()
    const light = new THREE.DirectionalLight(0xffffff, 3.2)
    light.position.copy(h).multiplyScalar(1.2).addScaledVector(side, -1.6).add(new THREE.Vector3(0, 0.3, 0))
    scene.add(light, new THREE.AmbientLight(0xffffff, 0.05))
    if (obj.ringShadow) obj.ringShadow.uSunPos.value.copy(light.position).multiplyScalar(1000)
    renderer.render(scene, cam)
    out[id] = canvas.toDataURL('image/png')
    obj.dispose()
  }
  renderer.dispose()
  renderer.forceContextLoss()
  return out
}

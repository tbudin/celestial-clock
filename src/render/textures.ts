import * as THREE from 'three'

/**
 * Self-hosted texture loading with visible failure handling.
 * Textures live in /public/textures (see ATTRIBUTION.md there).
 */

export const TEXTURE_URLS = {
  sun: '/textures/sun_1k.jpg',
  mercury: '/textures/mercury_1k.jpg',
  venus: '/textures/venus_1k.jpg',
  earth: '/textures/earth_1k.jpg',
  mars: '/textures/mars_1k.jpg',
  jupiter: '/textures/jupiter_1k.jpg',
  saturn: '/textures/saturn_1k.jpg',
  uranus: '/textures/uranus_1k.jpg',
  neptune: '/textures/neptune_1k.jpg',
  saturnRing: '/textures/saturn_ring.png',
} as const

export type TextureKey = keyof typeof TEXTURE_URLS

/** Fallback colours, used only if a texture fails to load. */
export const FALLBACK_COLOURS: Record<TextureKey, string> = {
  sun: '#f6c35b',
  mercury: '#8c8680',
  venus: '#d8c49a',
  earth: '#3f6fa8',
  mars: '#b5603a',
  jupiter: '#c9a983',
  saturn: '#d7c08f',
  uranus: '#a6d6dc',
  neptune: '#4d6fc4',
  saturnRing: '#bfae8a',
}

export type TextureSet = Partial<Record<TextureKey, THREE.Texture>>

export interface TextureLoadResult {
  textures: TextureSet
  failed: TextureKey[]
}

const loader = new THREE.TextureLoader()
let cache: Promise<TextureLoadResult> | null = null

export function loadTextures(): Promise<TextureLoadResult> {
  if (cache) return cache
  cache = (async () => {
    const textures: TextureSet = {}
    const failed: TextureKey[] = []
    await Promise.all(
      (Object.keys(TEXTURE_URLS) as TextureKey[]).map(
        (key) =>
          new Promise<void>((resolve) => {
            loader.load(
              TEXTURE_URLS[key],
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace
                tex.anisotropy = 4
                if (key === 'saturnRing') {
                  tex.wrapS = THREE.ClampToEdgeWrapping
                  tex.wrapT = THREE.ClampToEdgeWrapping
                }
                textures[key] = tex
                resolve()
              },
              undefined,
              () => {
                failed.push(key)
                console.error(`[celestial-clock] Texture failed to load: ${TEXTURE_URLS[key]}`)
                resolve()
              },
            )
          }),
      ),
    )
    return { textures, failed }
  })()
  return cache
}

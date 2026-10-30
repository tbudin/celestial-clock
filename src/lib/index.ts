/**
 * Embeddable React entry point.
 *
 *   import { CelestialClock } from 'celestial-clock'
 *   <CelestialClock view="orrery" useUrl={false} />
 *
 * Textures are fetched from /textures/ on the host page: copy public/textures
 * into your public folder.
 */
import '../index.css'
export { default as CelestialClock, type CelestialClockProps, type ViewMode } from '../App'
export { SimClock, simClock, SPEEDS } from '../sim/clock'
export * as astro from '../astro'

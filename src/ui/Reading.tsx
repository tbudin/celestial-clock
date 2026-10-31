import type { YearPlanetId } from '../astro/bodies'
import { PLANET_BY_ID } from '../astro/bodies'
import { MONTH_NAMES, type CivilParts } from '../astro/time'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The four readings, each keyed by colour to the hand that shows it:
 * hour (blue) on the Earth dial, day and month (green) on the calendar ring,
 * year (gold) on the selected planet's orbit.
 */
export function Reading({ parts, doy, zone, yearPlanet }: { parts: CivilParts; doy: number; zone: string; yearPlanet: YearPlanetId }) {
  return (
    <section className="reading" aria-label="Current reading">
      <div className="reading-cell hour">
        <span className="reading-label">Hour</span>
        <span className="reading-value mono">
          {pad(parts.hour)}:{pad(parts.minute)}
          <span className="secs">:{pad(parts.second)}</span>
        </span>
        <span className="reading-source">Earth’s rotation · {zone}</span>
      </div>
      <div className="reading-cell day">
        <span className="reading-label">Day</span>
        <span className="reading-value">
          {parts.day} <span className="reading-weekday">{WEEKDAYS[parts.weekday]}</span>
        </span>
        <span className="reading-source">Earth’s orbit · day {doy}</span>
      </div>
      <div className="reading-cell month">
        <span className="reading-label">Month</span>
        <span className="reading-value">{MONTH_NAMES[parts.month - 1]}</span>
        <span className="reading-source">Earth’s orbit</span>
      </div>
      <div className="reading-cell year">
        <span className="reading-label">Year</span>
        <span className="reading-value mono">{parts.year}</span>
        <span className="reading-source">{PLANET_BY_ID[yearPlanet].name}’s orbit</span>
      </div>
    </section>
  )
}

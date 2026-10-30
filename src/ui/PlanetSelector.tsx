import { PLANET_BY_ID, type YearPlanetId } from '../astro/bodies'

const ORDER: YearPlanetId[] = ['jupiter', 'saturn', 'uranus', 'neptune']

export function PlanetSelector({
  value,
  onChange,
  thumbnails,
}: {
  value: YearPlanetId
  onChange: (id: YearPlanetId) => void
  thumbnails: Partial<Record<YearPlanetId, string>>
}) {
  return (
    <div className="planet-selector" role="radiogroup" aria-label="Year hand planet">
      {ORDER.map((id) => {
        const p = PLANET_BY_ID[id]
        const selected = id === value
        return (
          <button
            key={id}
            role="radio"
            aria-checked={selected}
            className={selected ? 'planet-btn selected' : 'planet-btn'}
            onClick={() => onChange(id)}
          >
            <span className="planet-thumb">
              {thumbnails[id] ? <img src={thumbnails[id]} alt="" draggable={false} /> : <span className="thumb-placeholder" />}
            </span>
            <span className="planet-meta">
              <span className="planet-name">{p.name}</span>
              <span className="planet-period">
                {p.periodYears.toFixed(p.periodYears < 100 ? 1 : 0)}-year orbit
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

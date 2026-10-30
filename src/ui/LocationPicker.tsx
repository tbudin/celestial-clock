import { useState } from 'react'
import { CITIES, formatLatLon, type Place } from '../astro/places'

const SOURCE_LABEL: Record<Place['source'], string> = {
  device: 'Your location',
  city: 'Selected city',
  custom: 'Custom coordinates',
  approximate: 'Approximate, from your time zone',
}

export function LocationPicker({
  place,
  onChange,
  onUseDevice,
  geoStatus,
}: {
  place: Place
  onChange: (p: Place) => void
  onUseDevice: () => void
  geoStatus: 'idle' | 'pending' | 'denied' | 'unavailable' | 'granted'
}) {
  const [custom, setCustom] = useState(false)
  const [lat, setLat] = useState(String(place.latitude.toFixed(4)))
  const [lon, setLon] = useState(String(place.longitude.toFixed(4)))

  const cityValue = place.source === 'city' ? place.name : ''

  return (
    <div className="location">
      <div className="location-now">
        <span className="location-name">{place.name}</span>
        <span className="location-meta">
          {formatLatLon(place.latitude, place.longitude)} ·{' '}
          <span className={place.source === 'approximate' ? 'approx' : undefined}>{SOURCE_LABEL[place.source]}</span>
        </span>
      </div>
      <div className="location-actions">
        <button className="chip" onClick={onUseDevice} disabled={geoStatus === 'pending'}>
          {geoStatus === 'pending' ? 'Locating…' : 'Use my location'}
        </button>
        <select
          className="select"
          aria-label="City"
          value={cityValue}
          onChange={(e) => {
            const c = CITIES.find((x) => x.name === e.target.value)
            if (c) {
              setCustom(false)
              onChange({ ...c, source: 'city' })
            }
          }}
        >
          <option value="" disabled>
            Choose a city
          </option>
          {CITIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <button className={custom ? 'chip active' : 'chip'} onClick={() => setCustom((v) => !v)}>
          Coordinates
        </button>
      </div>
      {geoStatus === 'denied' && <p className="location-note">Location permission was declined. Choose a city or enter coordinates.</p>}
      {geoStatus === 'unavailable' && <p className="location-note">Your device could not provide a location. Choose a city or enter coordinates.</p>}
      {custom && (
        <form
          className="coords"
          onSubmit={(e) => {
            e.preventDefault()
            const la = Number(lat)
            const lo = Number(lon)
            if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
              onChange({ name: formatLatLon(la, lo), latitude: la, longitude: lo, timeZone: place.timeZone, source: 'custom' })
            }
          }}
        >
          <label>
            Latitude
            <input className="year-input mono" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
          </label>
          <label>
            Longitude
            <input className="year-input mono" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />
          </label>
          <button className="chip" type="submit">
            Set
          </button>
          <span className="location-note">Civil time stays on {place.timeZone}.</span>
        </form>
      )}
    </div>
  )
}

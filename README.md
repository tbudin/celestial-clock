# Celestial Clock

An astronomical clock that tells the time from the real positions of the Sun, Earth, Moon and planets.
Look at Earth to read the date. Look at Jupiter to read the year. Look at the Sun's light on Earth to read the hour.

Live: https://celestial-clock.vercel.app

## Using it

- **Earth panel:** the globe faces your location (green ring, always centred). The terminator comes from the Sun's computed direction. The 24-hour dial has noon at the top: the white hand is civil time, the gold dot is local apparent solar time, the gold arc is daylight (sunrise to sunset, civil time).
- **Moon panel:** the Moon as it stands in your sky, zenith up. Phase, the angle of the bright limb, libration and northern/southern-hemisphere orientation all come from the geometry.
- **Orrery:** green hand Sun → Earth → calendar ring reads the date; gold hand Sun → planet reads the year. Choose Jupiter, Saturn, Uranus or Neptune for the year hand.
- **Location:** uses your device location only if permission is already granted (or you tap "Use my location"). Otherwise it uses a representative city for your time zone and labels it "Approximate". You can pick a city or type coordinates. Civil time follows the location's time zone; custom coordinates keep the current zone.

### URL options

| Parameter | Example | Effect |
| --- | --- | --- |
| `view` | `full` (default), `ambient`, `orrery`, `earth`, `moon` | Which parts to show. `ambient` is a full-screen display with no controls. |
| `lat`, `lon` | `lat=51.5074&lon=-0.1278` | Observer location |
| `tz` | `Europe/London` | Time zone for civil time and the calendar |
| `name` | `London` | Label for the location |
| `planet` | `saturn` | Year-hand planet |
| `t` | `2026-03-20T14:46:00Z` | Start the clock at this instant (it keeps running) |

Embed in any site:

```html
<iframe src="https://celestial-clock.vercel.app/?view=orrery" style="width:100%;aspect-ratio:1;border:0;background:#04070d"></iframe>
```

The site is installable (web app manifest): "Add to Home Screen" on iOS/Android or "Install" in desktop Chrome opens straight into ambient mode.

## Develop

```bash
npm install
npm run dev
npm test             # 40 astronomy and geometry tests
npm run build        # site, to dist/
npm run build:lib    # packages, to dist-lib/
```

Visual and alignment check (Python Playwright, headless Chromium with software WebGL):

```bash
npm run build && npx vite preview --port 4173 &
python3 scripts/visual-check.py http://localhost:4173/ screenshots
```

It captures phone (390 × 844), tablet (768 × 1024) and desktop (1440 × 900) screenshots, measures alignment in screen pixels from the rendered objects via `window.__celestialClock.verify()`, checks the hands' readings on known dates (leap day, equinox, solstice, 1969, 2100), renders the Earth and Moon panels for Singapore, London, New York and Sydney, and exercises location permission (granted, denied), city choice and playback.

## Architecture

| Module | Path | Depends on |
| --- | --- | --- |
| Astronomy core | `src/astro/` | astronomy-engine only (no React, no Three) |
| Clock geometry | `src/geometry/projection.ts` | astronomy core |
| Simulation clock | `src/sim/clock.ts` | nothing |
| 3D renderer | `src/render/` | Three.js, React Three Fiber |
| UI | `src/ui/`, `src/App.tsx` | everything above |

### Packages (`npm run build:lib`)

- `dist-lib/astro.js` (`celestial-clock/astro`): the astronomy core. Pure functions of a UTC timestamp and a location: heliocentric positions, calendar and year scales, Earth view (sub-solar point, solar time, equation of time, sunrise/sunset), Moon view (phase, illumination, bright-limb and parallactic angles, rise/set, next quarter), time-zone helpers.
- `dist-lib/react.js` (`celestial-clock`): `<CelestialClock view="orrery" useUrl={false} />`, plus the simulation clock. React, Three.js and R3F are peer dependencies. Copy `public/textures` into the host's public folder.
- Type declarations in `dist-lib/types`.

These are the building blocks for the planned native apps: the astronomy core runs anywhere JavaScript runs (React Native, Electron, a Swift app via JavaScriptCore), and the installable web app already covers desktop and home-screen use.

### How alignment is guaranteed

One projection maps heliocentric ecliptic longitude λ and in-plane distance ρ to the scene: `(f(ρ)·cos λ, 0, −f(ρ)·sin λ)`. Planets, orbit paths, hands, calendar ticks, year ticks and labels all go through it. `f` is a monotone cubic radial compression, so angles are exact and orbits never cross. The orrery camera is orthographic, straight down the ecliptic pole.

The Earth and Moon panels work in the J2000 equatorial frame: each body carries its IAU orientation, the camera sits where the observer is, and the only light is the Sun's computed direction. Nothing about phase or terminator is drawn by hand.

### Calendar and year scales

- **Calendar ring:** a tick at Earth's longitude at each local midnight (365 or 366 days). Not uniform: early-January days are about 7% wider than July days. Recomputed per year and time zone.
- **Year scale:** the planet's longitude on 1 January of each year, in a window centred on the simulated year and always shorter than one orbit, so each position maps to one year. Jupiter labelled every year, Saturn every 5, Uranus every 10, Neptune every 20, with yearly minor ticks.

## Accuracy

- Ephemeris: [Astronomy Engine](https://github.com/cosinekitty/astronomy) (VSOP87 for planets, about 1 arcminute; its lunar theory for the Moon).
- Orientation: IAU WGCCRE 2015 rotation models. For Earth this simplified model is about 0.5° from the full precession-nutation model, which shifts the globe by about 1 to 2 px at panel size.
- Tested: Earth at equinoxes and solstices (within 0.02°); equinox and solstice times (within 2 min); five oppositions (within 1°); London sunrise and sunset on the 2026 solstice (within 2 min); polar night in Tromsø; equation of time; full and new Moon dates; the rendered bright limb against Meeus' bright-limb and parallactic-angle formulas in four cities (within 0.6°).
- Supported range: years 1600 to 2400.
- Not shown: ecliptic latitude in the orrery (the top-down view flattens it), atmospheric refraction in the Moon view, real-time clouds.

This is a clock, not an observatory tool.

## Known limitations

- Planet sizes are enlarged and distances compressed; only directions are to scale.
- The night-side city lights date from NASA's 2000s composite.
- Device location uses the browser's time zone for civil time.
- Three.js is about 190 kB gzipped; it is split into its own cached chunk.

## Credits

Textures: Solar System Scope (CC BY 4.0) and NASA Earth at night (public domain). See `public/textures/ATTRIBUTION.md`.

# Celestial Clock

An astronomical clock that tells the time from the real positions of the planets.
Look at Earth to read the date. Look at Jupiter to read the year.

**Status:** Milestone 1 (accurate 3D orrery). Earth and Moon telemetry panels are Milestone 2.

## Run

```bash
npm install
npm run dev        # local dev server
npm test           # astronomy and geometry unit tests
npm run build
```

Visual and alignment check (needs Python Playwright and a running preview):

```bash
npm run build && npx vite preview --port 4173 &
python3 scripts/visual-check.py http://localhost:4173/ screenshots
```

It captures screenshots at 390 × 844, 768 × 1024 and 1440 × 900, then calls
`window.__celestialClock.verify()`, which measures in screen pixels, from the
rendered objects, that each planet sits on its orbit and on its hand, and that
the hands read the expected date and year for known dates (leap day, equinox,
solstice, 1969, 2100).

## Architecture

| Module | Path | Depends on |
| --- | --- | --- |
| Astronomy core | `src/astro/` | astronomy-engine only (no React, no Three) |
| Clock geometry | `src/geometry/projection.ts` | astronomy core |
| Simulation clock | `src/sim/clock.ts` | nothing |
| 3D renderer | `src/render/` | Three.js, React Three Fiber |
| UI | `src/ui/`, `src/App.tsx` | everything above |

### How alignment is guaranteed

One projection function maps heliocentric ecliptic longitude λ and in-plane
distance ρ to the scene: `(f(ρ)·cos λ, 0, −f(ρ)·sin λ)`. Planets, orbit paths,
hands, calendar ticks, year ticks and labels all go through it. `f` is a
monotone cubic radial compression, so angles are exact and orbits never cross.
The camera is orthographic and looks straight down the ecliptic pole, so the
2D reading is not distorted by perspective. Labels are DOM elements placed by
the same camera.

### Calendar and year scales

- **Calendar ring:** one tick at Earth's computed longitude at each local
  midnight of the simulated year (365 or 366 days). Ticks are not uniform:
  January days are about 7% wider than July days because Earth is nearer the Sun.
  Recomputed for every year and time zone.
- **Year scale:** the selected planet's longitude on 1 January of each year.
  The window is centred on the simulated year and is always shorter than one
  orbit, so every position on the scale maps to exactly one year. Jupiter is
  labelled every year, Saturn every 5, Uranus every 10, Neptune every 20, with
  yearly minor ticks.

## Accuracy

- Ephemeris: [Astronomy Engine](https://github.com/cosinekitty/astronomy)
  (VSOP87, about 1 arcminute for the planets). Positions are geometric
  heliocentric, J2000 mean ecliptic frame.
- Planet orientation (poles, prime meridians, Saturn's ring tilt): IAU WGCCRE 2015
  rotation models via Astronomy Engine.
- Unit tests check Earth's longitude at equinoxes and solstices (within 0.02°),
  published equinox and solstice times (within 2 min), and five recent
  oppositions (within 1°, the error being the date's rounding to a day).
- Supported range: years 1600 to 2400.
- Not shown: ecliptic latitude (the top-down view flattens it), light-time,
  and anything finer than about a pixel.

This is a clock, not an observatory tool. No observatory-grade claims.

## Known limitations (Milestone 1)

- Planet sizes are enlarged and distances compressed; only directions are to scale.
- Saturn's shadow on its rings is not rendered yet (Milestone 3).
- Calendar uses the browser's time zone. Location selection arrives in Milestone 2.
- Bundle is about 350 kB gzipped; code-splitting is planned for Milestone 3.

## Textures

Solar System Scope, CC BY 4.0. See `public/textures/ATTRIBUTION.md`.

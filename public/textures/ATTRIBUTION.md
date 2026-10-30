# Texture attribution

All planetary, solar and lunar textures in this folder are derived from the
**Solar System Scope Texture Library** (https://www.solarsystemscope.com/textures),
Copyright (c) 2010-2017 Solar System Scope, licensed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

Source copies were taken from the Qt 3D repository
(`tests/manual/planets-qml/images/solarsystemscope`), which redistributes the
same library under CC BY 4.0. See `LICENSE-solarsystemscope.txt`.

`earth_night_2k.jpg` is NASA's "Earth at night" city-lights composite (NASA Earth
Observatory, public domain), taken from the three.js examples
(`examples/textures/planets/earth_lights_2048.png`) and resized to 1638 x 819.

## Changes made for this project

- `*_1k.jpg`: resized to 1024 x 512 (Lanczos) for the orrery.
- `*_2k.jpg`: original 1638 x 819 maps, re-encoded, for Earth and Moon panels.
- `earth_rough_2k.jpg`: the specular map inverted and rescaled into a roughness map (glossy oceans).
- `moon_normal_1k.jpg`: the Moon normal map resized to 1024 x 512.
- `saturn_ring.png`: 512 px radial strip sampled from the Qt ring disc
  (averaged over 360 angles), inner edge to outer edge.

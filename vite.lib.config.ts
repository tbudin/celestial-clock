import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Library builds: `npm run build:lib`
// - dist-lib/astro.js: framework-free astronomy core (depends only on astronomy-engine)
// - dist-lib/react.js: <CelestialClock /> React component
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: 'dist-lib',
    assetsInlineLimit: 0,
    emptyOutDir: true,
    lib: {
      entry: { astro: 'src/astro/index.ts', react: 'src/lib/index.ts' },
      formats: ['es'],
    },
    rolldownOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^three($|\/)/, /^@react-three\//, 'astronomy-engine'],
    },
  },
})

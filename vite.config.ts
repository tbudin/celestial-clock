import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks cache across deploys
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/](three|three-stdlib)[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/](@react-three|troika|@monogrid|camera-controls|maath|zustand|its-fine|suspend-react)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'astro', test: /node_modules[\\/]astronomy-engine[\\/]/ },
          ],
        },
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Card art keeps getting generated into public/cards while the dev server runs,
      // and watching a file mid-write crashes the whole process on Windows (EBUSY:
      // resource busy or locked). Static assets don't need HMR anyway — a plain
      // browser refresh picks up new art — so just don't watch this folder.
      ignored: ['**/public/cards/**'],
    },
  },
})

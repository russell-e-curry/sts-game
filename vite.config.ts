import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite's dev server never attaches an 'error' listener to its own chokidar watcher,
// so any watcher error (e.g. Windows EBUSY from a file being written while watched)
// is an unhandled EventEmitter error, which crashes the whole process. Swallow it
// instead so a mid-write file never takes the server down.
function tolerateWatcherErrors() {
  return {
    name: 'tolerate-watcher-errors',
    configureServer(server: import('vite').ViteDevServer) {
      server.watcher.on('error', (err: unknown) => {
        console.warn('[vite] file watcher error (ignored):', err)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tolerateWatcherErrors()],
  server: {
    watch: {
      // Card art keeps getting generated into public/cards while the dev server runs.
      // Static assets don't need HMR anyway — a plain browser refresh picks up new
      // art — so skip watching this folder; the error handler above is what actually
      // keeps a mid-write file from crashing the process, this is just less noise.
      ignored: ['**/public/cards/**'],
    },
  },
})

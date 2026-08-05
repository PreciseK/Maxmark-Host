import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function spaFallbackPlugin(): Plugin {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split('?')[0] ?? '/'
        // Let Vite handle: root, internal Vite paths, and paths with a file extension
        if (url === '/' || url.startsWith('/@') || url.startsWith('/node_modules') || /\.\w+$/.test(url)) {
          return next()
        }
        // Everything else (clean SPA routes) → serve the React app entry
        req.url = '/app.html'
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split('?')[0] ?? '/'
        if (url === '/' || /\.\w+$/.test(url)) return next()
        req.url = '/app.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), spaFallbackPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('react-router') || id.includes('react-dom') || /node_modules[\\/]react[\\/]/.test(id)) return 'vendor-react'
          return undefined
        },
      },
    },
  },
})

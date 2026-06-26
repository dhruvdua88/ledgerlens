import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build works on GitHub Pages from any sub-path
export default defineConfig({
  base: './',
  plugins: [react()],
  // sql.js is CJS — let Vite pre-bundle it so the default import interops in dev
  optimizeDeps: { include: ['sql.js'] },
  server: { port: 5188, strictPort: true },
})

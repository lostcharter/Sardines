import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('./workers/problem-reporter/ui', import.meta.url)),
  base: '/',
  plugins: [react()],
  build: { outDir: '../public', emptyOutDir: true },
})

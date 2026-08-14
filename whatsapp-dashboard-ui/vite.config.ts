// vite.config.ts — frontend project root (RESTORED: no base path)
// The app is served from the domain root, exactly as before.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
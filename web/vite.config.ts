import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works both locally and under
// https://<user>.github.io/<repo>/ without hardcoding the repo name.
export default defineConfig({
  plugins: [react()],
  base: './',
})

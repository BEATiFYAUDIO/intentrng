// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If your site is https://<user>.github.io/<repo>/ set base to '/<repo>/'
// If your site is https://<user>.github.io/ (root site), set base to '/'
export default defineConfig({
  base: '/<repo>/',   // ⬅️ replace with your repo name
  plugins: [react()],
})

import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(
  {
    plugins: [react(), tailwindcss()],
    server: {
        proxy: {
          '/api': {
            target: 'http://localhost:3001', // Sends frontend /api requests to Express
            changeOrigin: true,
            secure: false,
          },
        },
      },
  }
)


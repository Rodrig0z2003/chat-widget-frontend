import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },

  // --- ¡BLOQUE AÑADIDO PARA NOMBRES FIJOS! ---
  build: {
    rollupOptions: {
      output: {
        // Genera archivos con nombres fijos
        entryFileNames: `assets/chat-widget.js`,
        assetFileNames: `assets/chat-widget.[ext]`
      }
    }
  }
  // ---------------------------------
})
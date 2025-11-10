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

  // --- ¡BLOQUE FINAL PARA NOMBRES FIJOS! ---
  build: {
    rollupOptions: {
      output: {
        // 1. Nombra el JS principal
        entryFileNames: `assets/chat-widget.js`,

        // 2. Esta función nombra el CSS de forma fija PERO
        //    deja que los demás assets (imágenes, fuentes) tengan sus nombres originales
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.css')) {
            return `assets/chat-widget.css`;
          }
          // Esto quita el hash de las imágenes, fuentes, etc.
          return `assets/[name].[ext]`;
        },
      }
    }
  }
  // ---------------------------------
})
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

  // --- ¡BLOQUE MODIFICADO PARA NOMBRES FIJOS! ---
  build: {
    rollupOptions: {
      output: {
        // 1. Nombra el JS principal
        entryFileNames: `assets/chat-widget.js`,

        // 2. Nombra los assets (imágenes, fuentes) con sus nombres + hash
        chunkFileNames: `assets/[name]-[hash].js`,

        // 3. Esta función nombra el CSS de forma fija PERO
        //    deja que los demás assets (imágenes) tengan sus nombres correctos
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.css')) {
            return `assets/chat-widget.css`;
          }
          return `assets/[name]-[hash].[ext]`;
        },
      }
    }
  }
  // ---------------------------------
})
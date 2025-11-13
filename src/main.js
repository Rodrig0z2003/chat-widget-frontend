// Tus imports existentes
import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'

// --- INICIO: Configuración de Laravel Echo ---
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

window.Pusher = Pusher

window.Echo = new Echo({
    broadcaster: 'reverb',
    key: 'pcqq1ch30dwvpscun4ho', // <-- Tu clave
    wsHost: 'localhost',         // <-- Tu host (o la IP del backend)
    wsPort: 8080,                // <-- Puerto de Reverb
    wssPort: 8080,
    forceTLS: false,
    enabledTransports: ['ws', 'wss'],
    authEndpoint: 'http://127.0.0.1:8001/api/broadcasting/auth',

    // --- ¡LA CLAVE FINAL! AÑADE ESTE BLOQUE DE HEADERS ---
    headers: {
        // Esto le dice a Laravel: "Soy una solicitud AJAX legítima."
        'X-Requested-With': 'XMLHttpRequest'
    }
    // --- FIN DEL BLOQUE DE HEADERS ---
})
// --- FIN: Configuración de Laravel Echo ---

// Crear e iniciar la app Vue
createApp(App).mount('#app')

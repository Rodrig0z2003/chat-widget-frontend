// Tus imports existentes
import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'

// --- INICIO: Configuración de Laravel Echo (CORREGIDA) ---
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
window.Pusher = Pusher
// --- Las líneas de 'pusher-js' y 'window.Pusher' se han eliminado ---
// (Ya no son necesarias con Reverb)

window.Echo = new Echo({
    broadcaster: 'reverb',
    key: 'pcqq1ch30dwvpscun4ho', // <-- Tu clave REVERB_APP_KEY
    wsHost: 'localhost',         // <-- Tu host (REVERB_HOST)
    wsPort: 8080,                // <-- Puerto de Reverb (REVERB_PORT)
    wssPort: 8080,
    forceTLS: false,
    enabledTransports: ['ws', 'wss'],
    
    // El endpoint de autenticación (aunque no lo usamos para este canal,
    // es bueno dejarlo para futuros canales privados)
    //authEndpoint: 'http://127.0.0.1:8001/api/broadcasting/auth', 
    authEndpoint: 'https://dev.gangsheet-builders.com/api/broadcasting/auth', 


    headers: {
        'X-Requested-With': 'XMLHttpRequest'
    }
})
// --- FIN: Configuración de Laravel Echo ---

// Crear e iniciar la app Vue
createApp(App).mount('#app')
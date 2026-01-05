// Tus imports existentes
import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'

// --- INICIO: Configuración de Laravel Echo ---
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
window.Pusher = Pusher

// --- CONFIGURACIÓN ANTIGUA (Comentada) ---
// Esta era la configuración anterior que apuntaba a localhost
/*
window.Echo = new Echo({
    broadcaster: 'reverb',
    key: 'pcqq1ch30dwvpscun4ho', // <-- Clave anterior
    wsHost: 'localhost',         // <-- Host anterior
    wsPort: 8080,                // <-- Puerto anterior
    wssPort: 8080,
    forceTLS: false,
    enabledTransports: ['ws', 'wss'],
    
    //authEndpoint: 'http://127.0.0.1:8001/api/broadcasting/auth', 
    authEndpoint: 'https://dev.gangsheet-builders.com/api/broadcasting/auth', 


    headers: {
        'X-Requested-With': 'XMLHttpRequest'
    }
})
*/
// --- FIN: CONFIGURACIÓN ANTIGUA ---


// --- INICIO: NUEVA CONFIGURACIÓN DE LARAVEL ECHO (CORREGIDA) ---
// (Para dominio público con HTTPS)
window.Echo = new Echo({
    broadcaster: 'reverb',
    
    // ----- CONFIGURACIÓN PARA EL NUEVO DOMINIO -----
    key: 'g2pmefmk8aibytodtgj3',           // Asegúrate de que coincida con REVERB_APP_KEY en el .env de dttorders
    wsHost: 'dttorders.gangsheet-builders.com',  // Nuevo dominio
    wsPort: 443,
    wssPort: 443,
    forceTLS: true,                        // Mantenlo en true para conexiones seguras
    enabledTransports: ['ws', 'wss'],
    // ------------------------------------

    // Endpoint de autenticación actualizado
    authEndpoint: 'https://dttorders.gangsheet-builders.com/api/broadcasting/auth', 

    headers: {
        'X-Requested-With': 'XMLHttpRequest'
    }
})
// --- FIN: Configuración de Laravel Echo ---


// Crear e iniciar la app Vue
createApp(App).mount('#app')
//createApp(App).mount('#dtf-chatbot-root')
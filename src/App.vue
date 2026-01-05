<script setup>
import { ref, nextTick, watch, onMounted } from 'vue'; 
import axios from 'axios';

// 1. Importa el logo de tu empresa. 
import dtfLogoUrl from '@/assets/dtf-logo.webp'; 

// --- ESTADO DEL CHAT ---
const isChatOpen = ref(false);
const inputText = ref('');
const messages = ref([]);
const senderId = ref('user_' + Math.random().toString(36).substr(2, 9));

//const RASA_API_URL = 'http://localhost:5005/webhooks/rest/webhook';
const RASA_API_URL = 'https://chat.dtfsuppliespro.com/webhooks/rest/webhook';
const chatHistory = ref(null);

// Endpoint de Laravel para mensajes de usuario (Handoff)
//const LARAVEL_USER_API_URL = 'https://dev.gangsheet-builders.com/api/user/send-message'; 
const LARAVEL_USER_API_URL = 'https://dttorders.gangsheet-builders.com/api/user/send-message'; 
const isHandoffActive = ref(false);


// ======================================================
// --- NUEVO SISTEMA DE VOZ (CONECTADO A LARAVEL) ---
// ======================================================

const speechQueue = ref([]);   
const isSpeaking = ref(false); 

// URL de tu API en Laravel para generar el audio 
//const TTS_API_URL = 'https://dev.gangsheet-builders.com/api/generate-speech'; 
//const TTS_API_URL = 'http://localhost:8001/api/generate-speech'; 
//const TTS_API_URL = 'https://dttorders.gangsheet-builders.com/api/generate-speech'; 


// Función mejorada para limpiar texto antes de leer
const cleanTextForSpeech = (text) => {
  if (!text) return "";
  
  return text
    // 1. Quitar Markdown (negritas, cursivas)
    .replace(/\*\*/g, '')      
    .replace(/__/g, '')        
    
    // 2. Quitar etiquetas HTML (<br>, <span>, etc)
    .replace(/<[^>]*>?/gm, '') 
    
    // 3. Reemplazar URLs por la palabra "link"
    .replace(/https?:\/\/\S+/g, 'link')
    
    // 4. ¡NUEVO! QUITAR EMOJIS 👋 🔥 😂
    // Esta expresión regular cubre la gran mayoría de rangos de emojis modernos
    .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '')
    
    // 5. Limpieza final (quitar espacios dobles que dejan los emojis borrados y espacios extremos)
    .replace(/\s+/g, ' ')
    .trim();
};

const processSpeechQueue = async () => {
  // Si ya está hablando o no hay mensajes, no hacer nada
  if (isSpeaking.value || speechQueue.value.length === 0) return;

  isSpeaking.value = true;
  const textToSpeak = speechQueue.value.shift(); // Sacar el primer mensaje

  try {
    console.log("Solicitando audio a Laravel...");

    // 1. Llamada a Laravel (Axios)
    const response = await axios.post(TTS_API_URL, {
      text: textToSpeak
    }, { 
      responseType: 'blob' // <--- ¡CRUCIAL! Esto le dice que esperamos un archivo binario
    });

    // 2. Crear URL temporal para reproducir el MP3
    const audioUrl = URL.createObjectURL(response.data);
    const audio = new Audio(audioUrl);

    // 3. Eventos del Audio
    audio.onended = () => {
      isSpeaking.value = false;
      URL.revokeObjectURL(audioUrl); // Liberar memoria
      processSpeechQueue(); // Ir al siguiente mensaje
    };

    audio.onerror = (e) => {
      console.error("Error reproduciendo MP3:", e);
      isSpeaking.value = false;
      processSpeechQueue();
    };

    // 4. ¡Reproducir!
    await audio.play();

  } catch (error) {
    console.error("Error obteniendo voz del servidor:", error);
    // Si falla, simplemente pasamos al siguiente o paramos
    isSpeaking.value = false; 
    processSpeechQueue();
  }
};

const speakBotMessage = (rawText) => {
  const clean = cleanTextForSpeech(rawText);
  if (clean.trim().length > 0) {
    speechQueue.value.push(clean);
    processSpeechQueue();
  }
};

// ======================================================
// --- SISTEMA DE RECONOCIMIENTO DE VOZ (STT) ---
// ======================================================
const isRecording = ref(false);
let recognition = null;

const toggleVoiceInput = () => {
  // 1. Si ya está grabando, lo detenemos
  if (isRecording.value) {
    if (recognition) recognition.stop();
    isRecording.value = false;
    return;
  }

  // 2. Verificamos soporte del navegador
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Tu navegador no soporta entrada de voz. Prueba con Chrome o Edge.");
    return;
  }

  // 3. Configuramos el reconocimiento
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US'; // O 'es-ES' si tu bot habla español
  recognition.interimResults = false; // Solo resultados finales
  recognition.maxAlternatives = 1;

  // 4. Eventos
  recognition.onstart = () => {
    isRecording.value = true;
    console.log("🎤 Escuchando...");
    
    // Opcional: Si el bot estaba hablando, lo callamos para que nos escuche
    if (isSpeaking.value) {
      window.speechSynthesis.cancel(); // Detiene síntesis nativa
      isSpeaking.value = false;
      // Nota: Para detener el audio de Laravel (Audio Element), necesitaríamos una referencia global,
      // pero por ahora esto detendrá al menos la lógica de cola.
    }
  };

  recognition.onend = () => {
    isRecording.value = false;
    console.log("🎤 Fin de la escucha.");
  };

  recognition.onresult = (event) => {
    // 1. Obtenemos lo que dijiste
    const transcript = event.results[0][0].transcript;
    console.log("Texto detectado y enviando:", transcript);
    
    // 2. Lo ponemos en el input (para que sendMessage lo pueda leer)
    inputText.value = transcript;
    
    // 3. ¡ENVIAR AUTOMÁTICAMENTE!
    // Llamamos a sendMessage() sin argumentos. 
    // Como ya llenamos inputText.value arriba, la función lo tomará y lo enviará.
    if (transcript.trim().length > 0) {
        sendMessage(null);
    }
  };

  recognition.onerror = (event) => {
    console.error("Error STT:", event.error);
    isRecording.value = false;
  };

  // 5. Iniciar
  recognition.start();
};

// ======================================================
// --- FIN SISTEMA DE VOZ ---
// ======================================================


// --- FUNCIONES DEL CHAT ---

// Abre el chat y envía el saludo inicial
const openChat = async () => {
  isChatOpen.value = true;

  // Si es la primera vez que abre, saluda
  if (messages.value.length === 0) {
    // Muestra un "escribiendo..." temporal
    messages.value.push({ from: 'bot', type: 'typing' });
    
    try {
      // Llama a Rasa para el saludo (intent: /greet)
      const response = await axios.post(RASA_API_URL, {
        sender: senderId.value,
        message: "/greet"
      });

      // Simulamos un "pensamiento" con un delay aleatorio
      const randomDelay = Math.floor(Math.random() * 700) + 500; 
      await new Promise(resolve => setTimeout(resolve, randomDelay));

      // Quita el "escribiendo..."
      messages.value.shift(); 
      
      response.data.forEach((botMessage) => {
        messages.value.push({ from: 'bot', type: 'text', text: botMessage.text });
        
        // --- VOZ: Leer saludo inicial ---
        speakBotMessage(botMessage.text);
      });

    } catch (error) {
      messages.value.shift();
      messages.value.push({ from: 'bot', type: 'text', text: 'Error connecting to bot.' });
    }
  }
};

const closeChat = () => {
  isChatOpen.value = false;
};

const sendMessage = async (payload = null) => {
  // Si 'payload' existe, es un clic de botón o un dropdown. Si no, es texto.
  const messageToSend = payload || inputText.value.trim();
  // Evita enviar si está vacío (ej. el "Select a size..." del dropdown)
  if (!messageToSend) return;

  // 1. Añade el mensaje del usuario al chat
  if (!payload) {
    messages.value.push({ from: 'user', type: 'text', text: messageToSend });
    inputText.value = ''; // Limpia el input
  } else if (payload && event && event.target && event.target.tagName === 'SELECT') {
    // Si es un dropdown, muestra la selección como un mensaje de usuario
    const selectedText = event.target.options[event.target.selectedIndex].text;
    messages.value.push({ from: 'user', type: 'text', text: selectedText });
  }

  // Revisa si estamos en modo agente o modo bot
  if (isHandoffActive.value) {
    // ========================================
    // MODO AGENTE: Enviar a Laravel
    // ========================================
    try {
      // Envía el mensaje al nuevo endpoint de Laravel
      await axios.post(LARAVEL_USER_API_URL, {
        sender_id: senderId.value,
        message: messageToSend
      });
      // No necesitamos hacer nada más, el agente lo verá
      // y su respuesta llegará por el WebSocket que ya escuchamos.
      
    } catch (error) {
      console.error("Error al enviar mensaje a Laravel:", error);
      // Muestra un error temporal si falla
      messages.value.push({ from: 'bot', type: 'text', text: 'Sorry, your message could not be sent. Please check your connection.' });
    }

  } else {
    // ========================================
    // MODO BOT: Enviar a Rasa
    // ========================================
    // 2. Muestra "escribiendo..."
    messages.value.push({ from: 'bot', type: 'typing' });

    try {
      // 3. Envía el mensaje a la API de Rasa
      const response = await axios.post(RASA_API_URL, {
        sender: senderId.value,
        message: messageToSend
      });

      // Simulamos un "pensamiento" del bot con un delay aleatorio
      const randomDelay = Math.floor(Math.random() * 700) + 500; 
      await new Promise(resolve => setTimeout(resolve, randomDelay));

      // 4. Quita el "escribiendo..."
      messages.value.pop();

      // 5. Procesa la respuesta de Rasa
      if (response.data.length === 0) {
        messages.value.push({ from: 'bot', type: 'text', text: "Sorry, I didn't understand." });
      } else {
        response.data.forEach((botMessage) => {

          // ¡Detecta la señal de handoff de Rasa!
          if (botMessage.custom && botMessage.custom.type === 'handoff_start') {
            isHandoffActive.value = true;
            console.log('HANDOFF ACTIVADO: Cambiando a modo Agente.');
          } 
          
          // ========================================================
          // CASO 1: CUSTOM (GRID, DROPDOWN, ETC.)
          // ========================================================
          else if (botMessage.custom) {
            // 1. Mostrar visualmente
            messages.value.push({ from: 'bot', type: 'custom', custom: botMessage.custom });

            // 2. CONSTRUIR TEXTO COMPLETO (Título + Opciones)
            let textToRead = "";

            // Añadir la pregunta principal
            if (botMessage.custom.text) {
               textToRead += botMessage.custom.text;
            }

            // Añadir las opciones separadas por puntos (para que haga pausa natural)
            if (botMessage.custom.options && Array.isArray(botMessage.custom.options)) {
                botMessage.custom.options.forEach((option) => {
                    if (option.title) {
                        // El punto y espacio ". " hace que la voz respire
                        textToRead += ". " + option.title; 
                    }
                });
            }

            // 3. ENVIAR TODO JUNTO A LA COLA DE AUDIO (1 sola petición)
            if (textToRead.trim().length > 0) {
                speakBotMessage(textToRead);
            }
          } 

          // ========================================================
          // CASO 2: BOTONES NORMALES DE RASA
          // ========================================================
          else if (botMessage.buttons) {
            messages.value.push({ 
              from: 'bot', 
              type: 'custom', 
              custom: {
                text: botMessage.text || null,
                type: 'buttons',
                options: botMessage.buttons 
              }
            });
            
            // Lógica de concatenación para botones normales
            let textToRead = "";
            
            if (botMessage.text) {
                textToRead += botMessage.text;
            }

            botMessage.buttons.forEach((btn) => {
                if (btn.title) {
                    textToRead += ". " + btn.title;
                }
            });

            if (textToRead.trim().length > 0) {
               speakBotMessage(textToRead);
            }

          } else {
            // ========================================================
            // CASO 3: TEXTO NORMAL
            // ========================================================
            messages.value.push({ from: 'bot', type: 'text', text: botMessage.text });
            speakBotMessage(botMessage.text);
          }
        });
      }

    } catch (error) {
      console.error("Error al contactar a Rasa:", error);
      messages.value.pop();
      messages.value.push({ from: 'bot', type: 'text', text: 'Sorry, I could not connect.' });
    }
  }
};

const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (file) {
    console.log('File uploaded:', file.name);
    // Aquí puedes manejar la lógica de subida del archivo
  }
};

// Función para formatear Markdown
const formatMessage = (text) => {
  if (!text) return '';

  // --- PASO 1: Viñetas ---
  let formattedText = text.replace(
    /^\* (.*)$/gm, 
    '<span style="padding-left: 15px; display: block;">&bull; $1</span>'
  );

  // --- PASO 2: Saltos de línea ---
  formattedText = formattedText.replace(/\n/g, '<br>');

  // --- PASO 3: Negrita ---
  formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // --- PASO 4: Links ---
  formattedText = formattedText.replace(
    /\[(.*?)\]\((.*?)\)/g, 
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  
  return formattedText;
};

// Conecta el widget a Reverb para "escuchar" al agente
const listenForAgentMessages = () => {
  // Asegúrate de que window.Echo se cargó desde bootstrap.js/echo.js
  if (window.Echo) {
    
    // Escucha en el canal del usuario
    const userChannel = window.Echo.channel('chat.' + senderId.value);

    // 1. Escucha mensajes DEL AGENTE
    userChannel.listen('.AgentMessageSent', (e) => {
         console.log('¡EVENTO RECIBIDO (Agente)!', e); 
        // Quita el "escribiendo..." si el bot lo dejó puesto
        if (messages.value.length > 0 && messages.value[messages.value.length - 1].type === 'typing') {
          messages.value.pop();
        }

        // Añádelo al chat
        messages.value.push({
          from: 'bot', 
          type: 'text',
          text: `**${e.agent_name} (Agent):** ${e.message}` 
        });

        // --- VOZ: LEER MENSAJE DEL AGENTE ---
        speakBotMessage(e.message); 
        // ------------------------------------
    });

    // 2. Escucha el evento de FIN DE HANDOFF
    userChannel.listen('.HandoffEnded', (e) => {
        console.log('¡EVENTO RECIBIDO (Handoff Ended)!', e);
        
        // Vuelve al modo BOT
        isHandoffActive.value = false;

        // Avisa al usuario
        const endMsg = 'The agent has left. You are now reconnected with the DTF Assistant.';
        messages.value.push({
          from: 'bot', 
          type: 'text',
          text: endMsg
        });

        // --- VOZ: Leer mensaje de desconexión ---
        speakBotMessage(endMsg);
    });
      
  } else {
    console.error('Laravel Echo (Reverb) no está configurado. Revisa tu archivo echo.js.');
  }
};


// Auto-scroll al fondo del chat cuando llegan mensajes nuevos
watch(messages, async () => {
  await nextTick();
  if (chatHistory.value) {
    chatHistory.value.scrollTop = chatHistory.value.scrollHeight;
  }
}, { deep: true });

// ======================================================
// ON MOUNTED MODIFICADO
// ======================================================
onMounted(() => {
  console.log('¡App.vue MONTADO! Intentando conectar a Echo...');
  
  // Hemos eliminado la carga de voces del navegador porque ahora
  // el audio viene directamente del servidor Laravel.

  // 2. Tu lógica original de Echo
  listenForAgentMessages();
});
</script>

<template>
  <div>
    <!-- Ventana de chat flotante -->
    <transition name="chat-slide">
      <div v-if="isChatOpen" class="chat-widget">
        
        <!-- Header del chat -->
        <div class="chat-header">
          <div class="header-content">
            <div class="bot-avatar-small">
              <!-- Usar el logo de la empresa aquí -->
              <img :src="dtfLogoUrl" alt="DTF Logo" class="header-dtf-logo" />
            </div>
            <div class="bot-info">
              <h3>DTF Assistant</h3>
              <span class="status">
                <span class="status-dot"></span>
                Online
              </span>
            </div>
          </div>
          <button @click="closeChat" class="close-btn" title="Close chat">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Historial de mensajes -->
        <div class="chat-history" ref="chatHistory">
          <div class="messages-container">
            <div v-for="(msg, index) in messages" :key="index" :class="['message-wrapper', msg.from]">
              
              <!-- Avatar del bot -->
              <div v-if="msg.from === 'bot'" class="message-avatar">
                <!-- Usar el logo de la empresa aquí -->
                <img :src="dtfLogoUrl" alt="Bot" class="message-dtf-logo" />
              </div>

              <div class="message-content">
                
                <!-- Mensaje de texto normal -->
                <div v-if="msg.type === 'text'" class="message-bubble">
                  <!-- CORRECCIÓN DE MARKDOWN (v-html) -->
                  <p v-html="formatMessage(msg.text)"></p>
                </div>

                <!-- Indicador de "escribiendo..." -->
                <div v-if="msg.type === 'typing'" class="message-bubble typing-bubble">
                  <div class="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>

                <!-- Mensajes custom (botones, etc.) -->
                <div v-if="msg.type === 'custom'" class="message-bubble">
                  <p v-if="msg.custom.text" v-html="formatMessage(msg.custom.text)"></p>
                  
                  <!-- Contenedor de Botones (Ahora con scroll horizontal) -->
                  <div v-if="msg.custom.type === 'buttons'" class="button-container">
                    <button 
                      v-for="option in msg.custom.options" 
                      :key="option.title"
                      @click="sendMessage(option.payload)"
                      class="option-btn">
                      {{ option.title }}
                    </button>
                  </div>

                  <!-- Contenedor de Grid -->
                  <div v-else-if="msg.custom.type === 'grid'" class="grid-container">
                    <button 
                      v-for="option in msg.custom.options" 
                      :key="option.title"
                      @click="sendMessage(option.payload)"
                      class="grid-btn"> {{ option.title }}
                    </button>
                  </div>

                  <!-- Contenedor de Dropdown -->
                  <div v-else-if="msg.custom.type === 'dropdown'" class="dropdown-container">
                    <select @change="sendMessage($event.target.value)" class="dropdown-select">
                      <!-- El placeholder viene del bot, pero si no, ponemos uno genérico -->
                      <option value="" disabled selected>{{ msg.custom.placeholder || 'Select an option...' }}</option>
                      
                      <option 
                        v-for="option in msg.custom.options" 
                        :key="option.title"
                        :value="option.payload"> {{ option.title }}
                      </option>
                    </select>
                  </div>

                  <!-- Upload de archivo -->
                  <div v-if="msg.custom.type === 'request_upload'" class="upload-container">
                    <label class="upload-label">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      <span>Choose file</span>
                      <input type="file" @change="handleFileUpload" />
                    </label>
                  </div>
                </div>

                <span v-if="msg.type === 'text'" class="message-time">
                  {{ new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Input de mensajes -->
        <div class="chat-input-container">
          <div class="chat-input">
            
            <button class="icon-btn attachment-btn" title="Attach file">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>

            <input
              v-model="inputText"
              @keyup.enter="sendMessage(null)"
              type="text"
              :placeholder="isRecording ? 'Listening...' : 'Type your message...'"
            />

            <!-- BOTÓN MICROFONO -->
            <button 
              class="icon-btn mic-btn" 
              :class="{ 'recording': isRecording }" 
              @click="toggleVoiceInput"
              title="Speak"
            >
              <svg v-if="!isRecording" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
              
              <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                 <circle cx="12" cy="12" r="6" />
              </svg>
            </button>

            <button class="send-btn" @click="sendMessage(null)" :disabled="!inputText.trim()">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
              </svg>
            </button>
          </div>
          <div class="input-helper">
            Press Enter to send
          </div>
        </div>
      </div>
    </transition>

    <!-- Botón flotante (FAB) -->
    <transition name="fab-bounce">
      <button v-if="!isChatOpen" @click="openChat" class="chat-bubble">
        <div class="fab-content">
          <!-- Este es el icono de mensaje -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="fab-chat-icon">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path>
          </svg>
          <div class="notification-badge">1</div>
        </div>
        <div class="pulse-ring"></div>
        <div class="pulse-ring-delayed"></div>
      </button>
    </transition>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}


/* ============================================
   BOTÓN FLOTANTE (FAB) - Mejorado
   ============================================ */

.chat-bubble {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 70px;
  height: 70px;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 
    0 8px 16px rgba(37, 99, 235, 0.3),
    0 4px 8px rgba(0, 0, 0, 0.15);
  z-index: 999;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: visible;
  /* Evitar tap en móvil */
  -webkit-tap-highlight-color: transparent;
}

.chat-bubble:hover {
  transform: scale(1.1) translateY(-4px);
  box-shadow: 
    0 12px 24px rgba(37, 99, 235, 0.4),
    0 6px 12px rgba(0, 0, 0, 0.2);
}

.chat-bubble:active {
  transform: scale(0.95);
}

.fab-content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* Estilos para el SVG del icono de chat del FAB (botón flotante) */
.fab-chat-icon {
  width: 36px;
  height: 36px;
  color: white; /* Color blanco para el icono de chat */
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-4px);
  }
}

/* Badge de notificación */
.notification-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
  border: 2px solid white;
  animation: bounce-badge 2s ease-in-out infinite;
}

@keyframes bounce-badge {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

/* Anillos de pulso alrededor del FAB */
.pulse-ring,
.pulse-ring-delayed {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 3px solid rgba(37, 99, 235, 0.6);
  border-radius: 50%;
  animation: pulse-ring-animation 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.pulse-ring-delayed {
  animation-delay: 1s;
}

@keyframes pulse-ring-animation {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50%, 100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* Animaciones de entrada/salida del FAB */
.fab-bounce-enter-active {
  animation: fab-bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fab-bounce-leave-active {
  animation: fab-bounce-out 0.3s ease-in;
}

@keyframes fab-bounce-in {
  0% {
    transform: scale(0) rotate(-180deg);
    opacity: 0;
  }
  60% {
    transform: scale(1.2) rotate(20deg);
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

@keyframes fab-bounce-out {
  0% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: scale(0) rotate(180deg);
    opacity: 0;
  }
}

/* ============================================
   VENTANA DE CHAT FLOTANTE
   ============================================ */

.chat-widget {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 440px;
  height: 650px;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  box-shadow: 
    0 0 0 1px rgba(255, 255, 255, 0.1),
    0 25px 50px -12px rgba(0, 0, 0, 0.5);
  background: #ffffff;
  overflow: hidden;
  z-index: 1000;
  /* Optimización para renderizado en móvil */
  backface-visibility: hidden;
  transform: translateZ(0);
}

/* Animaciones de entrada/salida del chat */
.chat-slide-enter-active {
  animation: chat-slide-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.chat-slide-leave-active {
  animation: chat-slide-out 0.3s ease-in;
}

@keyframes chat-slide-in {
  0% {
    transform: translateY(100%) scale(0.8);
    opacity: 0;
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

@keyframes chat-slide-out {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(100%) scale(0.8);
    opacity: 0;
  }
}

/* Header del chat */
.chat-header {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%);
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  position: relative;
  flex-shrink: 0; /* Asegura que el header no se encoja */
}

.chat-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 100%);
  pointer-events: none;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 14px;
  position: relative;
  z-index: 1;
}

.bot-avatar-small {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

/* Estilos para el logo DTF en el header */
.header-dtf-logo {
  width: 32px; 
  height: 32px;
  object-fit: contain;
}


.bot-info h3 {
  color: white;
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 3px;
  letter-spacing: -0.01em;
}

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.95);
  font-size: 13px;
  font-weight: 500;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #34d399;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.3);
  animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse-dot {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.1);
  }
}

.close-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  position: relative;
  z-index: 1;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.close-btn:active {
  transform: scale(0.95);
}

.close-btn svg {
  width: 20px;
  height: 20px;
  color: white;
}

/* Historial de mensajes */
.chat-history {
  flex-grow: 1;
  overflow-y: auto;
  overflow-x: hidden; /* Evitar scroll horizontal accidental */
  background: linear-gradient(to bottom, #f8fafc 0%, #f1f5f9 100%);
  position: relative;
  /* Scroll suave en iOS */
  -webkit-overflow-scrolling: touch;
}

.chat-history::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(to bottom, #f8fafc, transparent);
  pointer-events: none;
  z-index: 1;
}

.messages-container {
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.chat-history::-webkit-scrollbar {
  width: 6px;
}

.chat-history::-webkit-scrollbar-track {
  background: transparent;
}

.chat-history::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
  transition: background 0.2s;
}

.chat-history::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.message-wrapper {
  display: flex;
  gap: 10px;
  animation: messageSlide 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  max-width: 100%; /* Asegura que no rompa el ancho */
}

@keyframes messageSlide {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.message-wrapper.bot {
  justify-content: flex-start;
}

.message-wrapper.user {
  justify-content: flex-end;
}

.message-avatar {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
  overflow: hidden;
}

/* Estilos para el logo DTF en los mensajes del bot */
.message-dtf-logo {
  width: 22px; 
  height: 22px;
  object-fit: contain;
}


.message-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 75%; /* Ligeramente más ancho para móvil */
}

.message-bubble {
  padding: 14px 18px;
  border-radius: 18px;
  position: relative;
  word-wrap: break-word;
  transition: all 0.2s ease;
}

.message-wrapper.bot .message-bubble {
  background: white;
  color: #0f172a;
  border-bottom-left-radius: 6px;
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.05),
    0 0 0 1px rgba(0, 0, 0, 0.05);
}

.message-wrapper.bot .message-bubble:hover {
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.message-wrapper.user .message-content {
  align-items: flex-end;
}

.message-wrapper.user .message-bubble {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border-bottom-right-radius: 6px;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.message-wrapper.user .message-bubble:hover {
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
  transform: translateY(-1px);
}

.message-bubble p {
  margin: 0;
  line-height: 1.6;
  font-size: 15px;
  font-weight: 500;
  
  white-space: pre-wrap; /* Esto permite que los <br> que añadimos funcionen */
  word-wrap: break-word; /* Asegura que no se rompa el layout */
  overflow-wrap: break-word; /* Prevención extra para URLs largas */
}

.message-time {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
  padding: 0 4px;
}

/* Indicador de "escribiendo..." */
.typing-bubble {
  padding: 16px 20px;
  background: white !important;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  align-items: center;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #3b82f6;
  border-radius: 50%;
  animation: typing-bounce 1.4s infinite both;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.7;
  }
  30% {
    transform: translateY(-8px);
    opacity: 1;
  }
}

/* Botones de opciones */
.button-container {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;   /* <-- Añade scroll horizontal */
  padding-bottom: 12px; /* <-- Espacio para la barra de scroll */

  gap: 8px;
  margin-top: 8px;
  max-width: 100%; /* Contener dentro de la burbuja */

  /* Añade esto para un "final" más suave en iOS */
  -webkit-overflow-scrolling: touch; 
}

/* (Opcional) Estiliza la barra de scroll para que sea sutil */
.button-container::-webkit-scrollbar {
  height: 6px;
}
.button-container::-webkit-scrollbar-track {
  background: transparent;
}
.button-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.button-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.option-btn {
  /* Añade esto para que los botones no se encojan */
  flex-shrink: 0;

  background: white;
  border: 2px solid #3b82f6;
  color: #3b82f6;
  padding: 10px 18px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
  font-family: inherit;
}

.option-btn:hover {
  background: #3b82f6;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.option-btn:active {
  transform: translateY(0);
}

/* Upload de archivo */
.upload-container {
  margin-top: 8px;
}

.upload-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #3b82f6;
  color: white;
  padding: 10px 18px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.upload-label:hover {
  background: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.upload-label svg {
  width: 18px;
  height: 18px;
}

.upload-label input[type="file"] {
  display: none;
}

/* Input de mensajes */
.chat-input-container {
  background: white;
  border-top: 1px solid #e2e8f0;
  padding: 16px 20px 12px;
  flex-shrink: 0; /* Asegura que no se aplaste */
}

.chat-input {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 6px 8px;
  transition: all 0.2s ease;
}

.chat-input:focus-within {
  background: white;
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.attachment-btn svg {
  width: 20px;
  height: 20px;
  color: #64748b;
}

.attachment-btn:hover {
  background: #e2e8f0;
}

.attachment-btn:hover svg {
  color: #3b82f6;
}

.chat-input input {
  flex-grow: 1;
  border: none;
  background: transparent;
  padding: 10px 8px;
  font-size: 15px;
  font-family: inherit;
  color: #0f172a;
  font-weight: 500;
  min-width: 0; /* Permite encogerse en flex */
}

.chat-input input::placeholder {
  color: #94a3b8;
  font-weight: 400;
}

.chat-input input:focus {
  outline: none;
}

.send-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
}

.send-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.send-btn svg {
  width: 20px;
  height: 20px;
}

.input-helper {
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  margin-top: 8px;
  font-weight: 500;
}

/* ============================================
   RESPONSIVE (MÓVIL TOTALMENTE OPTIMIZADO)
   ============================================ */
@media (max-width: 640px) { /* Aumentado a 640px para cubrir teléfonos grandes */
  
  .chat-widget {
    width: 100% !important;
    /* Usar altura dinámica para evitar problemas con la barra de URL en móvil */
    height: 100dvh !important; 
    /* Fallback para navegadores antiguos */
    height: 100vh;
    border-radius: 0;
    bottom: 0 !important;
    right: 0 !important;
    top: 0 !important;
    margin: 0;
    
    /* Layout seguro para flex */
    display: flex;
    flex-direction: column;
  }
  
  /* Ajustar header */
  .chat-header {
    border-radius: 0;
    padding: 16px 20px;
    padding-top: max(16px, env(safe-area-inset-top)); /* Notch support */
  }

  /* Ajustar contenedor de mensajes */
  .messages-container {
    padding: 16px 14px;
    padding-bottom: 20px;
  }

  .message-content {
    max-width: 82%; /* Usar más espacio en móvil */
  }

  /* Ajustar input para teclado móvil */
  .chat-input-container {
    /* Padding inferior seguro para iPhones sin botón físico */
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }

  /* IMPORTANTÍSIMO: Evitar zoom automático en iOS al hacer focus */
  .chat-input input {
    font-size: 16px; 
  }

  /* Ocultar texto de ayuda en móvil para ganar espacio */
  .input-helper {
    display: none;
  }
  
  /* Botón flotante más pequeño si se llega a ver */
  .chat-bubble {
    bottom: 20px;
    right: 20px;
    width: 60px;
    height: 60px;
  }

  .fab-chat-icon {
    width: 28px;
    height: 28px;
  }

  .notification-badge {
    width: 20px;
    height: 20px;
    font-size: 11px;
    top: -2px;
    right: -2px;
  }
}

/* Estilos para el texto en negrita (<strong>) */
.message-bubble p strong {
  font-weight: 700;
}

/* Estilos para los links (<a>) */
.message-bubble p a {
  text-decoration: underline;
  font-weight: 600;
}

/* Links en las burbujas del bot (azules) */
.message-wrapper.bot .message-bubble p a {
  color: #2563eb; 
}

/* Links en las burbujas del usuario (blancos) */
.message-wrapper.user .message-bubble p a {
  color: #ffffff;
}

/* ESTILOS PARA EL NUEVO DROPDOWN */
.dropdown-container {
  margin-top: 12px;
}
.dropdown-select {
  width: 100%;
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 500;
  font-family: inherit;
  color: #0f172a;
  background-color: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  appearance: none; /* Quita el estilo feo por defecto del navegador */
  
  /* Añade una flecha personalizada */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd' /%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 20px;
  transition: all 0.2s ease;
}
.dropdown-select:hover {
  border-color: #cbd5e1;
}
.dropdown-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  background-color: #ffffff;
}

/* ESTILOS PARA EL NUEVO GRID DE BOTONES */

.grid-container {
  display: grid;
  grid-template-columns: 1fr 1fr; /* 2 columnas de igual tamaño */
  gap: 8px; /* Espacio entre botones */
  margin-top: 12px;
}

.grid-btn {
  /* Estilos que ya tenías */
  background: white;
  border: 2px solid #3b82f6;
  color: #3b82f6;
  padding: 12px 10px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
  font-family: inherit;
  width: 100%;
  text-align: center;
  
  /* Permite que el texto se divida en múltiples líneas */
  white-space: normal; 
  word-wrap: break-word;
  
  /* Centrado vertical y alineación */
  display: flex; 
  align-items: center; /* Centra el texto verticalmente */
  justify-content: center; /* Centra el texto horizontalmente */
  
  /* Asegura un alto mínimo para botones con poco texto */
  min-height: 50px; 
}

.grid-btn:hover {
  background: #3b82f6;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.grid-btn:active {
  transform: translateY(0);
}

/* Estilos para el botón de micrófono */
.mic-btn {
  color: #64748b;
  display: flex;            /* Asegura centrado */
  align-items: center;      /* Asegura centrado vertical */
  justify-content: center;  /* Asegura centrado horizontal */
}

.mic-btn svg {
  width: 26px;  /* Este es el tamaño estándar (igual al clip) */
  height: 26px;
  transition: all 0.2s ease;
}

.mic-btn:hover {
  background: #e2e8f0;
  color: #3b82f6;
}

/* Estado GRABANDO */
.mic-btn.recording {
  color: #ef4444; /* Rojo */
  background: rgba(239, 68, 68, 0.1);
  animation: pulse-red 1.5s infinite;
}

@keyframes pulse-red {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}
</style>
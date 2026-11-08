// assets/js/firebase-config.js
// Config y exports centrales de Firebase para todo el portal SAFI

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ✅ Configuración de tu proyecto SAFI
const firebaseConfig = {
  apiKey: "AIzaSyBa5BaqcYKq_OXDD61uWmZJOdwLVuGkTJE",
  authDomain: "safi-timesheets.firebaseapp.com",
  projectId: "safi-timesheets",
  storageBucket: "safi-timesheets.appspot.com", // no se usa por ahora, pero no molesta
  messagingSenderId: "312767164534",
  appId: "1:312767164534:web:e9215af0a9ecb36bcd6f57",
  measurementId: "G-G6SH6GEWVR"
};

// Inicializar app
const app = initializeApp(firebaseConfig);

// Exports para el resto de archivos
export const auth = getAuth(app);
export const db = getFirestore(app);
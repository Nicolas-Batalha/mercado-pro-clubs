// =========================================================================
// MERCADO PRO CLUBS — firebase-config.js
// Único arquivo que chama initializeApp().
// Todos os outros módulos importam { auth, db } daqui.
// =========================================================================

import { initializeApp }                        from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth }                              from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore }                         from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA6X9ExKAaNCDdpCr-4h8rUVDMFANRB7Ag",
  authDomain:        "mercado-pro-clubs.firebaseapp.com",
  projectId:         "mercado-pro-clubs",
  storageBucket:     "mercado-pro-clubs.firebasestorage.app",
  messagingSenderId: "1018354864332",
  appId:             "1:1018354864332:web:8a60b4a80942c490c43269",
  measurementId:     "G-97YN402WJF"
};

const app  = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
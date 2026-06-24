// =========================================================================
// MERCADO PRO CLUBS — HEADER AUTH
// Detecta login e troca botões "Entrar/Cadastrar" pelo avatar do usuário
// =========================================================================

import { initializeApp }            from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const auth = getAuth(app);
const db   = getFirestore(app);

// Detecta se está na raiz (index.html) ou dentro de HTML/
const base = window.location.pathname.includes('/HTML/') ? '../' : './';

// ─── LÊ FOTO DO INDEXEDDB (salva na página de perfil) ──────────────────────
function carregarFotoIndexedDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open('mercadoProClubs', 1);
    req.onsuccess = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('fotoPerfil')) return resolve(null);
      const get = idb.transaction('fotoPerfil').objectStore('fotoPerfil').get('foto');
      get.onsuccess = (e) => resolve(e.target.result || null);
      get.onerror   = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

// ─── ESTADO: DESLOGADO → botões Entrar + Cria Conta ────────────────────────
function renderDeslogado(container) {
  container.innerHTML = `
    <a href="${base}HTML/cadastrar-se.html" class="login">Entrar</a>
    <a href="${base}HTML/cadastrar-se.html" class="cadastra-se">Cria conta</a>
  `;
}

// ─── ESTADO: LOGADO → avatar com dropdown ──────────────────────────────────
function renderLogado(container) {
  container.innerHTML = `
    <div class="header-usuario" id="header-usuario">
      <div class="hu-avatar-wrap">
        <img
          id="hu-foto"
          src="${base}IMG/user-icon.svg"
          class="hu-foto"
          alt="foto do usuário"
          onerror="this.src='${base}IMG/user-icon.svg'"
        />
        <span class="hu-status-dot"></span>
      </div>
      <span class="hu-nome" id="hu-nome">...</span>

      <div class="hu-dropdown" id="hu-dropdown">
        <a href="${base}HTML/meu-perfil.html" class="hu-drop-item">👤 Meu Perfil</a>
        <a href="${base}HTML/mercado.html"    class="hu-drop-item">🏪 Mercado</a>
        <a href="${base}HTML/torneio.html"    class="hu-drop-item">🏆 Torneios</a>
        <div class="hu-drop-divider"></div>
        <button class="hu-drop-item hu-sair" id="hu-btn-sair">🚪 Sair</button>
      </div>
      <div>
    </div>
  `;

  // Abre/fecha dropdown
  const widget = document.getElementById('header-usuario');
  widget.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('hu-dropdown').classList.toggle('aberto');
  });
  document.addEventListener('click', () => {
    document.getElementById('hu-dropdown')?.classList.remove('aberto');
  });

  // Botão Sair
  document.getElementById('hu-btn-sair').addEventListener('click', async (e) => {
    e.stopPropagation();
    await signOut(auth);
    // Volta para index ou página de login
    window.location.href = `${base}HTML/cadastrar-se.html`;
  });
}

// ─── PREENCHE FOTO E NOME ───────────────────────────────────────────────────
async function preencherWidget(usuario) {
  const elFoto = document.getElementById('hu-foto');
  const elNome = document.getElementById('hu-nome');

  // 1. Foto do Google primeiro
  if (usuario.photoURL && elFoto) {
    elFoto.src = usuario.photoURL;
  }

  // 2. Foto local do IndexedDB (sobrescreve se existir, pois é a escolhida pelo usuário)
  try {
    const blob = await carregarFotoIndexedDB();
    if (blob && elFoto) elFoto.src = URL.createObjectURL(blob);
  } catch (_) {}

  // 3. Nickname do Firestore
  try {
    const snap = await getDoc(doc(db, 'jogadores', usuario.uid));
    const nome = snap.exists()
      ? (snap.data().nickname || usuario.displayName || 'Jogador')
      : (usuario.displayName || 'Jogador');
    if (elNome) elNome.textContent = nome;
  } catch (_) {
    if (elNome) elNome.textContent = usuario.displayName || 'Jogador';
  }
}

// ─── LISTENER PRINCIPAL ─────────────────────────────────────────────────────
onAuthStateChanged(auth, (usuario) => {
  // Funciona no #login-header (index) e também no .main-header direto (outras páginas)
  const container = document.getElementById('login-header')
                 || document.querySelector('.main-header');
  if (!container) return;

  if (usuario) {
    renderLogado(container);
    preencherWidget(usuario);
  } else {
    renderDeslogado(container);
  }
});
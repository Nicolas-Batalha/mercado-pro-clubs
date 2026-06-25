// =========================================================================
// MERCADO PRO CLUBS — HEADER AUTH
// Detecta login e troca botões "Entrar/Cadastrar" pelo avatar do usuário
// =========================================================================

import { initializeApp }                        from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc }            from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig }                       from "./firebase-config.js";

const auth = getAuth(initializeApp(firebaseConfig));
const db   = getFirestore();

// Detecta se está na raiz (index.html) ou dentro de HTML/
const base = window.location.pathname.includes('/HTML/') ? '../' : './';

// ─── Foto do IndexedDB (salva na página de perfil) ────────────────────────────
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

// ─── Render: deslogado ────────────────────────────────────────────────────────
function renderDeslogado(container) {
  container.innerHTML = `
    <a href="${base}HTML/cadastrar-se.html" class="login">Entrar</a>
    <a href="${base}HTML/cadastrar-se.html" class="cadastra-se">Cria conta</a>
  `;
}

// ─── Render: logado ───────────────────────────────────────────────────────────
function renderLogado(container) {
  container.innerHTML = `
    <div class="header-usuario" id="header-usuario">
      <div class="hu-avatar-wrap">
        <img id="hu-foto" src="${base}IMG/user-icon.svg" class="hu-foto" alt="foto do usuário"
             onerror="this.src='${base}IMG/user-icon.svg'" />
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
    </div>
  `;

  const widget = document.getElementById('header-usuario');
  widget.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('hu-dropdown').classList.toggle('aberto');
  });
  document.addEventListener('click', () => {
    document.getElementById('hu-dropdown')?.classList.remove('aberto');
  });

  document.getElementById('hu-btn-sair').addEventListener('click', async (e) => {
    e.stopPropagation();
    await signOut(auth);
    window.location.href = `${base}HTML/cadastrar-se.html`;
  });
}

// ─── Preenche foto e nome ─────────────────────────────────────────────────────
async function preencherWidget(usuario) {
  const elFoto = document.getElementById('hu-foto');
  const elNome = document.getElementById('hu-nome');

  if (usuario.photoURL && elFoto) elFoto.src = usuario.photoURL;

  // Foto local sobrescreve a do Google (escolhida pelo usuário)
  try {
    const blob = await carregarFotoIndexedDB();
    if (blob && elFoto) elFoto.src = URL.createObjectURL(blob);
  } catch (_) {}

  // Nickname do Firestore
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

// ─── Listener principal ───────────────────────────────────────────────────────
onAuthStateChanged(auth, (usuario) => {
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
// =========================================================================
// MERCADO PRO CLUBS - HEADER COM USUÁRIO LOGADO
// Inclua este script (type="module") em todas as páginas
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6X9ExKAaNCDdpCr-4h8rUVDMFANRB7Ag",
  authDomain: "mercado-pro-clubs.firebaseapp.com",
  projectId: "mercado-pro-clubs",
  storageBucket: "mercado-pro-clubs.firebasestorage.app",
  messagingSenderId: "1018354864332",
  appId: "1:1018354864332:web:8a60b4a80942c490c43269",
  measurementId: "G-97YN402WJF"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─── CRIA O WIDGET DO USUÁRIO NO HEADER ──────────────
function criarWidgetUsuario() {
  // Evita duplicar se já existir
  if (document.getElementById('header-usuario')) return;

  const widget = document.createElement('div');
  widget.id = 'header-usuario';
  widget.className = 'header-usuario';
  widget.innerHTML = `
    <div class="hu-avatar-wrap">
      <img id="hu-foto" src="../IMG/user-icon.svg" class="hu-foto" alt="foto do usuário" />
      <span class="hu-status-dot"></span>
    </div>
    <div class="hu-info">
      <span class="hu-nome" id="hu-nome">Carregando...</span>
      <span class="hu-email" id="hu-email"></span>
    </div>
    <div class="hu-dropdown" id="hu-dropdown">
      <a href="../HTML/meu-perfil.html" class="hu-drop-item">👤 Meu Perfil</a>
      <a href="../HTML/mercado.html"    class="hu-drop-item">🏪 Mercado</a>
      <a href="../HTML/torneio.html"    class="hu-drop-item">🏆 Torneios</a>
      <div class="hu-drop-divider"></div>
      <button class="hu-drop-item hu-sair" id="hu-btn-sair">🚪 Sair</button>
    </div>
  `;

  // Insere no header, depois do menu
  const header = document.querySelector('.main-header');
  if (header) header.appendChild(widget);

  // Toggle dropdown ao clicar no avatar
  widget.addEventListener('click', (e) => {
    e.stopPropagation();
    const drop = document.getElementById('hu-dropdown');
    drop.classList.toggle('aberto');
  });

  // Fecha ao clicar fora
  document.addEventListener('click', () => {
    document.getElementById('hu-dropdown')?.classList.remove('aberto');
  });

  // Botão sair
  document.getElementById('hu-btn-sair').addEventListener('click', async (e) => {
    e.stopPropagation();
    await signOut(auth);
    window.location.href = '../HTML/cadastrar-se.html';
  });
}

// ─── PREENCHE COM OS DADOS DO USUÁRIO ────────────────
async function preencherWidget(usuario) {
  const elNome  = document.getElementById('hu-nome');
  const elEmail = document.getElementById('hu-email');
  const elFoto  = document.getElementById('hu-foto');

  // Email como fallback
  if (elEmail) elEmail.textContent = usuario.email;

  // Foto do Google (se fez login com Google)
  if (usuario.photoURL && elFoto) {
    elFoto.src = usuario.photoURL;
  }

  // Tenta buscar o nickname salvo no Firestore
  try {
    const snap = await getDoc(doc(db, 'jogadores', usuario.uid));
    if (snap.exists()) {
      const dados = snap.data();
      if (elNome) elNome.textContent = dados.nickname || usuario.displayName || 'Jogador';
    } else {
      if (elNome) elNome.textContent = usuario.displayName || 'Jogador';
    }
  } catch (e) {
    if (elNome) elNome.textContent = usuario.displayName || 'Jogador';
  }
}

// ─── ESCUTA O ESTADO DE LOGIN ─────────────────────────
onAuthStateChanged(auth, (usuario) => {
  criarWidgetUsuario();

  if (usuario) {
    preencherWidget(usuario);
  } else {
    // Não logado: mostra botão de entrar
    const elNome  = document.getElementById('hu-nome');
    const elEmail = document.getElementById('hu-email');
    if (elNome)  elNome.textContent  = 'Entrar';
    if (elEmail) elEmail.textContent = 'Faça seu login';

    // Clique no widget leva para cadastro
    const widget = document.getElementById('header-usuario');
    if (widget) {
      widget.style.cursor = 'pointer';
      widget.addEventListener('click', () => {
        window.location.href = '../HTML/cadastrar-se.html';
      }, { once: true });
    }
  }
});
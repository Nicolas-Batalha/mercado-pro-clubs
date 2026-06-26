// =========================================================================
// MERCADO PRO CLUBS — header-auth.js
// Responsabilidade: detectar login e renderizar avatar ou botões no header.
// NÃO chama initializeApp — importa auth e db de firebase-config.js.
// =========================================================================

import { auth, db }                             from "./firebase-config.js";
import { onAuthStateChanged, signOut }          from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc }                          from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Detecta se está na raiz ou dentro de HTML/
const base = window.location.pathname.includes("/HTML/") ? "../" : "./";

// ─── Render: deslogado ────────────────────────────────────────────────────────
function renderDeslogado(container) {
  container.innerHTML = `
    <a href="${base}HTML/cadastrar-se.html" class="login">Entrar</a>
    <a href="${base}HTML/cadastrar-se.html" class="cadastra-se">Criar conta</a>
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

  document.getElementById("header-usuario").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("hu-dropdown").classList.toggle("aberto");
  });
  document.addEventListener("click", () => {
    document.getElementById("hu-dropdown")?.classList.remove("aberto");
  });
  document.getElementById("hu-btn-sair").addEventListener("click", async (e) => {
    e.stopPropagation();
    await signOut(auth);
    window.location.href = `${base}HTML/cadastrar-se.html`;
  });
}

// ─── Preenche foto e nome após login ─────────────────────────────────────────
async function preencherWidget(usuario) {
  const elFoto = document.getElementById("hu-foto");
  const elNome = document.getElementById("hu-nome");

  // Foto do Google como ponto de partida
  if (usuario.photoURL && elFoto) elFoto.src = usuario.photoURL;

  // Tenta pegar nickname e foto do Firestore
  try {
    const snap = await getDoc(doc(db, "jogadores", usuario.uid));
    if (snap.exists()) {
      const dados = snap.data();
      if (elNome) elNome.textContent = dados.nickname || usuario.displayName || "Jogador";
      if (elFoto && dados.fotoURL) elFoto.src = dados.fotoURL;
    } else {
      if (elNome) elNome.textContent = usuario.displayName || "Jogador";
    }
  } catch {
    if (elNome) elNome.textContent = usuario.displayName || "Jogador";
  }
}

// ─── Listener principal ───────────────────────────────────────────────────────
onAuthStateChanged(auth, (usuario) => {
  const container = document.getElementById("login-header");
  if (!container) return;

  if (usuario) {
    renderLogado(container);
    preencherWidget(usuario);
  } else {
    renderDeslogado(container);
  }
});
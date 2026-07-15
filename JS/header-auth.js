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
let removerCliqueDocumento = null;

function imagemSegura(src) {
  const valor = String(src || "").trim();
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(valor)) return valor;
  if (/^https:\/\//i.test(valor)) return valor;
  return "";
}

// ─── Render: deslogado ────────────────────────────────────────────────────────
function renderDeslogado(container) {
  removerCliqueDocumento?.();
  removerCliqueDocumento = null;
  container.innerHTML = `
    <a href="${base}HTML/cadastrar-se.html#login" class="login">Entrar</a>
    <a href="${base}HTML/cadastrar-se.html#cadastro" class="cadastra-se">Criar conta</a>
  `;
}

// ─── Render: logado ───────────────────────────────────────────────────────────
function renderLogado(container) {
  removerCliqueDocumento?.();
  container.innerHTML = `
    <div class="header-usuario" id="header-usuario">
      <div class="hu-avatar-wrap">
        <img id="hu-foto" src="${base}IMG/user-icon.svg" class="hu-foto" alt="Foto do usuário" />
        <span class="hu-status-dot"></span>
      </div>
      <span class="hu-nome" id="hu-nome">...</span>
      <div class="hu-dropdown" id="hu-dropdown">
        <a href="${base}HTML/meu-perfil.html" class="hu-drop-item">👤 Meu Perfil</a>
        <a href="${base}HTML/mercado.html"    class="hu-drop-item">🏪 Vagas e Jogadores</a>
        <a href="${base}HTML/negociacoes.html" class="hu-drop-item">🤝 Minhas Negociações</a>
        <a href="${base}HTML/explorar-clubes.html" class="hu-drop-item">🔎 Explorar Clubes</a>
        <a href="${base}HTML/clubes.html"    class="hu-drop-item">🏟 Meu Clube</a>
        <div class="hu-drop-divider"></div>
        <button class="hu-drop-item hu-sair" id="hu-btn-sair">🚪 Sair</button>
      </div>
    </div>
  `;

  const headerUsuario = document.getElementById("header-usuario");
  const dropdown = document.getElementById("hu-dropdown");
  const foto = document.getElementById("hu-foto");
  foto?.addEventListener("error", () => {
    if (!foto.src.endsWith("/IMG/user-icon.svg")) foto.src = `${base}IMG/user-icon.svg`;
  });

  headerUsuario?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle("aberto");
  });
  const fecharDropdown = () => dropdown?.classList.remove("aberto");
  document.addEventListener("click", fecharDropdown);
  removerCliqueDocumento = () => document.removeEventListener("click", fecharDropdown);

  document.getElementById("hu-btn-sair")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    e.currentTarget.disabled = true;
    try {
      await signOut(auth);
      window.location.href = `${base}HTML/cadastrar-se.html#login`;
    } catch (err) {
      console.error("Erro ao sair:", err);
      e.currentTarget.disabled = false;
    }
  });
}

// ─── Preenche foto e nome após login ─────────────────────────────────────────
async function preencherWidget(usuario) {
  const elFoto = document.getElementById("hu-foto");
  const elNome = document.getElementById("hu-nome");

  // Foto do Google como ponto de partida
  const fotoGoogle = imagemSegura(usuario.photoURL);
  if (fotoGoogle && elFoto) elFoto.src = fotoGoogle;

  // Tenta pegar nickname e foto do Firestore
  try {
    const snap = await getDoc(doc(db, "jogadores", usuario.uid));
    if (auth.currentUser?.uid !== usuario.uid) return;
    if (snap.exists()) {
      const dados = snap.data();
      if (elNome) elNome.textContent = dados.nickname || usuario.displayName || "Jogador";
      const fotoPerfil = imagemSegura(dados.fotoURL);
      if (elFoto && fotoPerfil) elFoto.src = fotoPerfil;
    } else {
      if (elNome) elNome.textContent = usuario.displayName || "Jogador";
    }
  } catch {
    if (elNome) elNome.textContent = usuario.displayName || "Jogador";
  }
}

// ─── Listener principal ───────────────────────────────────────────────────────
// Exibe o acesso ao painel somente quando o usuário possui admins/{uid} ativo.
// As regras do Firestore continuam sendo a proteção real dos dados administrativos.
async function configurarAcessoAdmin(usuario) {
  try {
    const snap = await getDoc(doc(db, "admins", usuario.uid));
    if (auth.currentUser?.uid !== usuario.uid || !snap.exists() || snap.data().ativo !== true) return;

    const dropdown = document.getElementById("hu-dropdown");
    const divisor = dropdown?.querySelector(".hu-drop-divider");
    if (!dropdown || !divisor || document.getElementById("hu-admin-link")) return;

    const link = document.createElement("a");
    link.id = "hu-admin-link";
    link.href = `${base}HTML/admin.html`;
    link.className = "hu-drop-item hu-admin-item";
    link.textContent = "🛡 Painel administrativo";
    divisor.before(link);
  } catch (erro) {
    // Usuários comuns podem não ter permissão de leitura; isso não afeta o menu normal.
    console.debug("Acesso administrativo indisponível:", erro?.code || erro?.message);
  }
}

onAuthStateChanged(auth, (usuario) => {
  const container = document.getElementById("login-header");
  if (!container) return;

  if (usuario) {
    renderLogado(container);
    preencherWidget(usuario);
    configurarAcessoAdmin(usuario);
  } else {
    renderDeslogado(container);
  }
});

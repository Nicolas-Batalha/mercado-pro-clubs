// Cabeçalho compartilhado: autenticação, atalhos, pendências e convites.
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const base = window.location.pathname.includes("/HTML/") ? "../" : "./";
const URL_SITE = "https://www.mercadoproclubs.com";
let removerCliqueDocumento = null;
let pararObservadores = [];
let temporizadorTorneios = null;
let usuarioObservadoUid = "";

const contadores = {
  candidaturas: 0,
  respostas: 0,
  convites: 0,
  torneios: 0,
};

function imagemSegura(src) {
  const valor = String(src || "").trim();
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(valor)) return valor;
  if (/^https:\/\//i.test(valor)) return valor;
  return "";
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atualizarBadge(id, total) {
  const elemento = document.getElementById(id);
  if (!elemento) return;
  elemento.textContent = total > 99 ? "99+" : String(total);
  elemento.hidden = total <= 0;
}

function atualizarContadores() {
  const negociacoes = contadores.candidaturas + contadores.respostas + contadores.convites;
  const total = negociacoes + contadores.torneios;
  atualizarBadge("hu-negociacoes-badge", negociacoes);
  atualizarBadge("hu-torneios-badge", contadores.torneios);
  atualizarBadge("hu-total-badge", total);
  const usuario = document.getElementById("header-usuario");
  if (usuario) {
    usuario.setAttribute(
      "aria-label",
      total ? `Abrir conta, ${total} pendência${total === 1 ? "" : "s"}` : "Abrir conta",
    );
  }
}

function pararNotificacoes() {
  pararObservadores.forEach((parar) => {
    try { parar(); } catch { /* observador já encerrado */ }
  });
  pararObservadores = [];
  if (temporizadorTorneios) window.clearInterval(temporizadorTorneios);
  temporizadorTorneios = null;
  usuarioObservadoUid = "";
  Object.keys(contadores).forEach((chave) => { contadores[chave] = 0; });
  atualizarContadores();
}

function observarConsulta(consulta, chave, calcular) {
  const parar = onSnapshot(
    consulta,
    (snapshot) => {
      contadores[chave] = snapshot.docs.filter((registro) => calcular(registro.data())).length;
      atualizarContadores();
    },
    (erro) => console.debug(`Pendências de ${chave} indisponíveis:`, erro?.code || erro?.message),
  );
  pararObservadores.push(parar);
}

async function atualizarPendenciasTorneios(uid) {
  if (!uid || auth.currentUser?.uid !== uid) return;
  try {
    const [comoTimeA, comoTimeB] = await Promise.all([
      getDocs(query(collectionGroup(db, "partidas"), where("timeAId", "==", uid))),
      getDocs(query(collectionGroup(db, "partidas"), where("timeBId", "==", uid))),
    ]);
    const unicas = new Map();
    [...comoTimeA.docs, ...comoTimeB.docs].forEach((registro) => unicas.set(registro.ref.path, registro));
    const pendentes = [...unicas.values()].filter((registro) => {
      const status = String(registro.data().status || "pendente").toLowerCase();
      return !["finalizado", "encerrado", "concluido"].includes(status);
    });
    const verificacoes = await Promise.all(pendentes.map(async (registro) => {
      const partes = registro.ref.path.split("/");
      const torneioId = partes[1];
      const partidaId = partes[3];
      if (!torneioId || !partidaId) return false;
      try {
        const envio = await getDoc(doc(db, "torneios", torneioId, "partidas", partidaId, "envios", uid));
        return !envio.exists();
      } catch {
        return false;
      }
    }));
    if (auth.currentUser?.uid !== uid) return;
    contadores.torneios = verificacoes.filter(Boolean).length;
    atualizarContadores();
  } catch (erro) {
    console.debug("Pendências de torneios indisponíveis:", erro?.code || erro?.message);
  }
}

function iniciarNotificacoes(usuario) {
  pararNotificacoes();
  const uid = usuario.uid;
  usuarioObservadoUid = uid;

  observarConsulta(
    query(collection(db, "candidaturas"), where("capitaoUid", "==", uid)),
    "candidaturas",
    (dados) => String(dados.status || "").toLowerCase() === "pendente",
  );
  observarConsulta(
    query(collection(db, "candidaturas"), where("jogadorUid", "==", uid)),
    "respostas",
    (dados) => String(dados.status || "").toLowerCase() === "aceito" && dados.jogadorViu !== true,
  );
  observarConsulta(
    query(collection(db, "convitesClube"), where("jogadorUid", "==", uid)),
    "convites",
    (dados) => String(dados.status || "").toLowerCase() === "pendente",
  );

  atualizarPendenciasTorneios(uid);
  temporizadorTorneios = window.setInterval(() => atualizarPendenciasTorneios(uid), 90000);
}

function renderDeslogado(container) {
  pararNotificacoes();
  removerCliqueDocumento?.();
  removerCliqueDocumento = null;
  document.getElementById("sino-btn")?.setAttribute("hidden", "");
  document.getElementById("emailIcon")?.setAttribute("hidden", "");
  container.innerHTML = `
    <a href="${base}HTML/cadastrar-se.html#login" class="login">Entrar</a>
    <a href="${base}HTML/cadastrar-se.html#cadastro" class="cadastra-se">Criar conta</a>
  `;
}

function renderLogado(container) {
  removerCliqueDocumento?.();
  container.innerHTML = `
    <div class="header-usuario" id="header-usuario" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false">
      <div class="hu-avatar-wrap">
        <img id="hu-foto" src="${base}IMG/user-icon.svg" class="hu-foto" alt="Foto do usuário" />
        <span class="hu-status-dot"></span>
        <span class="hu-total-badge" id="hu-total-badge" hidden>0</span>
      </div>
      <span class="hu-nome" id="hu-nome">...</span>
      <div class="hu-dropdown" id="hu-dropdown" role="menu">
        <a href="${base}HTML/meu-perfil.html" class="hu-drop-item" role="menuitem"><span>👤 Meu perfil</span></a>
        <a href="${base}HTML/mercado.html" class="hu-drop-item" role="menuitem"><span>🏪 Vagas e jogadores</span></a>
        <a href="${base}HTML/negociacoes.html" class="hu-drop-item" role="menuitem">
          <span>🤝 Minhas negociações</span><strong class="hu-item-badge" id="hu-negociacoes-badge" hidden>0</strong>
        </a>
        <a href="${base}HTML/explorar-clubes.html" class="hu-drop-item" role="menuitem"><span>🔎 Explorar clubes</span></a>
        <a href="${base}HTML/clubes.html" class="hu-drop-item" role="menuitem"><span>🏟 Meu clube</span></a>
        <a href="${base}HTML/torneio.html?aba=meus" class="hu-drop-item" role="menuitem">
          <span>🏆 Meus torneios</span><strong class="hu-item-badge" id="hu-torneios-badge" hidden>0</strong>
        </a>
        <div class="hu-drop-divider"></div>
        <button class="hu-drop-item hu-sair" id="hu-btn-sair" type="button" role="menuitem"><span>🚪 Sair</span></button>
      </div>
    </div>
  `;

  const headerUsuario = document.getElementById("header-usuario");
  const dropdown = document.getElementById("hu-dropdown");
  const foto = document.getElementById("hu-foto");
  foto?.addEventListener("error", () => {
    if (!foto.src.endsWith("/IMG/user-icon.svg")) foto.src = `${base}IMG/user-icon.svg`;
  });

  const alternarDropdown = () => {
    const aberto = dropdown?.classList.toggle("aberto") || false;
    headerUsuario?.setAttribute("aria-expanded", aberto ? "true" : "false");
  };
  headerUsuario?.addEventListener("click", (evento) => {
    if (evento.target.closest("a, button")) return;
    evento.stopPropagation();
    alternarDropdown();
  });
  headerUsuario?.addEventListener("keydown", (evento) => {
    if (["Enter", " "].includes(evento.key) && !evento.target.closest("a, button")) {
      evento.preventDefault();
      alternarDropdown();
    }
  });
  const fecharDropdown = () => {
    dropdown?.classList.remove("aberto");
    headerUsuario?.setAttribute("aria-expanded", "false");
  };
  document.addEventListener("click", fecharDropdown);
  removerCliqueDocumento = () => document.removeEventListener("click", fecharDropdown);

  document.getElementById("hu-btn-sair")?.addEventListener("click", async (evento) => {
    evento.stopPropagation();
    evento.currentTarget.disabled = true;
    try {
      await signOut(auth);
      window.location.href = `${base}HTML/cadastrar-se.html#login`;
    } catch (erro) {
      console.error("Erro ao sair:", erro);
      evento.currentTarget.disabled = false;
    }
  });
  atualizarContadores();
}

async function preencherWidget(usuario) {
  const elFoto = document.getElementById("hu-foto");
  const elNome = document.getElementById("hu-nome");
  const fotoGoogle = imagemSegura(usuario.photoURL);
  if (fotoGoogle && elFoto) elFoto.src = fotoGoogle;

  try {
    const snap = await getDoc(doc(db, "jogadores", usuario.uid));
    if (auth.currentUser?.uid !== usuario.uid) return;
    const dados = snap.exists() ? snap.data() : {};
    if (elNome) elNome.textContent = dados.nickname || usuario.displayName || "Jogador";
    const fotoPerfil = imagemSegura(dados.fotoURL);
    if (elFoto && fotoPerfil) elFoto.src = fotoPerfil;
  } catch {
    if (elNome) elNome.textContent = usuario.displayName || "Jogador";
  }
}

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
    link.setAttribute("role", "menuitem");
    link.innerHTML = "<span>🛡 Painel administrativo</span>";
    divisor.before(link);
  } catch (erro) {
    console.debug("Acesso administrativo indisponível:", erro?.code || erro?.message);
  }
}

function copiarTexto(texto) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto);
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.opacity = "0";
  document.body.appendChild(campo);
  campo.select();
  const copiou = document.execCommand("copy");
  campo.remove();
  return copiou ? Promise.resolve() : Promise.reject(new Error("Falha ao copiar"));
}

function fecharCompartilhamento() {
  const modal = document.getElementById("hu-compartilhar-modal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("hu-modal-aberto");
}

function abrirCompartilhamento(opcoes = {}) {
  const modal = document.getElementById("hu-compartilhar-modal");
  if (!modal) return;
  const titulo = String(opcoes.titulo || "Convide seus amigos").trim();
  const texto = String(opcoes.texto || "Conheça o Mercado Pro Clubs, encontre jogadores, clubes e torneios.").trim();
  const url = new URL(String(opcoes.url || `${URL_SITE}/?origem=convite`), window.location.href).href;
  modal.dataset.titulo = titulo;
  modal.dataset.texto = texto;
  modal.dataset.url = url;
  modal.querySelector("[data-share-titulo]").textContent = titulo;
  modal.querySelector("[data-share-texto]").textContent = texto;
  modal.querySelector("[data-share-url]").textContent = url;
  modal.hidden = false;
  document.body.classList.add("hu-modal-aberto");
  modal.querySelector("[data-share='whatsapp']")?.focus();
}

window.mercadoCompartilhar = abrirCompartilhamento;

function criarMenuMobile() {
  const header = document.querySelector(".main-header");
  const menu = header?.querySelector(".menu-carrossel");
  if (!header || !menu || document.getElementById("header-menu-toggle")) return;

  if (!menu.id) menu.id = "menu-principal-site";

  const botao = document.createElement("button");
  botao.id = "header-menu-toggle";
  botao.className = "header-menu-toggle";
  botao.type = "button";
  botao.setAttribute("aria-label", "Abrir menu");
  botao.setAttribute("aria-expanded", "false");
  botao.setAttribute("aria-controls", menu.id);
  botao.innerHTML = "<span></span><span></span><span></span>";
  header.appendChild(botao);

  const definirMenu = (aberto) => {
    header.classList.toggle("menu-aberto", aberto);
    botao.setAttribute("aria-expanded", aberto ? "true" : "false");
    botao.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
  };

  botao.addEventListener("click", () => {
    definirMenu(!header.classList.contains("menu-aberto"));
  });
  menu.addEventListener("click", (evento) => {
    if (evento.target.closest("a")) definirMenu(false);
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") definirMenu(false);
  });

  const telaDesktop = window.matchMedia("(min-width: 769px)");
  const fecharNoDesktop = (evento) => {
    if (evento.matches) definirMenu(false);
  };
  telaDesktop.addEventListener?.("change", fecharNoDesktop);
}

function criarCentralCompartilhamento() {
  const loginHeader = document.querySelector(".login-header");
  const destino = document.getElementById("login-header");
  if (loginHeader && destino && !document.getElementById("hu-convidar-btn")) {
    const botao = document.createElement("button");
    botao.id = "hu-convidar-btn";
    botao.className = "hu-convidar-btn";
    botao.type = "button";
    botao.setAttribute("aria-label", "Convidar amigos");
    botao.innerHTML = '<span aria-hidden="true">↗</span><strong>Convidar</strong>';
    loginHeader.insertBefore(botao, destino);
    botao.addEventListener("click", () => abrirCompartilhamento());
  }

  if (!document.getElementById("hu-compartilhar-modal")) {
    const modal = document.createElement("div");
    modal.id = "hu-compartilhar-modal";
    modal.className = "hu-share-overlay";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="hu-share-modal" role="dialog" aria-modal="true" aria-labelledby="hu-share-titulo">
        <button type="button" class="hu-share-fechar" data-share-fechar aria-label="Fechar">×</button>
        <span class="hu-share-kicker">ESPALHE O PRO CLUBS</span>
        <h2 id="hu-share-titulo" data-share-titulo>Convide seus amigos</h2>
        <p data-share-texto>Conheça o Mercado Pro Clubs, encontre jogadores, clubes e torneios.</p>
        <div class="hu-share-link" data-share-url>${URL_SITE}/?origem=convite</div>
        <div class="hu-share-acoes">
          <button type="button" class="hu-share-whatsapp" data-share="whatsapp">WhatsApp</button>
          <button type="button" data-share="copiar">Copiar link</button>
          <button type="button" data-share="sistema">Outras opções</button>
        </div>
        <p class="hu-share-feedback" data-share-feedback aria-live="polite"></p>
      </section>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", async (evento) => {
      if (evento.target === modal || evento.target.closest("[data-share-fechar]")) {
        fecharCompartilhamento();
        return;
      }
      const botao = evento.target.closest("[data-share]");
      if (!botao) return;
      const titulo = modal.dataset.titulo || "Mercado Pro Clubs";
      const texto = modal.dataset.texto || "Conheça o Mercado Pro Clubs.";
      const url = modal.dataset.url || URL_SITE;
      const mensagem = `${texto}\n${url}`;
      const feedback = modal.querySelector("[data-share-feedback]");
      try {
        if (botao.dataset.share === "whatsapp") {
          window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener,noreferrer");
        } else if (botao.dataset.share === "copiar") {
          await copiarTexto(url);
          feedback.textContent = "Link copiado. Agora é só enviar!";
        } else if (navigator.share) {
          await navigator.share({ title: titulo, text: texto, url });
        } else {
          await copiarTexto(url);
          feedback.textContent = "Link copiado. Agora é só enviar!";
        }
      } catch (erro) {
        if (erro?.name !== "AbortError") feedback.textContent = "Não foi possível compartilhar agora.";
      }
    });
  }

  document.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("[data-compartilhar-url]");
    if (!alvo) return;
    evento.preventDefault();
    abrirCompartilhamento({
      titulo: alvo.dataset.compartilharTitulo,
      texto: alvo.dataset.compartilharTexto,
      url: alvo.dataset.compartilharUrl,
    });
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") fecharCompartilhamento();
  });
}

criarMenuMobile();
criarCentralCompartilhamento();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && usuarioObservadoUid) atualizarPendenciasTorneios(usuarioObservadoUid);
});

onAuthStateChanged(auth, (usuario) => {
  const container = document.getElementById("login-header");
  if (!container) return;
  if (usuario) {
    renderLogado(container);
    preencherWidget(usuario);
    configurarAcessoAdmin(usuario);
    iniciarNotificacoes(usuario);
  } else {
    renderDeslogado(container);
  }
});

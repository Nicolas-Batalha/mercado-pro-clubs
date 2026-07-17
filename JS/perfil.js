// =========================================================================
// MERCADO PRO CLUBS — perfil.js
// Responsabilidade: formulário de perfil do jogador.
//   - Carrega dados do Firestore ao abrir a página
//   - Salva no Firestore ao submeter o formulário
//   - Live preview no topo da página
//   - Upload de foto (base64 → Firestore)
//   - Animação de scroll
// NÃO chama initializeApp — importa auth e db de firebase-config.js.
// =========================================================================

import { auth, db }                        from "./firebase-config.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let perfilEmMemoria = {};
let perfilInicializadoUid = null;

// ─── 1. Animação de scroll ────────────────────────────────────────────────────
function iniciarAnimarScroll() {
  const els = document.querySelectorAll(".animar-scroll");
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("mostrar"));
    return;
  }
  const obs = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("mostrar"); obs.unobserve(e.target); }
    }),
    { threshold: 0.15 }
  );
  els.forEach((el) => obs.observe(el));
}

// ─── 2. Toast de feedback ─────────────────────────────────────────────────────
function toast(msg, tipo = "sucesso") {
  document.getElementById("toast-perfil")?.remove();
  const el = Object.assign(document.createElement("div"), {
    id: "toast-perfil", textContent: msg,
  });
  Object.assign(el.style, {
    position: "fixed", bottom: "30px", left: "50%", transform: "translateX(-50%)",
    background: tipo === "sucesso" ? "#22C55E" : "#d32f2f",
    color: tipo === "sucesso" ? "#050B14" : "#fff",
    padding: "12px 28px", borderRadius: "30px", fontWeight: "bold",
    fontSize: "15px", zIndex: "9999", boxShadow: "0 0 20px rgba(18,224,108,0.5)",
    transition: "opacity 0.5s ease", opacity: "1",
  });
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 500); }, 2500);
}

function comprimirImagem(arquivo, maxLargura = 500, qualidade = 0.76) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error("O arquivo selecionado não é uma imagem válida."));
      img.onload = () => {
        const escala = Math.min(1, maxLargura / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível processar a imagem."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(arquivo);
  });
}

function mostrarMensagemPrincipal(mensagem, erro = false) {
  const main = document.querySelector("main");
  if (!main) return;
  main.replaceChildren();
  const p = document.createElement("p");
  p.style.cssText = `color:${erro ? "#d32f2f" : "#8b8b8b"};text-align:center;padding:80px 20px`;
  p.textContent = mensagem;
  main.appendChild(p);
}

function imagemSegura(src) {
  const valor = String(src || "").trim();
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(valor)) return valor;
  if (/^https:\/\//i.test(valor)) return valor;
  return "";
}

const ROTULOS_PLATAFORMA = {
  playstation5: "PlayStation 5",
  "xbox serie": "Xbox Series",
  pc: "PC",
  playstation4: "PlayStation 4",
  "xbox one": "Xbox One",
  switch2: "Nintendo Switch 2",
  switch1: "Nintendo Switch",
};

function valorCampo(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function numeroCampo(id) {
  const valor = document.getElementById(id)?.value;
  if (valor === "" || valor === undefined) return "";
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(0, numero) : "";
}

function coletarDadosForm() {
  return {
    nickname: valorCampo("nickname"),
    eaId: valorCampo("ea-id"),
    altura: valorCampo("altura"),
    peso: valorCampo("peso"),
    overall: valorCampo("overall"),
    nivel: valorCampo("nivel"),
    clube: valorCampo("clube-atual"),
    agenteLivre: document.getElementById("agente-livre")?.checked || false,
    procurandoClube: document.getElementById("procurando-clube")?.checked || false,
    posicao: document.querySelector('input[name="posicao"]:checked')?.value || "",
    posicaoSecundaria: valorCampo("posicao-secundaria"),
    plataforma: document.querySelector('input[name="plataforma"]:checked')?.value || "",
    disponibilidade: valorCampo("disponibilidade"),
    estiloJogo: valorCampo("estilo-jogo"),
    regiao: valorCampo("regiao"),
    bio: valorCampo("bio"),
    partidas: numeroCampo("partidas"),
    gols: numeroCampo("gols"),
    assistencias: numeroCampo("assistencias"),
    defesas: numeroCampo("defesas"),
  };
}

function mostrarFeedback(mensagem = "", tipo = "") {
  const elemento = document.getElementById("perfil-feedback");
  if (!elemento) return;
  elemento.textContent = mensagem;
  elemento.className = `perfil-feedback${tipo ? ` ${tipo}` : ""}`;
}

function atualizarContadorBio() {
  const bio = document.getElementById("bio");
  const contador = document.getElementById("bio-contador");
  if (bio && contador) contador.textContent = String(bio.value.length);
}

function atualizarCompletude(dados) {
  const criterios = [
    dados.nickname,
    dados.eaId,
    dados.posicao,
    dados.plataforma,
    dados.overall,
    dados.altura,
    dados.peso,
    dados.bio,
    dados.posicaoSecundaria,
    dados.disponibilidade,
    dados.estiloJogo,
    dados.regiao,
    dados.fotoURL,
    dados.agenteLivre || dados.clubeAtualId || dados.clube,
  ];
  const preenchidos = criterios.filter((valor) => Boolean(String(valor || "").trim())).length;
  const percentual = Math.round((preenchidos / criterios.length) * 100);
  const texto = document.getElementById("perfil-progresso-texto");
  const barra = document.getElementById("perfil-progresso-barra");
  const progresso = document.querySelector(".perfil-progresso");
  const dica = document.getElementById("perfil-progresso-dica");

  if (texto) texto.textContent = `${percentual}%`;
  if (barra) barra.style.width = `${percentual}%`;
  progresso?.setAttribute("aria-valuenow", String(percentual));
  if (dica) {
    dica.textContent = percentual === 100
      ? "Perfil completo. Você está pronto para aparecer no mercado."
      : percentual >= 70
        ? "Está quase pronto. Complete os últimos dados para se destacar."
        : percentual >= 35
          ? "Bom começo. Adicione disponibilidade, estilo e apresentação."
          : "Preencha seus dados principais para começar.";
  }
}

// ─── 3. Firestore: ler e salvar ───────────────────────────────────────────────

/** Retorna a ref do documento do jogador logado (ou null se deslogado). */
function refJogador(uid) {
  return doc(db, "jogadores", uid);
}

async function carregarDoFirestore(uid) {
  try {
    const snap = await getDoc(refJogador(uid));
    return snap.exists() ? snap.data() : {};
  } catch (err) {
    console.error("Erro ao carregar perfil:", err);
    return {};
  }
}

async function salvarNoFirestore(uid, dados) {
  try {
    await setDoc(refJogador(uid), { ...dados, atualizadoEm: serverTimestamp() }, { merge: true });
    return true;
  } catch (err) {
    console.error("Erro ao salvar perfil:", err);
    return false;
  }
}

// ─── 4. Atualizar seção de topo ───────────────────────────────────────────────
function atualizarTopo(dados) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Foto
  const fotoPrev = document.getElementById("foto-perfil-preview");
  const fotoSegura = imagemSegura(dados.fotoURL);
  if (fotoPrev && fotoSegura) fotoPrev.src = fotoSegura;

  set("usuario-nickname", dados.nickname || "Jogador Pro Clubs");
  set("usuario-email",    dados.eaId ? `EA ID: ${dados.eaId}` : "carregando Nick EA...");
  // Prioriza o clube "oficial" (linkado via elenco/clube.js) sobre o campo de
  // texto livre do próprio perfil — assim o público vê o clube real.
  set("inputClube",       dados.clubeAtualId
    ? (dados.clubeAtualNome || "Clube")
    : (dados.agenteLivre ? "Free Agent" : (dados.clube || "clube fc")));
  set("radioPos",         dados.posicao || "posição");
  set("radioPlat",        ROTULOS_PLATAFORMA[dados.plataforma] || dados.plataforma || "plataforma");
  set("topo-overall",     dados.overall || "—");
  set("topo-partidas",    dados.partidas || 0);
  set("topo-gols",        dados.gols || 0);
  set("topo-assistencias", dados.assistencias || 0);
  set("topo-defesas",     dados.defesas || 0);
  const statusMercado = document.getElementById("perfil-mercado-status");
  if (statusMercado) statusMercado.hidden = !dados.procurandoClube;
  atualizarCompletude(dados);
}

// ─── 5. Preencher formulário ──────────────────────────────────────────────────
function preencherForm(dados) {
  const campos = {
    nickname:     dados.nickname  || "",
    "ea-id":      dados.eaId      || "",
    altura:       dados.altura    || "",
    peso:         dados.peso      || "",
    overall:      dados.overall   || "",
    nivel:        dados.nivel     || "",
    bio:          dados.bio       || "",
    "posicao-secundaria": dados.posicaoSecundaria || "",
    disponibilidade: dados.disponibilidade || "",
    "estilo-jogo": dados.estiloJogo || "",
    regiao:       dados.regiao || "",
    partidas:     dados.partidas ?? "",
    gols:         dados.gols ?? "",
    assistencias: dados.assistencias ?? "",
    defesas:      dados.defesas ?? "",
    "clube-atual": dados.clubeAtualId
      ? (dados.clubeAtualNome || "")
      : (dados.agenteLivre ? "" : (dados.clube || "")),
  };
  Object.entries(campos).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  const chkFA = document.getElementById("agente-livre");
  if (chkFA) chkFA.checked = !!dados.agenteLivre && !dados.clubeAtualId;
  const chkMercado = document.getElementById("procurando-clube");
  if (chkMercado) chkMercado.checked = !!dados.procurandoClube;

  if (dados.posicao) {
    const r = Array.from(document.querySelectorAll('input[name="posicao"]'))
      .find((radio) => radio.value === String(dados.posicao));
    if (r) r.checked = true;
  }
  if (dados.plataforma) {
    const r = Array.from(document.querySelectorAll('input[name="plataforma"]'))
      .find((radio) => radio.value === String(dados.plataforma));
    if (r) r.checked = true;
  }
  atualizarContadorBio();
}

// ─── 6. Configurar formulário (submit → Firestore) ────────────────────────────
function configurarForm(uid) {
  const form = document.getElementById("form-dados-jogador");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const botao = form.querySelector('button[type="submit"]');
    const dados = coletarDadosForm();
    mostrarFeedback();

    if (!dados.nickname || !dados.eaId) {
      mostrarFeedback("Preencha o nickname e o ID da EA.", "erro");
      return;
    }

    if (dados.procurandoClube && (!dados.posicao || !dados.plataforma)) {
      mostrarFeedback("Escolha sua posição principal e plataforma para aparecer no mercado.", "erro");
      return;
    }

    if (dados.posicaoSecundaria && dados.posicaoSecundaria === dados.posicao) {
      mostrarFeedback("Escolha uma posição secundária diferente da principal.", "erro");
      document.getElementById("posicao-secundaria")?.focus();
      return;
    }

    if (botao) {
      botao.dataset.textoOriginal = botao.textContent;
      botao.textContent = "Salvando...";
      botao.disabled = true;
      botao.setAttribute("aria-busy", "true");
    }

    const ok = await salvarNoFirestore(uid, dados);
    if (ok) {
      perfilEmMemoria = { ...perfilEmMemoria, ...dados };
      atualizarTopo(perfilEmMemoria);
      mostrarFeedback("Perfil salvo com sucesso!", "sucesso");
      toast("✅ Perfil salvo com sucesso!");
      if (auth.currentUser && auth.currentUser.displayName !== dados.nickname) {
        updateProfile(auth.currentUser, { displayName: dados.nickname })
          .catch((err) => console.warn("Perfil salvo, mas o nome da conta não foi atualizado:", err));
      }
    } else {
      mostrarFeedback("Não foi possível salvar. Tente novamente.", "erro");
      toast("❌ Erro ao salvar. Tente novamente.", "erro");
    }

    if (botao) {
      botao.textContent = botao.dataset.textoOriginal || "Salvar Perfil";
      botao.disabled = false;
      botao.removeAttribute("aria-busy");
    }
  });
}

// ─── 7. Upload de foto ────────────────────────────────────────────────────────
function configurarUploadFoto(uid) {
  const inputFoto = document.getElementById("upload-foto");
  const preview   = document.getElementById("foto-perfil-preview");
  if (!inputFoto || !preview) return;

  inputFoto.addEventListener("change", async () => {
    const arquivo = inputFoto.files[0];
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      toast("Selecione um arquivo de imagem válido.", "erro");
      inputFoto.value = "";
      return;
    }
    if (arquivo.size > 2 * 1024 * 1024) {
      toast("⚠️ Imagem muito grande. Use até 2 MB.", "erro");
      inputFoto.value = "";
      return;
    }

    const fotoAnterior = preview.src;
    try {
      const base64 = await comprimirImagem(arquivo);
      if (base64.length > 850_000) throw new Error("A imagem ainda ficou muito grande. Escolha outra foto.");
      preview.src = base64;
      const ok = await salvarNoFirestore(uid, { fotoURL: base64 });
      if (!ok) throw new Error("Falha ao salvar a foto.");
      perfilEmMemoria = { ...perfilEmMemoria, fotoURL: base64 };
      atualizarCompletude(perfilEmMemoria);
      toast("✅ Foto atualizada!");
    } catch (err) {
      preview.src = fotoAnterior;
      toast(err.message || "Não foi possível atualizar a foto.", "erro");
    } finally {
      inputFoto.value = "";
    }
  });
}

// ─── 8. Free Agent — desabilita campo de clube ───────────────────────────────
function configurarFreeAgent() {
  const chk        = document.getElementById("agente-livre");
  const inputClube = document.getElementById("clube-atual");
  if (!chk || !inputClube) return;
  const vinculadoAClube = !!perfilEmMemoria.clubeAtualId;
  if (vinculadoAClube) {
    chk.checked = false;
    chk.disabled = true;
    chk.title = "Saia do clube antes de marcar o perfil como agente livre.";
  }

  function toggle() {
    inputClube.disabled = vinculadoAClube || chk.checked;
    inputClube.style.opacity = inputClube.disabled ? "0.4" : "1";
    if (chk.checked && !vinculadoAClube) inputClube.value = "";
    atualizarCompletude({ ...perfilEmMemoria, ...coletarDadosForm() });
  }
  chk.addEventListener("change", toggle);
  toggle();
}

// ─── 9. Live preview (topo atualiza enquanto digita) ─────────────────────────
function configurarLivePreview() {
  const mapa = {
    nickname:     "usuario-nickname",
    overall:      "topo-overall",
    partidas:     "topo-partidas",
    gols:         "topo-gols",
    assistencias: "topo-assistencias",
    defesas:      "topo-defesas",
    "clube-atual": "inputClube",
    "ea-id":      "usuario-email",
  };
  Object.entries(mapa).forEach(([inputId, topoId]) => {
    const el   = document.getElementById(inputId);
    const alvo = document.getElementById(topoId);
    if (!el || !alvo) return;
    el.addEventListener("input", () => {
      if (inputId === "ea-id")
        alvo.textContent = el.value ? `EA ID: ${el.value}` : "carregando Nick EA...";
      else if (inputId === "nickname")
        alvo.textContent = el.value || "Jogador Pro Clubs";
      else if (["partidas", "gols", "assistencias", "defesas"].includes(inputId))
        alvo.textContent = el.value || "0";
      else
        alvo.textContent = el.value || "—";
    });
  });

  document.querySelectorAll('input[name="posicao"]').forEach((r) =>
    r.addEventListener("change", () => {
      const el = document.getElementById("radioPos");
      if (el) el.textContent = r.value;
    })
  );
  document.querySelectorAll('input[name="plataforma"]').forEach((r) =>
    r.addEventListener("change", () => {
      const el = document.getElementById("radioPlat");
      if (el) el.textContent = ROTULOS_PLATAFORMA[r.value] || r.value;
    })
  );

  const chk = document.getElementById("agente-livre");
  if (chk) {
    chk.addEventListener("change", () => {
      const el = document.getElementById("inputClube");
      if (el) el.textContent = chk.checked
        ? "Free Agent"
        : document.getElementById("clube-atual")?.value || "clube fc";
    });
  }

  const form = document.getElementById("form-dados-jogador");
  const atualizarDadosDinamicos = () => {
    atualizarContadorBio();
    const dadosAtuais = { ...perfilEmMemoria, ...coletarDadosForm() };
    atualizarCompletude(dadosAtuais);
    const statusMercado = document.getElementById("perfil-mercado-status");
    if (statusMercado) statusMercado.hidden = !dadosAtuais.procurandoClube;
  };
  form?.addEventListener("input", atualizarDadosDinamicos);
  form?.addEventListener("change", atualizarDadosDinamicos);
}

// ─── 10a. Modo visitante — vendo o perfil de outro jogador (?uid=) ────────────
async function carregarModoVisitantePerfil(uid) {
  document.body.classList.add("perfil-visitante");
  const reputacao = document.getElementById("perfil-reputacao");
  if (reputacao) reputacao.dataset.reputacaoUid = uid;
  window.mercadoReputacao?.atualizar();
  try {
    const snap = await getDoc(doc(db, "jogadores", uid));
    if (!snap.exists()) {
      mostrarMensagemPrincipal("Esse jogador não foi encontrado.");
      return;
    }
    const dados = snap.data();

    if (dados.suspenso === true) {
      mostrarMensagemPrincipal("Este perfil está temporariamente indisponível.");
      return;
    }

    atualizarTopo(dados);
    preencherForm(dados);
    ativarModoSomenteLeituraPerfil(dados);
  } catch (err) {
    console.error("Erro ao carregar perfil público:", err);
    mostrarMensagemPrincipal("Não foi possível carregar este perfil. Tente novamente.", true);
  }
}

function ativarModoSomenteLeituraPerfil(dados) {
  // Trava todos os campos do formulário — ninguém edita o perfil de outra pessoa
  document.querySelectorAll("#form-dados-jogador input, #form-dados-jogador textarea, #form-dados-jogador select")
    .forEach(el => (el.disabled = true));

  // Se o jogador está num clube (via elenco), mostra um link direto pra lá
  if (dados.clubeAtualId && !dados.agenteLivre) {
    const link = document.createElement("a");
    link.href = `./clubes.html?uid=${dados.clubeAtualId}`;
    link.className = "btn-salvar btn-ver-clube-perfil";
    link.textContent = `Ver ${dados.clubeAtualNome || "o clube"} →`;
    document.querySelector(".flex")?.appendChild(link);
  }
}

// ─── 10b. Inicialização (aguarda usuário logado, ou cai no modo visitante) ────
document.addEventListener("DOMContentLoaded", () => {
  iniciarAnimarScroll();

  const uidVisitado = new URLSearchParams(window.location.search).get("uid");

  if (uidVisitado) {
    // Qualquer pessoa pode ver o perfil público de um jogador, logada ou não.
    carregarModoVisitantePerfil(uidVisitado);
    return;
  }

  onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
      // Não logado → redireciona para login
      window.location.href = "../HTML/cadastrar-se.html";
      return;
    }

    if (perfilInicializadoUid === usuario.uid) return;
    perfilInicializadoUid = usuario.uid;

    const reputacao = document.getElementById("perfil-reputacao");
    if (reputacao) reputacao.dataset.reputacaoUid = usuario.uid;
    window.mercadoReputacao?.atualizar();

    const dados = await carregarDoFirestore(usuario.uid);
    perfilEmMemoria = dados;

    atualizarTopo(dados);
    preencherForm(dados);
    configurarForm(usuario.uid);
    configurarUploadFoto(usuario.uid);
    configurarFreeAgent();
    configurarLivePreview();
  });
});

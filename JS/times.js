// =========================================================================
// MERCADO PRO CLUBS — times.js
// Fluxo:
//  - 🔔 Sino → painel de notificações (candidaturas pendentes + aceites)
//  - ✉️ Email → painel de mensagens (lista de chats + chat inline)
//  - Vagas expiram em 30 dias, chat é permanente
// =========================================================================

import { auth, db } from "./firebase-config.js"; 
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, getDoc, setDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, updateDoc, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { confirmModal } from "./confirm-modal.js";

const EXPIRACAO_MS = 30 * 24 * 60 * 60 * 1000; // vagas: 30 dias
const CAMINHO_NEGOCIACOES = window.location.pathname.includes("/HTML/")
  ? "./negociacoes.html"
  : "./HTML/negociacoes.html";

let usuarioAtual = null;
let perfilAtual  = {};
let chatAbertoId   = null; // chat atualmente aberto no painel
let unsubChat      = null; // listener de mensagens ativo
let unsubChatsNaoLidos = null;
let conversasNaoLidas = 0;
let fotosClubeBase64 = []; // até 3 imagens selecionadas no formulário de vaga (opcional)
let vagaEditandoId  = null; // id da vaga em edição (null = criando nova)
const MAX_FOTOS_VAGA = 3;
const MAX_CARACTERES_FOTOS = 850_000;
let unsubsNotificacoes = [];
let painelMensagensIniciado = false;
let contagemNotificacoesCapitao = 0;
let contagemNotificacoesJogador = 0;
let contagemConvitesClube = 0;
let requisicaoVagasAtual = 0;
let totalVagasDisponiveis = 0;
let jogadoresDisponiveisAtuais = [];
let requisicaoJogadoresAtual = 0;

const ROTULOS_PLATAFORMA = {
  switch2: "Nintendo Switch 2",
  switch: "Nintendo Switch",
  xboxS: "Xbox Series X/S",
  xboxO: "Xbox One",
  ps5: "PlayStation 5",
  ps4: "PlayStation 4",
  pc: "PC",
  crossplay: "Crossplay",
  "new-gen": "Nova geração",
  "new gen": "Nova geração",
  newgen: "Nova geração",
  "old-gen": "Antiga geração",
  "old gen": "Antiga geração",
  oldgen: "Antiga geração",
  "ond-gen": "Antiga geração",
  "ond gen": "Antiga geração",
  ondgen: "Antiga geração",
};
const ROTULOS_POSICAO = {
  psd: "Todas as posições",
  ata: "Ataque",
  mei: "Meio-campo",
  vol: "Volante",
  zag: "Defesa",
  lateral: "Lateral",
  lat: "Lateral",
  ld: "Lateral direito",
  le: "Lateral esquerdo",
  gk: "Goleiro",
};
const ROTULOS_JOGO = {
  eafc26: "EA FC 26",
  eafc25: "EA FC 25",
  eafc24: "EA FC 24",
  eafc23: "EA FC 23",
};
const ROTULOS_ESTILO = {
  competitivo: "Competitivo",
  casual: "Casual",
};
const ROTULOS_PLATAFORMA_JOGADOR = {
  playstation5: "PlayStation 5",
  "xbox serie": "Xbox Series",
  pc: "PC",
  playstation4: "PlayStation 4",
  "xbox one": "Xbox One",
  switch2: "Nintendo Switch 2",
  switch1: "Nintendo Switch",
};
const ROTULOS_POSICAO_JOGADOR = {
  gol: "Goleiro",
  gk: "Goleiro",
  zag: "Zagueiro",
  lateral: "Lateral",
  lat: "Lateral",
  ld: "Lateral direito",
  le: "Lateral esquerdo",
  vol: "Volante",
  mc: "Meio-campo",
  mei: "Meia ofensivo",
  "me/md": "Meia lateral",
  pe: "Ponta esquerda",
  ata: "Atacante",
  sa: "Segundo atacante",
  pd: "Ponta direita",
};
const ROTULOS_DISPONIBILIDADE = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  madrugada: "Madrugada",
  flexivel: "Horário flexível",
};
const ROTULOS_REGIAO = {
  norte: "Norte",
  nordeste: "Nordeste",
  "centro-oeste": "Centro-Oeste",
  sudeste: "Sudeste",
  sul: "Sul",
  exterior: "Exterior",
};
const ROTULOS_ESTILO_JOGADOR = {
  competitivo: "Competitivo",
  posse: "Posse de bola",
  "contra-ataque": "Contra-ataque",
  marcacao: "Marcação forte",
  casual: "Casual",
  versatil: "Versátil",
};

function normalizarPlataforma(valor) {
  return ({ "xbox-Series": "xboxS", "xbox-One": "xboxO" })[valor] || valor || "";
}

function rotuloPosicaoJogador(valor) {
  const original = String(valor || "").trim();
  return ROTULOS_POSICAO_JOGADOR[original.toLowerCase()] || original || "—";
}

function filtrosMercadoAtivos() {
  return Boolean(
    document.getElementById("busca-texto")?.value.trim() ||
    document.getElementById("filtro-plataforma")?.value !== "todas" ||
    document.getElementById("filtro-posicao")?.value !== "todas" ||
    document.getElementById("filtro-jogo")?.value !== "todas" ||
    document.getElementById("filtro-estilo")?.value !== "todos" ||
    document.getElementById("ordenar-vagas")?.value !== "recentes" ||
    document.getElementById("filtro-meu-nivel")?.checked
  );
}

function atualizarResumoMercado(totalFiltrado, carregando = false, erro = false) {
  const resumo = document.getElementById("resultado-vagas");
  const btnLimpar = document.getElementById("btn-limpar-filtros");
  if (btnLimpar) btnLimpar.hidden = !filtrosMercadoAtivos();
  if (!resumo) return;
  if (carregando) {
    resumo.textContent = "Atualizando vagas...";
    return;
  }
  if (erro) {
    resumo.textContent = "Não foi possível atualizar o mercado.";
    return;
  }
  const exibidas = Math.min(quantidadeExibida, totalFiltrado);
  resumo.textContent = totalFiltrado === totalVagasDisponiveis
    ? `${exibidas} de ${totalFiltrado} vaga(s) exibida(s)`
    : `${exibidas} de ${totalFiltrado} resultado(s), entre ${totalVagasDisponiveis} vaga(s)`;
}

// =========================================================================
// MERCADO DE JOGADORES — perfis que ativaram "Estou procurando clube"
// =========================================================================
function normalizarBusca(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ativarAbaMercado(aba, carregar = true) {
  const abaAtiva = aba === "jogadores" ? "jogadores" : "vagas";
  document.querySelectorAll("[data-mercado-aba]").forEach((botao) => {
    const ativo = botao.dataset.mercadoAba === abaAtiva;
    botao.classList.toggle("ativo", ativo);
    botao.setAttribute("aria-selected", String(ativo));
    botao.tabIndex = ativo ? 0 : -1;
  });
  const painelVagas = document.getElementById("painel-vagas");
  const painelJogadores = document.getElementById("painel-jogadores");
  if (painelVagas) painelVagas.hidden = abaAtiva !== "vagas";
  if (painelJogadores) painelJogadores.hidden = abaAtiva !== "jogadores";
  if (abaAtiva === "jogadores" && carregar) carregarJogadoresDisponiveis();
}

function filtrosJogadoresAtivos() {
  return Boolean(
    document.getElementById("busca-jogador")?.value.trim() ||
    document.getElementById("filtro-jogador-plataforma")?.value !== "todas" ||
    document.getElementById("filtro-jogador-posicao")?.value !== "todas" ||
    document.getElementById("filtro-jogador-regiao")?.value !== "todas" ||
    document.getElementById("filtro-jogador-disponibilidade")?.value !== "todas" ||
    document.getElementById("filtro-jogador-estilo")?.value !== "todos" ||
    document.getElementById("ordenar-jogadores")?.value !== "recentes"
  );
}

function atualizarResumoJogadores(totalFiltrado, totalDisponivel, carregando = false, erro = false) {
  const resumo = document.getElementById("resultado-jogadores");
  const limpar = document.getElementById("btn-limpar-filtros-jogadores");
  if (limpar) limpar.hidden = !filtrosJogadoresAtivos();
  if (!resumo) return;
  if (carregando) {
    resumo.textContent = "Carregando jogadores disponíveis...";
  } else if (erro) {
    resumo.textContent = "Não foi possível carregar os jogadores.";
  } else if (totalFiltrado === totalDisponivel) {
    resumo.textContent = `${totalDisponivel} jogador(es) disponível(is)`;
  } else {
    resumo.textContent = `${totalFiltrado} resultado(s), entre ${totalDisponivel} jogador(es)`;
  }
}

function acaoJogadorMercado(jogador) {
  if (usuarioAtual?.uid === jogador.uid) {
    return `<a href="./meu-perfil.html" class="btn-acao-jogador-secundaria">Editar meu perfil</a>`;
  }
  const ehCapitao = Boolean(
    usuarioAtual && (perfilAtual.ehCapitao || perfilAtual.clubeAtualId === usuarioAtual.uid)
  );
  if (ehCapitao) {
    return `<button type="button" class="btn-convidar-jogador-mercado"
      data-jogador-uid="${escHtml(jogador.uid)}"
      data-jogador-nome="${escHtml(jogador.nickname || "Jogador")}">Convidar para o clube</button>`;
  }
  if (usuarioAtual) {
    return `<a href="./clubes.html" class="btn-acao-jogador-secundaria">Criar meu clube</a>`;
  }
  return `<a href="./cadastrar-se.html" class="btn-acao-jogador-secundaria">Entrar para convidar</a>`;
}

function cardJogadorMercado(jogador) {
  const foto = imagemSegura(jogador.fotoURL) || "../IMG/user-icon.svg";
  const plataforma = ROTULOS_PLATAFORMA_JOGADOR[jogador.plataforma] || jogador.plataforma || "Não informada";
  const disponibilidade = ROTULOS_DISPONIBILIDADE[jogador.disponibilidade] || "Não informada";
  const regiao = ROTULOS_REGIAO[jogador.regiao] || "Não informada";
  const estilo = ROTULOS_ESTILO_JOGADOR[jogador.estiloJogo] || "Não informado";
  const bio = jogador.bio || "Este jogador ainda não adicionou uma apresentação.";
  const posicao = rotuloPosicaoJogador(jogador.posicao);
  const secundaria = jogador.posicaoSecundaria && jogador.posicaoSecundaria !== jogador.posicao
    ? `<span class="jogador-card-badge">Também joga: ${escHtml(rotuloPosicaoJogador(jogador.posicaoSecundaria))}</span>`
    : "";
  return `
    <article class="mercado-jogador-card">
      <div class="jogador-card-topo">
        <img src="${escHtml(foto)}" class="jogador-card-foto" alt="Foto de ${escHtml(jogador.nickname || "Jogador")}">
        <div class="jogador-card-identidade">
          <span class="jogador-card-disponivel">Procurando clube</span>
          <h3>${escHtml(jogador.nickname || "Jogador Pro Clubs")}</h3>
          <p>${jogador.eaId ? `EA ID: ${escHtml(jogador.eaId)}` : "EA ID não informado"}</p>
        </div>
      </div>
      <div class="jogador-card-badges">
        <span class="jogador-card-badge destaque">${escHtml(posicao)}</span>
        ${secundaria}
        <span class="jogador-card-badge">${escHtml(plataforma)}</span>
        <span class="jogador-card-badge destaque">OVR ${escHtml(jogador.overall || "—")}</span>
      </div>
      <p class="jogador-card-bio">${escHtml(bio)}</p>
      <dl class="jogador-card-detalhes">
        <div><dt>Disponibilidade</dt><dd>${escHtml(disponibilidade)}</dd></div>
        <div><dt>Região</dt><dd>${escHtml(regiao)}</dd></div>
        <div><dt>Estilo</dt><dd>${escHtml(estilo)}</dd></div>
        <div><dt>Clube atual</dt><dd>${escHtml(jogador.clubeAtualNome || (jogador.agenteLivre ? "Free Agent" : "Sem clube"))}</dd></div>
      </dl>
      <div class="jogador-card-stats" aria-label="Estatísticas do jogador">
        <span><strong>${escHtml(jogador.partidas || 0)}</strong>Partidas</span>
        <span><strong>${escHtml(jogador.gols || 0)}</strong>Gols</span>
        <span><strong>${escHtml(jogador.assistencias || 0)}</strong>Assistências</span>
        <span><strong>${escHtml(jogador.defesas || 0)}</strong>Defesas</span>
      </div>
      <div class="jogador-card-acoes">
        <a href="./meu-perfil.html?uid=${encodeURIComponent(jogador.uid)}" class="btn-ver-jogador">Ver perfil completo</a>
        ${acaoJogadorMercado(jogador)}
      </div>
    </article>`;
}

function aplicarFiltrosJogadores() {
  const feed = document.getElementById("jogadores-feed");
  if (!feed) return;
  const busca = normalizarBusca(document.getElementById("busca-jogador")?.value);
  const plataforma = document.getElementById("filtro-jogador-plataforma")?.value || "todas";
  const posicao = document.getElementById("filtro-jogador-posicao")?.value || "todas";
  const regiao = document.getElementById("filtro-jogador-regiao")?.value || "todas";
  const disponibilidade = document.getElementById("filtro-jogador-disponibilidade")?.value || "todas";
  const estilo = document.getElementById("filtro-jogador-estilo")?.value || "todos";
  const ordenar = document.getElementById("ordenar-jogadores")?.value || "recentes";

  let filtrados = jogadoresDisponiveisAtuais.filter((jogador) => {
    if (plataforma !== "todas" && jogador.plataforma !== plataforma) return false;
    if (posicao !== "todas" && jogador.posicao !== posicao && jogador.posicaoSecundaria !== posicao) return false;
    if (regiao !== "todas" && jogador.regiao !== regiao) return false;
    if (disponibilidade !== "todas" && jogador.disponibilidade !== disponibilidade) return false;
    if (estilo !== "todos" && jogador.estiloJogo !== estilo) return false;
    if (!busca) return true;
    return normalizarBusca([
      jogador.nickname,
      jogador.eaId,
      jogador.bio,
      jogador.posicao,
      jogador.posicaoSecundaria,
      ROTULOS_PLATAFORMA_JOGADOR[jogador.plataforma],
      ROTULOS_REGIAO[jogador.regiao],
      ROTULOS_ESTILO_JOGADOR[jogador.estiloJogo],
    ].filter(Boolean).join(" ")).includes(busca);
  });

  if (ordenar === "overall") {
    filtrados = [...filtrados].sort((a, b) => Number(b.overall || 0) - Number(a.overall || 0));
  } else if (ordenar === "az") {
    filtrados = [...filtrados].sort((a, b) =>
      String(a.nickname || "").localeCompare(String(b.nickname || ""), "pt-BR"));
  } else {
    filtrados = [...filtrados].sort((a, b) =>
      (b.atualizadoEm?.toMillis?.() || 0) - (a.atualizadoEm?.toMillis?.() || 0));
  }

  atualizarResumoJogadores(filtrados.length, jogadoresDisponiveisAtuais.length);
  if (!filtrados.length) {
    feed.innerHTML = `<div class="mercado-estado">
      <strong>Nenhum jogador encontrado.</strong>
      <span>Limpe os filtros ou tente uma busca diferente.</span>
    </div>`;
    return;
  }

  feed.innerHTML = filtrados.map(cardJogadorMercado).join("");
  feed.querySelectorAll(".btn-convidar-jogador-mercado").forEach((botao) => {
    botao.addEventListener("click", () => enviarConviteJogadorMercado(botao));
  });
}

async function carregarJogadoresDisponiveis() {
  const feed = document.getElementById("jogadores-feed");
  if (!feed) return;
  const numeroRequisicao = ++requisicaoJogadoresAtual;
  feed.innerHTML = `<div class="mercado-estado"><strong>Carregando jogadores...</strong><span>Aguarde um instante.</span></div>`;
  atualizarResumoJogadores(0, 0, true);
  try {
    const snap = await getDocs(query(
      collection(db, "jogadores"),
      where("procurandoClube", "==", true)
    ));
    if (numeroRequisicao !== requisicaoJogadoresAtual) return;
    jogadoresDisponiveisAtuais = snap.docs
      .map((perfilDoc) => ({ uid: perfilDoc.id, ...perfilDoc.data() }))
      .filter((jogador) => jogador.suspenso !== true && !jogador.clubeAtualId);
    aplicarFiltrosJogadores();
  } catch (err) {
    if (numeroRequisicao !== requisicaoJogadoresAtual) return;
    jogadoresDisponiveisAtuais = [];
    feed.innerHTML = `<div class="mercado-estado erro"><strong>Erro ao carregar jogadores.</strong><span>Atualize a página e tente novamente.</span></div>`;
    atualizarResumoJogadores(0, 0, false, true);
    console.error("Erro ao carregar jogadores disponíveis:", err);
  }
}

async function enviarConviteJogadorMercado(botao) {
  const usuario = usuarioAtual;
  const jogadorUid = botao.dataset.jogadorUid;
  const jogadorNome = botao.dataset.jogadorNome || "Jogador";
  if (!usuario) {
    toast("Faça login para enviar um convite.", "erro");
    return;
  }
  if (!perfilAtual.ehCapitao && perfilAtual.clubeAtualId !== usuario.uid) {
    toast("Crie seu clube antes de convidar jogadores.", "erro");
    return;
  }
  if (!jogadorUid || jogadorUid === usuario.uid) return;

  const textoOriginal = botao.textContent;
  botao.textContent = "Enviando...";
  botao.disabled = true;
  try {
    const existentes = await getDocs(query(
      collection(db, "convitesClube"),
      where("capitaoUid", "==", usuario.uid),
      where("jogadorUid", "==", jogadorUid),
      where("status", "==", "pendente")
    ));
    if (!existentes.empty) {
      botao.textContent = "Convite já enviado";
      toast("Você já convidou esse jogador.", "erro");
      return;
    }
    const nomeClube = perfilAtual.clubeAtualNome || perfilAtual.clube || "seu clube";
    await addDoc(collection(db, "convitesClube"), {
      capitaoUid: usuario.uid,
      clube: nomeClube,
      jogadorUid,
      jogadorNome,
      status: "pendente",
      origem: "mercado-jogadores",
      criadoEm: serverTimestamp(),
    });
    botao.textContent = "Convite enviado";
    toast(`Convite enviado para ${jogadorNome}!`);
  } catch (err) {
    botao.textContent = textoOriginal;
    botao.disabled = false;
    toast("Não foi possível enviar o convite.", "erro");
    console.error("Erro ao enviar convite pelo mercado:", err);
  }
}

document.querySelectorAll("[data-mercado-aba]").forEach((botao) => {
  botao.addEventListener("click", () => ativarAbaMercado(botao.dataset.mercadoAba));
  botao.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const proxima = botao.dataset.mercadoAba === "vagas" ? "jogadores" : "vagas";
    ativarAbaMercado(proxima);
    document.querySelector(`[data-mercado-aba="${proxima}"]`)?.focus();
  });
});

const abaInicial = new URLSearchParams(location.search).get("aba") === "jogadores" ? "jogadores" : "vagas";
ativarAbaMercado(abaInicial, false);

[
  "filtro-jogador-plataforma",
  "filtro-jogador-posicao",
  "filtro-jogador-regiao",
  "filtro-jogador-disponibilidade",
  "filtro-jogador-estilo",
  "ordenar-jogadores",
].forEach((id) => document.getElementById(id)?.addEventListener("change", aplicarFiltrosJogadores));

let buscaJogadorTimeout = null;
document.getElementById("busca-jogador")?.addEventListener("input", () => {
  clearTimeout(buscaJogadorTimeout);
  buscaJogadorTimeout = setTimeout(aplicarFiltrosJogadores, 250);
});

document.getElementById("btn-limpar-filtros-jogadores")?.addEventListener("click", () => {
  const padroes = {
    "filtro-jogador-plataforma": "todas",
    "filtro-jogador-posicao": "todas",
    "filtro-jogador-regiao": "todas",
    "filtro-jogador-disponibilidade": "todas",
    "filtro-jogador-estilo": "todos",
    "ordenar-jogadores": "recentes",
  };
  Object.entries(padroes).forEach(([id, valor]) => {
    const campo = document.getElementById(id);
    if (campo) campo.value = valor;
  });
  const busca = document.getElementById("busca-jogador");
  if (busca) busca.value = "";
  aplicarFiltrosJogadores();
});

// ─── Comprime imagem no navegador antes de salvar (reduz tamanho no Firestore) ─
function comprimirImagem(arquivo, maxLargura = 640, qualidade = 0.68) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const escala = Math.min(1, maxLargura / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.max(1, Math.round(img.width  * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Não foi possível processar a imagem.")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(arquivo);
  });
}

// ─── Preview do upload de imagens no formulário de vaga (até 3) ────────────────
function renderPreviewFotos() {
  const wrap = document.getElementById("post-foto-preview-wrap");
  const texto = document.getElementById("post-foto-texto");
  if (!wrap) return;
  wrap.innerHTML = fotosClubeBase64.map((src, i) => `
    <div style="position:relative">
      <img src="${src}" class="lfg-foto-preview" alt="Prévia ${i + 1}" />
      <button type="button" class="btn-remover-foto" data-idx="${i}"
        style="position:absolute;top:-6px;right:-6px;background:#d32f2f;color:#fff;
               border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-weight:bold">×</button>
    </div>`).join("");
  wrap.querySelectorAll(".btn-remover-foto").forEach(btn =>
    btn.addEventListener("click", () => {
      fotosClubeBase64.splice(Number(btn.dataset.idx), 1);
      renderPreviewFotos();
    })
  );
  if (texto) {
    texto.textContent = fotosClubeBase64.length
      ? `✅ ${fotosClubeBase64.length}/${MAX_FOTOS_VAGA} imagem(ns) selecionada(s)`
      : `📷 Adicionar até ${MAX_FOTOS_VAGA} imagens do anúncio (opcional, 2MB cada)`;
  }
}

const inputFotoClube = document.getElementById("post-foto");
if (inputFotoClube) {
  inputFotoClube.addEventListener("change", async () => {
    const arquivos = Array.from(inputFotoClube.files);
    inputFotoClube.value = ""; // permite selecionar o mesmo arquivo de novo depois

    for (const arquivo of arquivos) {
      if (fotosClubeBase64.length >= MAX_FOTOS_VAGA) {
        toast(`⚠️ Máximo de ${MAX_FOTOS_VAGA} imagens por anúncio.`, "erro");
        break;
      }
      if (!arquivo.type.startsWith("image/")) {
        toast(`"${arquivo.name}" não é uma imagem válida.`, "erro");
        continue;
      }
      if (arquivo.size > 2 * 1024 * 1024) {
        toast(`⚠️ "${arquivo.name}" é muito grande. Use até 2MB.`, "erro");
        continue;
      }
      try {
        const comprimida = await comprimirImagem(arquivo);
        const tamanhoTotal = fotosClubeBase64.reduce((total, foto) => total + foto.length, 0) + comprimida.length;
        if (tamanhoTotal > MAX_CARACTERES_FOTOS) {
          toast("As imagens juntas ficaram muito pesadas. Use fotos menores ou remova uma delas.", "erro");
          continue;
        }
        fotosClubeBase64.push(comprimida);
      } catch {
        toast(`Erro ao processar "${arquivo.name}".`, "erro");
      }
    }
    renderPreviewFotos();
  });
}

// ─── Lightbox: clique na imagem do card amplia ─────────────────────────────────
const lightboxOverlay = document.getElementById("lightbox-overlay");
const lightboxImg     = document.getElementById("lightbox-img");

document.getElementById("lfg-feed")?.addEventListener("click", (e) => {
  const img = e.target.closest(".card-imagem img, .card-galeria img");
  if (!img || !lightboxOverlay || !lightboxImg) return;
  lightboxImg.src = img.src;
  lightboxOverlay.classList.remove("hidden");
});

lightboxOverlay?.addEventListener("click", () => {
  lightboxOverlay.classList.add("hidden");
  lightboxImg.src = "";
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    lightboxOverlay?.classList.add("hidden");
    if (lightboxImg) lightboxImg.src = "";
  }
});

function atualizarAreaPublicacao(usuario, possuiClube = false) {
  const formulario = document.getElementById("publicar-vaga");
  const acesso = document.getElementById("publicar-vaga-acesso");
  const filtroNivel = document.getElementById("filtro-meu-nivel-wrap");
  const titulo = document.getElementById("publicar-vaga-acesso-titulo");
  const texto = document.getElementById("publicar-vaga-acesso-texto");
  const primario = document.getElementById("publicar-vaga-acesso-primario");
  const secundario = document.getElementById("publicar-vaga-acesso-secundario");

  if (filtroNivel) filtroNivel.hidden = !usuario;

  if (usuario && possuiClube) {
    if (formulario) formulario.hidden = false;
    if (acesso) acesso.hidden = true;
    return;
  }

  if (formulario) formulario.hidden = true;
  if (acesso) acesso.hidden = false;

  if (usuario) {
    if (titulo) titulo.textContent = "Primeiro, configure o seu clube";
    if (texto) texto.textContent = "Crie o perfil do clube para publicar vagas e receber candidaturas de jogadores.";
    if (primario) {
      primario.textContent = "Criar meu clube";
      primario.href = "./clubes.html";
    }
    if (secundario) {
      secundario.textContent = "Explorar clubes";
      secundario.href = "./explorar-clubes.html";
    }
    return;
  }

  const filtroMeuNivel = document.getElementById("filtro-meu-nivel");
  if (filtroMeuNivel) filtroMeuNivel.checked = false;
  if (titulo) titulo.textContent = "Seu clube está procurando jogadores?";
  if (texto) texto.textContent = "Entre na sua conta para anunciar uma vaga e receber candidaturas de jogadores.";
  if (primario) {
    primario.textContent = "Entrar como capitão";
    primario.href = "./cadastrar-se.html?continuar=%2FHTML%2Fmercado.html%23publicar-vaga#login";
  }
  if (secundario) {
    secundario.textContent = "Criar conta";
    secundario.href = "./cadastrar-se.html?continuar=%2FHTML%2Fmercado.html%23publicar-vaga#cadastro";
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  unsubsNotificacoes.forEach((unsubscribe) => unsubscribe());
  unsubsNotificacoes = [];
  contagemNotificacoesCapitao = 0;
  contagemNotificacoesJogador = 0;
  contagemConvitesClube = 0;
  atualizarBadgeSino();
  if (unsubChat) { unsubChat(); unsubChat = null; }
  if (unsubChatsNaoLidos) { unsubChatsNaoLidos(); unsubChatsNaoLidos = null; }
  conversasNaoLidas = 0;
  atualizarBadgeMensagens();

  usuarioAtual = user;
  perfilAtual = {};
  let possuiClube = false;
  const sino = document.getElementById("sino-btn");
  const mensagens = document.getElementById("emailIcon");
  if (sino) sino.hidden = !user;
  if (mensagens) mensagens.hidden = !user;
  if (user) {
    try {
      const [snap, clubeSnap] = await Promise.all([
        getDoc(doc(db, "jogadores", user.uid)),
        getDoc(doc(db, "clubes", user.uid)),
      ]);
      if (auth.currentUser?.uid !== user.uid) return;
      perfilAtual = snap.exists() ? snap.data() : {};
      possuiClube = clubeSnap.exists() && clubeSnap.data()?.suspenso !== true;
    } catch (err) {
      console.error("Erro ao carregar perfil do usuário:", err);
    }
    if (auth.currentUser?.uid !== user.uid) return;
    escutarNotificacoes(user.uid);
    iniciarPainelMensagens();
    escutarChatsNaoLidos(user.uid);
    const chatSolicitado = new URLSearchParams(window.location.search).get("chat");
    if (chatSolicitado) {
      await abrirChat(chatSolicitado);
      const urlLimpa = new URL(window.location.href);
      urlLimpa.searchParams.delete("chat");
      window.history.replaceState({}, "", `${urlLimpa.pathname}${urlLimpa.search}${urlLimpa.hash}`);
    }
  }
  atualizarAreaPublicacao(user, possuiClube);
  await carregarVagas();
  const editarVagaId = new URLSearchParams(window.location.search).get("editarVaga");
  if (editarVagaId) {
    const vaga = vagasFiltradasAtuais.find((item) => item.id === editarVagaId && item.capitaoUid === user.uid);
    if (vaga) iniciarEdicaoVaga(vaga);
    else toast("Não foi possível abrir esta vaga para edição.", "erro");
  }
  const abaSolicitada = new URLSearchParams(window.location.search).get("aba");
  if (abaSolicitada === "jogadores") ativarAbaMercado("jogadores", false);
  if (!document.getElementById("painel-jogadores")?.hidden) {
    await carregarJogadoresDisponiveis();
  }
  destacarVagaCompartilhada();
});

// =========================================================================
// 1. PUBLICAR VAGA
// =========================================================================
document.getElementById("form-lfg")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = usuarioAtual;
  if (!usuario) { toast("Você precisa estar logado.", "erro"); return; }

  const clube         = document.getElementById("post-clube").value.trim();
  const plataforma    = document.getElementById("post-plataforma").value;
  const posicao       = document.getElementById("post-posicao").value;
  const estilo        = document.getElementById("post-estilo").value;
  const jogo          = document.getElementById("post-jogo").value;
  const descricao     = document.getElementById("post-descricao").value.trim();
  const overallMinRaw = document.getElementById("post-overall-min").value;
  const overallMinimo = overallMinRaw ? Number(overallMinRaw) : null;

  try {
    if (!vagaEditandoId) {
      // Limite de 1 vaga ativa por capitão (só vale para criação de vaga nova)
      const existentes = await getDocs(query(
        collection(db, "vagas"), where("capitaoUid", "==", usuario.uid)
      ));
      const agora = Date.now();
      const ativas = existentes.docs.filter((vagaDoc) => {
        const criadoMs = vagaDoc.data().criadoEm?.toMillis?.() || 0;
        return !criadoMs || agora - criadoMs < EXPIRACAO_MS;
      });
      const expiradas = existentes.docs.filter((vagaDoc) => !ativas.includes(vagaDoc));
      if (expiradas.length) {
        await Promise.all(expiradas.map((vagaDoc) => deleteDoc(vagaDoc.ref)));
      }
      if (ativas.length) {
        toast("⚠️ Você já tem uma vaga ativa. Edite-a ou exclua antes de criar outra.", "erro");
        return;
      }
      const docRef = await addDoc(collection(db, "vagas"), {
        clube, plataforma, posicao, estilo, jogo, descricao, overallMinimo,
        fotosClube:  fotosClubeBase64,
        capitaoUid:  usuario.uid,
        capitaoNome: perfilAtual.nickname || usuario.displayName || "Capitão",
        criadoEm:    serverTimestamp(),
      });
      await setDoc(doc(db, "jogadores", usuario.uid),
        {
          clubeId: docRef.id,
          ehCapitao: true,
          clube,
          clubeAtualId: usuario.uid,
          clubeAtualNome: clube,
        }, { merge: true });
      toast("✅ Vaga publicada! Fica ativa por 30 dias.");
    } else {
      // Edição: não mexe em criadoEm (usar "Renovar" pra isso)
      await updateDoc(doc(db, "vagas", vagaEditandoId), {
        clube, plataforma, posicao, estilo, jogo, descricao, overallMinimo,
        fotosClube: fotosClubeBase64,
      });
      toast("✅ Vaga atualizada!");
      cancelarEdicaoVaga();
    }

    document.getElementById("form-lfg").reset();
    fotosClubeBase64 = [];
    renderPreviewFotos();
    await carregarVagas();
  } catch (err) { toast("Erro ao salvar: " + err.message, "erro"); }
});

// ─── Edição de vaga ────────────────────────────────────────────────────────────
function iniciarEdicaoVaga(v) {
  vagaEditandoId = v.id;
  document.getElementById("post-clube").value        = v.clube || "";
  document.getElementById("post-plataforma").value   = normalizarPlataforma(v.plataforma);
  document.getElementById("post-posicao").value      = v.posicao || "";
  document.getElementById("post-estilo").value       = v.estilo || "";
  document.getElementById("post-jogo").value         = v.jogo || "";
  document.getElementById("post-descricao").value    = v.descricao || "";
  document.getElementById("post-overall-min").value  = v.overallMinimo || "";
  fotosClubeBase64 = Array.isArray(v.fotosClube) ? [...v.fotosClube]
    : (v.fotoClube ? [v.fotoClube] : []);
  renderPreviewFotos();

  document.getElementById("btn-publicar").textContent = "Salvar alterações";
  document.getElementById("btn-cancelar-edicao").style.display = "inline-block";
  document.getElementById("form-lfg").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelarEdicaoVaga() {
  vagaEditandoId = null;
  fotosClubeBase64 = [];
  renderPreviewFotos();
  document.getElementById("form-lfg")?.reset();
  document.getElementById("btn-publicar").textContent = "Publicar Vaga";
  document.getElementById("btn-cancelar-edicao").style.display = "none";
}
document.getElementById("btn-cancelar-edicao")?.addEventListener("click", cancelarEdicaoVaga);

// =========================================================================
// 2. LISTAR VAGAS
// =========================================================================
const TAMANHO_PAGINA = 12;
let vagasFiltradasAtuais = [];
let quantidadeExibida = TAMANHO_PAGINA;

async function carregarVagas() {
  const numeroRequisicao = ++requisicaoVagasAtual;
  const feed = document.getElementById("lfg-feed");
  const btnMais = document.getElementById("btn-carregar-mais");
  if (!feed) return;
  feed.innerHTML = `<div class="mercado-estado"><strong>Carregando vagas...</strong><span>Aguarde um instante.</span></div>`;
  quantidadeExibida = TAMANHO_PAGINA;
  atualizarResumoMercado(0, true);

  const filtPlat  = document.getElementById("filtro-plataforma")?.value || "todas";
  const filtPos   = document.getElementById("filtro-posicao")?.value    || "todas";
  const filtJogo  = document.getElementById("filtro-jogo")?.value       || "todas";
  const filtEstilo = document.getElementById("filtro-estilo")?.value    || "todos";
  const ordenar   = document.getElementById("ordenar-vagas")?.value     || "recentes";
  const busca     = (document.getElementById("busca-texto")?.value || "").trim().toLowerCase();
  const soMeuNivel = document.getElementById("filtro-meu-nivel")?.checked || false;

  try {
    const [snap, clubesSnap] = await Promise.all([
      getDocs(query(collection(db, "vagas"), orderBy("criadoEm", "desc"))),
      getDocs(collection(db, "clubes")),
    ]);
    const clubesSuspensos = new Set(
      clubesSnap.docs.filter((clubeDoc) => clubeDoc.data().suspenso === true).map((clubeDoc) => clubeDoc.id),
    );
    const agora = Date.now();
    const validas = [];

    snap.docs.forEach(d => {
      const dados    = { id: d.id, ...d.data() };
      if (clubesSuspensos.has(dados.capitaoUid)) return;
      const criadoMs = dados.criadoEm?.toMillis?.() || 0;
      if (criadoMs && agora - criadoMs >= EXPIRACAO_MS) {
        if (usuarioAtual?.uid === dados.capitaoUid) {
          deleteDoc(d.ref).catch(err => console.warn("Não foi possível limpar vaga expirada:", err));
        }
        return;
      }
      validas.push(dados);
    });

    if (numeroRequisicao !== requisicaoVagasAtual) return;

    totalVagasDisponiveis = validas.length;

    // Estado vazio: nenhuma vaga publicada ainda na plataforma (não é sobre os filtros)
    if (!validas.length) {
      vagasFiltradasAtuais = [];
      feed.innerHTML = `
        <div class="mercado-estado">
          <strong>⚽ Ainda não há vagas publicadas.</strong>
          <span>Seja o primeiro clube a anunciar e aparecer para jogadores procurando time.</span>
        </div>`;
      btnMais?.classList.add("hidden");
      atualizarResumoMercado(0);
      return;
    }

    let filtradas = validas;
    if (filtPlat !== "todas") filtradas = filtradas.filter(v => normalizarPlataforma(v.plataforma) === filtPlat);
    if (filtPos  !== "todas") filtradas = filtradas.filter(v =>
      v.posicao === "psd" || v.posicao === filtPos || (filtPos === "mei" && v.posicao === "vol")
    );
    if (filtJogo !== "todas") filtradas = filtradas.filter(v => v.jogo       === filtJogo);
    if (filtEstilo !== "todos") filtradas = filtradas.filter(v => v.estilo   === filtEstilo);
    if (busca) {
      filtradas = filtradas.filter(v => {
        const plataforma = normalizarPlataforma(v.plataforma);
        const conteudo = [
          v.clube,
          v.descricao,
          v.capitaoNome,
          ROTULOS_PLATAFORMA[plataforma] || plataforma,
          ROTULOS_POSICAO[v.posicao] || v.posicao,
          ROTULOS_JOGO[v.jogo] || v.jogo,
          ROTULOS_ESTILO[v.estilo] || v.estilo,
        ].filter(Boolean).join(" ").toLowerCase();
        return conteudo.includes(busca);
      });
    }
    if (soMeuNivel) {
      if (!usuarioAtual) {
        toast("Faça login para usar esse filtro.", "erro");
        document.getElementById("filtro-meu-nivel").checked = false;
      } else if (!perfilAtual.overall) {
        toast("Preencha o overall no seu perfil para usar esse filtro.", "erro");
        document.getElementById("filtro-meu-nivel").checked = false;
      } else {
        filtradas = filtradas.filter(v => !v.overallMinimo || perfilAtual.overall >= v.overallMinimo);
      }
    }

    // Ordenação (a query já vem "recentes" por padrão do Firestore)
    if (ordenar === "antigas") {
      filtradas = [...filtradas].reverse();
    } else if (ordenar === "az") {
      filtradas = [...filtradas].sort((a, b) =>
        (a.clube || "").localeCompare(b.clube || "", "pt-BR"));
    }

    vagasFiltradasAtuais = filtradas;
    const vagaCompartilhadaId = new URLSearchParams(location.search).get("vaga");
    const indiceCompartilhado = vagaCompartilhadaId
      ? filtradas.findIndex(vaga => vaga.id === vagaCompartilhadaId)
      : -1;
    if (indiceCompartilhado >= quantidadeExibida) quantidadeExibida = indiceCompartilhado + 1;

    // Estado vazio: existem vagas, mas nenhuma bate com o filtro/busca atual
    if (!filtradas.length) {
      feed.innerHTML = `<div class="mercado-estado">
        <strong>Nenhuma vaga encontrada.</strong>
        <span>Limpe os filtros ou tente outra busca.</span>
      </div>`;
      btnMais?.classList.add("hidden");
      atualizarResumoMercado(0);
      return;
    }

    renderPaginaAtual();

  } catch (err) {
    if (numeroRequisicao !== requisicaoVagasAtual) return;
    vagasFiltradasAtuais = [];
    totalVagasDisponiveis = 0;
    feed.innerHTML = `<div class="mercado-estado erro">
      <strong>Erro ao carregar vagas.</strong>
      <span>Atualize a página e tente novamente.</span>
    </div>`;
    atualizarResumoMercado(0, false, true);
    console.error(err);
  }
}

function renderPaginaAtual() {
  const feed = document.getElementById("lfg-feed");
  const btnMais = document.getElementById("btn-carregar-mais");
  if (!feed) return;

  const visiveis = vagasFiltradasAtuais.slice(0, quantidadeExibida);
  feed.innerHTML = visiveis.map(v => cardVaga(v)).join("");

  feed.querySelectorAll(".btn-candidatar").forEach(btn =>
    btn.addEventListener("click", () =>
      candidatar(btn.dataset.vagaId, btn.dataset.capitaoUid, btn.dataset.clube, btn))
  );
  feed.querySelectorAll(".btn-excluir-vaga").forEach(btn =>
    btn.addEventListener("click", () => excluirVaga(btn.dataset.vagaId))
  );
  feed.querySelectorAll(".btn-editar-vaga").forEach(btn =>
    btn.addEventListener("click", () => {
      const v = vagasFiltradasAtuais.find(x => x.id === btn.dataset.vagaId);
      if (v) iniciarEdicaoVaga(v);
    })
  );
  feed.querySelectorAll(".btn-renovar-vaga").forEach(btn =>
    btn.addEventListener("click", () => renovarVaga(btn.dataset.vagaId))
  );
  feed.querySelectorAll(".btn-compartilhar-vaga").forEach(btn =>
    btn.addEventListener("click", () => compartilharVaga(btn.dataset.vagaId))
  );
  feed.querySelectorAll(".btn-denunciar-vaga").forEach(btn =>
    btn.addEventListener("click", () => denunciarVaga(btn.dataset.vagaId, btn.dataset.clube, btn.dataset.capitaoUid))
  );

  // Contadores e selos que dependem de outra consulta ao banco (assíncronos)
  visiveis.forEach(v => {
    if (usuarioAtual?.uid === v.capitaoUid) atualizarContadorCandidaturas(v.id);
    aplicarSeloVerificado(v.id, v.capitaoUid);
  });

  if (btnMais) btnMais.classList.toggle("hidden", quantidadeExibida >= vagasFiltradasAtuais.length);
  atualizarResumoMercado(vagasFiltradasAtuais.length);
}

document.getElementById("btn-carregar-mais")?.addEventListener("click", () => {
  quantidadeExibida += TAMANHO_PAGINA;
  renderPaginaAtual();
});

function cardVaga(v) {
  const ehDono = usuarioAtual?.uid === v.capitaoUid;
  const badgeClass = {
    ps5:"badge-ps5",ps4:"badge-ps5",xboxS:"badge-xbox",xboxO:"badge-xbox",
    pc:"badge-pc",switch2:"badge-switch",switch:"badge-switch",
  };
  const plataforma = normalizarPlataforma(String(v.plataforma || ""));
  const posicao = String(v.posicao || "—");
  const jogo = String(v.jogo || "—");
  const clube = String(v.clube || "Clube");
  const descricao = String(v.descricao || "");
  const capitaoNome = String(v.capitaoNome || "Capitão");
  const estilo = String(v.estilo || "Não informado");
  const plataformaTexto = ROTULOS_PLATAFORMA[plataforma] || plataforma || "Não informada";
  const posicaoTexto = ROTULOS_POSICAO[posicao] || posicao;
  const jogoTexto = ROTULOS_JOGO[jogo] || jogo;
  const estiloTexto = ROTULOS_ESTILO[estilo] || estilo;
  // Compatível com vagas antigas (campo fotoClube único) e novas (fotosClube array)
  const fotosOriginais = Array.isArray(v.fotosClube) && v.fotosClube.length
    ? v.fotosClube
    : (v.fotoClube ? [v.fotoClube] : []);
  const fotos = fotosOriginais.map(imagemSegura).filter(Boolean).slice(0, MAX_FOTOS_VAGA);
  const [fotoPrincipal, ...fotosExtras] = fotos;

  return `
    <div class="lfg-card" id="card-${v.id}">
      <div class="card-topo">
        <span class="badge ${badgeClass[plataforma] || ''}">${escHtml(plataformaTexto)}</span>
        <span class="badge badge-posicao">${escHtml(posicaoTexto)}</span>
        <span class="badge badge-jogo">${escHtml(jogoTexto)}</span>
        ${v.overallMinimo !== null && v.overallMinimo !== undefined && v.overallMinimo !== ""
          ? `<span class="badge-nivel-min">OVR mín: ${escHtml(v.overallMinimo)}</span>` : ""}
        <span style="margin-left:auto;font-size:0.75rem;font-weight:700;
          color:#A0AAB5;background:#1a1a1a;border:1px solid #333;
          border-radius:20px;padding:3px 10px;white-space:nowrap">${textoTempoPublicado(v.criadoEm)}</span>
      </div>
      <div class="card-corpo">
        <h3 class="gamertag">⚽ ${escHtml(clube)}<span id="selo-${v.id}"></span></h3>
        <p class="descricao">${escHtml(descricao)}</p>
        ${fotoPrincipal ? `
          <div class="card-imagem">
            <img src="${escHtml(fotoPrincipal)}" alt="Imagem do anúncio do clube ${escHtml(clube)}" />
          </div>` : ""}
        ${fotosExtras.length ? `
          <div class="card-galeria">
            ${fotosExtras.map((src, i) => `<img src="${escHtml(src)}" alt="Imagem extra ${i + 2} do anúncio de ${escHtml(clube)}" />`).join("")}
          </div>` : ""}
        <p style="font-size:0.8rem;color:#888">Capitão: ${escHtml(capitaoNome)} · ${escHtml(estiloTexto)}</p>
        ${v.capitaoUid ? `<div data-reputacao-uid="${escHtml(v.capitaoUid)}" data-reputacao-tipo="clube"></div>` : ""}
        ${ehDono ? `<p id="contador-${v.id}" style="font-size:0.8rem;color:#12E06C;font-weight:bold"></p>` : ""}
      </div>
      <div class="card-rodape">
        <span class="estilo-jogo">${escHtml(estiloTexto)}</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${v.capitaoUid ? `<a href="./clubes.html?uid=${encodeURIComponent(v.capitaoUid)}" class="btn-acao-card btn-ver-clube">👁 Ver clube</a>` : ""}
          <button type="button" class="btn-acao-card btn-compartilhar-vaga" data-vaga-id="${v.id}">🔗 Compartilhar</button>
          ${ehDono ? `
            <button type="button" class="btn-acao-card btn-editar-vaga" data-vaga-id="${v.id}">✏️ Editar</button>
            <button type="button" class="btn-acao-card btn-renovar-vaga" data-vaga-id="${v.id}">🔄 Renovar</button>
            <button type="button" class="btn-excluir-vaga" data-vaga-id="${v.id}">
              🗑 Excluir
            </button>
            <span style="color:#12E06C;font-size:0.85rem;font-weight:bold">✓ Sua vaga</span>
          ` : usuarioAtual ? `
            <button type="button" class="btn-acao-card btn-denunciar-vaga" data-vaga-id="${v.id}"
              data-clube="${escHtml(clube)}" data-capitao-uid="${escHtml(v.capitaoUid || "")}">🚩 Denunciar</button>
            <button type="button" class="btn-chamar btn-candidatar"
              data-vaga-id="${v.id}" data-capitao-uid="${escHtml(v.capitaoUid || "")}" data-clube="${escHtml(clube)}">
              Me candidatar
            </button>
          ` : `
            <a class="btn-chamar btn-candidatar-link"
              href="./cadastrar-se.html?continuar=${encodeURIComponent(`/HTML/mercado.html?vaga=${v.id}`)}#login">
              Entrar para me candidatar
            </a>
          `}
        </div>
      </div>
    </div>`;
}

function textoTempoPublicado(criadoEm) {
  const criadoMs = criadoEm?.toMillis?.() || Date.now();
  const diasPassados = Math.floor((Date.now() - criadoMs) / (24 * 60 * 60 * 1000));
  if (diasPassados <= 0) return "publicada hoje";
  if (diasPassados === 1) return "publicada há 1 dia";
  return `publicada há ${diasPassados} dias`;
}

async function excluirVaga(vagaId) {
  const ok = await confirmModal({
    titulo: "Excluir vaga",
    mensagem: "Tem certeza que quer excluir essa vaga? Isso não pode ser desfeito.",
    textoConfirmar: "Excluir",
    destrutivo: true,
  });
  if (!ok) return;
  try {
    await deleteDoc(doc(db, "vagas", vagaId));
    if (usuarioAtual && perfilAtual.clubeId === vagaId) {
      await setDoc(doc(db, "jogadores", usuarioAtual.uid), { clubeId: null }, { merge: true });
      perfilAtual = { ...perfilAtual, clubeId: null };
    }
    if (vagaEditandoId === vagaId) cancelarEdicaoVaga();
    toast("🗑 Vaga excluída.");
    await carregarVagas();
  } catch (err) { toast("Erro ao excluir: " + err.message, "erro"); }
}

// ─── Renovar vaga: reseta o prazo de 30 dias sem precisar recriar tudo ────────
async function renovarVaga(vagaId) {
  const ok = await confirmModal({
    titulo: "Renovar vaga",
    mensagem: "Renovar essa vaga por mais 30 dias?",
    textoConfirmar: "Renovar",
  });
  if (!ok) return;
  try {
    await updateDoc(doc(db, "vagas", vagaId), { criadoEm: serverTimestamp() });
    toast("🔄 Vaga renovada por mais 30 dias!");
    await carregarVagas();
  } catch (err) { toast("Erro ao renovar: " + err.message, "erro"); }
}

// ─── Compartilhar vaga: copia link direto pra essa vaga ────────────────────────
async function compartilharVaga(vagaId) {
  const link = `${location.origin}${location.pathname}?vaga=${vagaId}`;
  try {
    const vaga = vagasFiltradasAtuais.find((item) => item.id === vagaId);
    if (window.mercadoCompartilhar) {
      const clube = vaga?.clube || "um clube";
      const posicao = vaga?.posicao ? ` para ${vaga.posicao}` : "";
      window.mercadoCompartilhar({
        titulo: `Vaga no ${clube}`,
        texto: `O ${clube} está procurando jogador${posicao}. Veja os detalhes no Mercado Pro Clubs.`,
        url: link,
      });
      return;
    }
    await navigator.clipboard.writeText(link);
    toast("🔗 Link copiado! Cole no grupo do seu time.");
  } catch {
    prompt("Copie o link da vaga:", link);
  }
}

// ─── Denunciar vaga ────────────────────────────────────────────────────────────
function solicitarDetalhesDenuncia(clube) {
  return new Promise((resolve) => {
    document.getElementById("modal-denuncia")?.remove();
    const focoAnterior = document.activeElement;
    const overlay = document.createElement("div");
    overlay.id = "modal-denuncia";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <form class="modal-confirm-box denuncia-modal-box" role="dialog" aria-modal="true" aria-labelledby="denuncia-modal-titulo">
        <h3 id="denuncia-modal-titulo" class="modal-confirm-titulo">Denunciar vaga</h3>
        <p class="modal-confirm-mensagem">Informe o motivo da denúncia sobre “${escHtml(clube)}”. A equipe administrativa receberá os detalhes.</p>
        <label class="denuncia-modal-campo" for="denuncia-motivo">
          <span>Motivo</span>
          <select id="denuncia-motivo" required>
            <option value="">Selecione um motivo</option>
            <option value="spam">Spam ou anúncio repetido</option>
            <option value="ofensivo">Conteúdo ofensivo ou discriminatório</option>
            <option value="falso">Informação falsa ou enganosa</option>
            <option value="golpe">Suspeita de golpe</option>
            <option value="inadequado">Conteúdo inadequado</option>
            <option value="outro">Outro motivo</option>
          </select>
        </label>
        <label class="denuncia-modal-campo" for="denuncia-detalhes">
          <span>Detalhes <small>(opcional)</small></span>
          <textarea id="denuncia-detalhes" maxlength="500" placeholder="Explique o que aconteceu para ajudar na análise."></textarea>
          <small id="denuncia-contador">0/500</small>
        </label>
        <div class="modal-confirm-acoes">
          <button type="button" class="modal-confirm-cancelar">Cancelar</button>
          <button type="submit" class="modal-confirm-confirmar destrutivo" disabled>Enviar denúncia</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector("form");
    const motivo = overlay.querySelector("select");
    const detalhes = overlay.querySelector("textarea");
    const contador = overlay.querySelector("#denuncia-contador");
    const confirmar = overlay.querySelector("button[type='submit']");
    const cancelar = overlay.querySelector(".modal-confirm-cancelar");
    let finalizado = false;

    const finalizar = (resultado) => {
      if (finalizado) return;
      finalizado = true;
      document.removeEventListener("keydown", aoTeclar);
      overlay.remove();
      if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) focoAnterior.focus();
      resolve(resultado);
    };
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") finalizar(null);
    };
    motivo.addEventListener("change", () => { confirmar.disabled = !motivo.value; });
    detalhes.addEventListener("input", () => { contador.textContent = `${detalhes.value.length}/500`; });
    cancelar.addEventListener("click", () => finalizar(null));
    overlay.addEventListener("click", (evento) => { if (evento.target === overlay) finalizar(null); });
    form.addEventListener("submit", (evento) => {
      evento.preventDefault();
      if (!motivo.value) return;
      finalizar({ motivo: motivo.value, detalhes: detalhes.value.trim() });
    });
    document.addEventListener("keydown", aoTeclar);
    motivo.focus();
  });
}

async function denunciarVaga(vagaId, clube, capitaoUid) {
  const usuario = usuarioAtual;
  if (!usuario) { toast("Faça login para denunciar.", "erro"); return; }
  const dados = await solicitarDetalhesDenuncia(clube);
  if (!dados) return;
  try {
    const referencia = doc(db, "denuncias", `${usuario.uid}_${vagaId}`);
    const existente = await getDoc(referencia);
    if (existente.exists()) {
      toast("Você já denunciou esta vaga. A equipe administrativa fará a análise.", "erro");
      return;
    }
    await setDoc(referencia, {
      vagaId,
      clube,
      capitaoUid: capitaoUid || "",
      denuncianteUid: usuario.uid,
      motivo: dados.motivo,
      detalhes: dados.detalhes,
      status: "pendente",
      criadoEm: serverTimestamp(),
    });
    toast("🚩 Denúncia enviada. Obrigado por ajudar a manter o mercado seguro!");
  } catch (err) { toast("Erro ao denunciar: " + err.message, "erro"); }
}

// ─── Contador de candidaturas (visível só pro capitão dono da vaga) ────────────
async function atualizarContadorCandidaturas(vagaId) {
  const el = document.getElementById(`contador-${vagaId}`);
  if (!el || !usuarioAtual) return;
  try {
    const snap = await getDocs(query(
      collection(db, "candidaturas"),
      where("vagaId", "==", vagaId),
      where("capitaoUid", "==", usuarioAtual.uid),
    ));
    el.textContent = snap.size > 0
      ? `👥 ${snap.size} candidatura(s) recebida(s)`
      : "";
  } catch { /* silencioso: não é crítico exibir isso */ }
}

// ─── Selo de clube verificado (5+ contratações aceitas) ────────────────────────
const cacheVerificado = new Map();
async function aplicarSeloVerificado(vagaId, capitaoUid) {
  const el = document.getElementById(`selo-${vagaId}`);
  if (!el || !uidFirestoreValido(capitaoUid)) return;
  try {
    if (!cacheVerificado.has(capitaoUid)) {
      const clubeSnap = await getDoc(doc(db, "clubes", capitaoUid));
      cacheVerificado.set(capitaoUid, clubeSnap.exists() && clubeSnap.data().verificado === true);
    }
    if (cacheVerificado.get(capitaoUid)) {
      el.innerHTML = `<span class="badge-verificado" title="Clube verificado pela moderação">✅ Verificado</span>`;
    }
  } catch { /* silencioso */ }
}

// ─── Destaca a vaga aberta via link compartilhado (?vaga=ID) ──────────────────
function destacarVagaCompartilhada() {
  const params = new URLSearchParams(location.search);
  const vagaId = params.get("vaga");
  if (!vagaId) return;
  setTimeout(() => {
    const card = document.getElementById(`card-${vagaId}`);
    if (card) {
      card.classList.add("destaque-compartilhada");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      toast("Essa vaga não está mais disponível (pode ter expirado ou sido removida).", "erro");
    }
  }, 400);
}

["filtro-plataforma","filtro-posicao","filtro-jogo","filtro-estilo","ordenar-vagas","filtro-meu-nivel"].forEach(id =>
  document.getElementById(id)?.addEventListener("change", carregarVagas)
);

// Busca por texto: espera o usuário parar de digitar (debounce) antes de filtrar
let buscaTimeout = null;
document.getElementById("busca-texto")?.addEventListener("input", () => {
  clearTimeout(buscaTimeout);
  buscaTimeout = setTimeout(carregarVagas, 350);
});

document.getElementById("btn-limpar-filtros")?.addEventListener("click", () => {
  const valoresPadrao = {
    "filtro-plataforma": "todas",
    "filtro-posicao": "todas",
    "filtro-jogo": "todas",
    "filtro-estilo": "todos",
    "ordenar-vagas": "recentes",
  };
  Object.entries(valoresPadrao).forEach(([id, valor]) => {
    const campo = document.getElementById(id);
    if (campo) campo.value = valor;
  });
  const busca = document.getElementById("busca-texto");
  const nivel = document.getElementById("filtro-meu-nivel");
  if (busca) busca.value = "";
  if (nivel) nivel.checked = false;
  carregarVagas();
});

// =========================================================================
// 3. CANDIDATAR-SE
// =========================================================================
function uidFirestoreValido(valor) {
  const uid = String(valor || "").trim();
  return Boolean(uid) && !["undefined", "null", "—"].includes(uid.toLowerCase());
}

async function resolverDadosDaVaga(vagaId, capitaoRecebido, clubeRecebido) {
  if (!vagaId) throw new Error("Não foi possível identificar a vaga.");
  const vagaSnap = await getDoc(doc(db, "vagas", vagaId));
  if (!vagaSnap.exists()) throw new Error("Essa vaga não está mais disponível.");

  const vaga = vagaSnap.data();
  let capitaoUid = uidFirestoreValido(vaga.capitaoUid) ? vaga.capitaoUid : capitaoRecebido;
  const clube = String(vaga.clube || clubeRecebido || "Clube").trim();

  // Compatibilidade com vagas antigas que não salvaram capitaoUid.
  if (!uidFirestoreValido(capitaoUid) && clube) {
    const clubesSnap = await getDocs(query(
      collection(db, "clubes"),
      where("nome", "==", clube),
      limit(2),
    ));
    if (clubesSnap.size === 1) {
      const clubeDoc = clubesSnap.docs[0];
      capitaoUid = uidFirestoreValido(clubeDoc.data().capitaoUid)
        ? clubeDoc.data().capitaoUid
        : clubeDoc.id;
    }
  }

  if (!uidFirestoreValido(capitaoUid)) {
    throw new Error("Essa é uma vaga antiga sem capitão identificado. O clube precisa republicá-la.");
  }
  return { capitaoUid, clube, vaga };
}

async function candidatar(vagaId, capitaoRecebido, clubeRecebido, botao) {
  const usuario = usuarioAtual;
  if (!usuario) { toast("Faça login para se candidatar.", "erro"); return; }
  if (perfilAtual.clubeAtualId) {
    toast("Você já faz parte de um clube. Saia do clube atual antes de se candidatar.", "erro");
    return;
  }
  const textoOriginal = botao?.textContent || "Me candidatar";
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Enviando...";
  }
  try {
    const { capitaoUid, clube } = await resolverDadosDaVaga(vagaId, capitaoRecebido, clubeRecebido);
    if (usuario.uid === capitaoUid) throw new Error("Você é o capitão desse clube.");

    const existSnap = await getDocs(query(
      collection(db, "candidaturas"),
      where("jogadorUid","==",usuario.uid),
      where("vagaId","==",vagaId)
    ));
    const existentes = existSnap.docs.map(candidaturaDoc => ({
      ref: candidaturaDoc.ref,
      ...candidaturaDoc.data(),
    }));
    const ativa = existentes.find(candidatura => ["pendente", "aceito"].includes(candidatura.status));
    if (ativa) {
      const mensagem = ativa.status === "aceito"
        ? "Sua candidatura já foi aceita por esse clube."
        : "Sua candidatura já está aguardando resposta.";
      if (botao) botao.textContent = ativa.status === "aceito" ? "Candidatura aceita" : "Candidatura pendente";
      toast(mensagem, ativa.status === "aceito" ? "sucesso" : "erro");
      return;
    }

    const dadosCandidatura = {
      vagaId, clube,
      jogadorUid:  usuario.uid,
      jogadorNome: perfilAtual.nickname || usuario.displayName || "Jogador",
      jogadorFoto: perfilAtual.fotoURL  || "",
      posicao:     perfilAtual.posicao  || "—",
      overall:     perfilAtual.overall  || "—",
      capitaoUid,
      status: "pendente",
      jogadorViu: false,
      atualizadoEm: serverTimestamp(),
    };

    const antiga = existentes.find(candidatura => ["recusado", "cancelado"].includes(candidatura.status));
    if (antiga) {
      await updateDoc(antiga.ref, { ...dadosCandidatura, reenviadoEm: serverTimestamp() });
    } else {
      await addDoc(collection(db, "candidaturas"), {
        ...dadosCandidatura,
        criadoEm: serverTimestamp(),
      });
    }
    if (botao) botao.textContent = "Candidatura pendente";
    toast("✅ Candidatura enviada! Aguarde o capitão.");
  } catch (err) {
    if (botao) {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
    toast("Erro ao candidatar: " + err.message, "erro");
  }
}

// =========================================================================
// 4. NOTIFICAÇÕES (sino 🔔)
// =========================================================================
function escutarNotificacoes(uid) {
  // Capitão: candidaturas pendentes
  const unsubCapitao = onSnapshot(
    query(collection(db,"candidaturas"), where("capitaoUid","==",uid), where("status","==","pendente")),
    (snap) => {
      contagemNotificacoesCapitao = snap.size;
      atualizarBadgeSino();
      snap.docChanges().forEach(c => { if (c.type==="added") cardNotifCapitao(c.doc); });
    },
    (err) => console.warn("Não foi possível acompanhar candidaturas:", err.message)
  );
  // Jogador: aceites não vistos
  const unsubJogador = onSnapshot(
    query(collection(db,"candidaturas"),
      where("jogadorUid","==",uid), where("status","==","aceito"), where("jogadorViu","==",false)),
    (snap) => {
      contagemNotificacoesJogador = snap.size;
      atualizarBadgeSino();
      snap.docChanges().forEach(c => { if (c.type==="added") cardNotifJogador(c.doc); });
    },
    (err) => console.warn("Índice pendente:", err.message)
  );
  // Jogador: convites diretos enviados por capitães no mercado de jogadores
  const unsubConvites = onSnapshot(
    query(collection(db, "convitesClube"), where("jogadorUid", "==", uid), where("status", "==", "pendente")),
    (snap) => {
      contagemConvitesClube = snap.size;
      atualizarBadgeSino();
      snap.docChanges().forEach((mudanca) => {
        const id = `convite-notif-${mudanca.doc.id}`;
        if (mudanca.type === "removed") {
          document.getElementById(id)?.remove();
        } else {
          cardNotifConviteClube(mudanca.doc);
        }
      });
    },
    (err) => console.warn("Não foi possível acompanhar convites de clubes:", err.message)
  );
  unsubsNotificacoes.push(unsubCapitao, unsubJogador, unsubConvites);
}

function atualizarBadgeSino() {
  const b = document.getElementById("badge");
  if (!b) return;
  const count = contagemNotificacoesCapitao + contagemNotificacoesJogador + contagemConvitesClube;
  b.textContent = count;
  b.classList.toggle("hidden", count === 0);
}

// ── Painel do sino ────────────────────────────────────────────────────────────
function garantirPainelSino() {
  let p = document.getElementById("painel-sino");
  if (p) return p;
  p = document.createElement("div");
  p.id = "painel-sino";
  p.style.cssText = `
    position:fixed;top:80px;right:20px;width:320px;max-height:80vh;overflow-y:auto;
    background:#0b1410;border:1px solid #1e3a1e;border-radius:14px;padding:14px;
    z-index:9998;box-shadow:0 8px 32px rgba(0,0,0,0.6);display:none;flex-direction:column;gap:10px;
  `;
  p.innerHTML = `
    <div class="notificacoes-cabecalho">
      <h3>🔔 Notificações</h3>
      <button type="button" id="sino-fechar" aria-label="Fechar notificações">✕</button>
    </div>
    <div class="notificacoes-abas" role="tablist" aria-label="Notificações e histórico">
      <button type="button" class="notificacoes-aba ativo" data-notificacoes-aba="pendentes"
        role="tab" aria-selected="true" aria-controls="sino-lista">Pendentes</button>
      <button type="button" class="notificacoes-aba" data-notificacoes-aba="historico"
        role="tab" aria-selected="false" aria-controls="sino-historico">Histórico rápido</button>
    </div>
    <div id="sino-lista" class="notificacoes-painel" role="tabpanel">
      <p class="notificacoes-vazio">Sem notificações pendentes.</p>
    </div>
    <div id="sino-historico" class="notificacoes-painel" role="tabpanel" hidden>
      <p class="notificacoes-vazio">Abra esta aba para carregar o histórico.</p>
    </div>
    <div class="notificacoes-rodape">
      <p>O sino mostra alertas rápidos.</p>
      <a href="${CAMINHO_NEGOCIACOES}">Abrir Minhas negociações →</a>
    </div>
  `;
  document.body.appendChild(p);

  document.getElementById("sino-fechar")?.addEventListener("click", fecharPainelSino);
  p.querySelectorAll("[data-notificacoes-aba]").forEach((botao) => {
    botao.addEventListener("click", () => trocarAbaNotificacoes(botao.dataset.notificacoesAba));
  });

  document.getElementById("sino-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    fecharPainelMsg();
    p.style.display = p.style.display === "flex" ? "none" : "flex";
  });
  document.addEventListener("click", (e) => {
    if (!p.contains(e.target) && e.target.id !== "sino-btn") p.style.display = "none";
  });
  return p;
}

function trocarAbaNotificacoes(aba) {
  const historicoAtivo = aba === "historico";
  document.querySelectorAll("[data-notificacoes-aba]").forEach((botao) => {
    const ativo = botao.dataset.notificacoesAba === (historicoAtivo ? "historico" : "pendentes");
    botao.classList.toggle("ativo", ativo);
    botao.setAttribute("aria-selected", String(ativo));
  });
  const pendentes = document.getElementById("sino-lista");
  const historico = document.getElementById("sino-historico");
  if (pendentes) pendentes.hidden = historicoAtivo;
  if (historico) historico.hidden = !historicoAtivo;
  if (historicoAtivo && usuarioAtual) carregarHistoricoConvites(usuarioAtual.uid);
}

function rotuloStatusConvite(status) {
  return ({
    pendente: "Pendente",
    aceito: "Aceito",
    recusado: "Recusado",
    cancelado: "Cancelado",
  })[status] || "Atualizado";
}

function momentoHistorico(item) {
  return item.respondidoEm?.toMillis?.()
    || item.canceladoEm?.toMillis?.()
    || item.reenviadoEm?.toMillis?.()
    || item.atualizadoEm?.toMillis?.()
    || item.criadoEm?.toMillis?.()
    || 0;
}

async function normalizarCandidaturaAntiga(candidaturaDoc) {
  const candidatura = candidaturaDoc.data();
  if (uidFirestoreValido(candidatura.capitaoUid) || !candidatura.vagaId) {
    return { id: candidaturaDoc.id, ...candidatura };
  }
  try {
    const resolvido = await resolverDadosDaVaga(
      candidatura.vagaId,
      candidatura.capitaoUid,
      candidatura.clube,
    );
    await updateDoc(candidaturaDoc.ref, {
      capitaoUid: resolvido.capitaoUid,
      clube: resolvido.clube,
      atualizadoEm: serverTimestamp(),
    });
    return {
      id: candidaturaDoc.id,
      ...candidatura,
      capitaoUid: resolvido.capitaoUid,
      clube: resolvido.clube,
    };
  } catch (err) {
    console.warn("Candidatura antiga sem capitão não pôde ser reparada:", candidaturaDoc.id, err);
    return { id: candidaturaDoc.id, ...candidatura };
  }
}

async function carregarHistoricoConvites(uid) {
  const container = document.getElementById("sino-historico");
  if (!container || !uid) return;
  container.innerHTML = `<p class="notificacoes-vazio">Carregando histórico...</p>`;
  try {
    const [convitesRecebidosSnap, convitesEnviadosSnap, candidaturasEnviadasSnap, candidaturasRecebidasSnap] = await Promise.all([
      getDocs(query(collection(db, "convitesClube"), where("jogadorUid", "==", uid))),
      getDocs(query(collection(db, "convitesClube"), where("capitaoUid", "==", uid))),
      getDocs(query(collection(db, "candidaturas"), where("jogadorUid", "==", uid))),
      getDocs(query(collection(db, "candidaturas"), where("capitaoUid", "==", uid))),
    ]);
    const candidaturasEnviadas = await Promise.all(
      candidaturasEnviadasSnap.docs.map(normalizarCandidaturaAntiga),
    );
    const itens = [
      ...convitesRecebidosSnap.docs.map((conviteDoc) => ({
        id: conviteDoc.id, tipo: "convite", direcao: "recebido", ...conviteDoc.data(),
      })),
      ...convitesEnviadosSnap.docs.map((conviteDoc) => ({
        id: conviteDoc.id, tipo: "convite", direcao: "enviado", ...conviteDoc.data(),
      })),
      ...candidaturasEnviadas.map((candidatura) => ({
        ...candidatura, tipo: "candidatura", direcao: "enviado",
      })),
      ...candidaturasRecebidasSnap.docs.map((candidaturaDoc) => ({
        id: candidaturaDoc.id, tipo: "candidatura", direcao: "recebido", ...candidaturaDoc.data(),
      })),
    ].sort((a, b) => momentoHistorico(b) - momentoHistorico(a));

    if (!itens.length) {
      container.innerHTML = `<p class="notificacoes-vazio">Nenhuma candidatura ou convite no histórico.</p>`;
      return;
    }

    container.innerHTML = itens.map((item) => {
      const timestamp = item.respondidoEm || item.canceladoEm || item.reenviadoEm || item.atualizadoEm || item.criadoEm;
      const data = timestamp?.toDate?.().toLocaleDateString("pt-BR") || "Data não informada";
      let descricao = "Movimentação atualizada";
      if (item.tipo === "convite") {
        descricao = item.direcao === "recebido"
          ? `${item.clube || "Um clube"} convidou você`
          : `Convite enviado para ${item.jogadorNome || "jogador"}`;
      } else {
        descricao = item.direcao === "recebido"
          ? `${item.jogadorNome || "Um jogador"} candidatou-se ao ${item.clube || "clube"}`
          : `Você se candidatou ao ${item.clube || "clube"}`;
      }
      const botaoChat = item.status === "aceito" && item.chatId
        ? `<button type="button" class="historico-abrir-chat" data-chat-id="${escHtml(item.chatId)}"
            data-clube="${escHtml(item.clube || "Clube")}">Abrir conversa</button>`
        : "";
      const podeCancelar = item.status === "pendente"
        && item.direcao === "enviado"
        && (item.tipo === "candidatura" || item.tipo === "convite");
      const botaoCancelar = podeCancelar
        ? `<button type="button" class="historico-cancelar" data-tipo="${escHtml(item.tipo)}"
            data-id="${escHtml(item.id)}">Cancelar ${item.tipo}</button>`
        : "";
      return `<article class="historico-convite-item">
        <div class="historico-convite-topo">
          <strong>${escHtml(descricao)}</strong>
          <span class="historico-status status-${escHtml(item.status || "atualizado")}">${escHtml(rotuloStatusConvite(item.status))}</span>
        </div>
        <small>${item.direcao === "recebido" ? "Recebido" : "Enviado"} · atualizado em ${escHtml(data)}</small>
        ${(botaoChat || botaoCancelar) ? `<div class="historico-acoes">${botaoChat}${botaoCancelar}</div>` : ""}
      </article>`;
    }).join("");

    container.querySelectorAll(".historico-abrir-chat").forEach((botao) => {
      botao.addEventListener("click", () => {
        fecharPainelSino();
        garantirPainelMsg();
        abrirChat(botao.dataset.chatId, botao.dataset.clube);
      });
    });
    container.querySelectorAll(".historico-cancelar").forEach((botao) => {
      botao.addEventListener("click", async () => {
        const colecao = botao.dataset.tipo === "candidatura" ? "candidaturas" : "convitesClube";
        botao.disabled = true;
        botao.textContent = "Cancelando...";
        try {
          await updateDoc(doc(db, colecao, botao.dataset.id), {
            status: "cancelado",
            canceladoEm: serverTimestamp(),
            canceladoPor: uid,
            atualizadoEm: serverTimestamp(),
          });
          toast(botao.dataset.tipo === "candidatura" ? "Candidatura cancelada." : "Convite cancelado.");
          await carregarHistoricoConvites(uid);
        } catch (err) {
          botao.disabled = false;
          botao.textContent = `Cancelar ${botao.dataset.tipo}`;
          toast("Não foi possível cancelar agora.", "erro");
          console.error("Erro ao cancelar movimentação:", err);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="notificacoes-vazio erro">Não foi possível carregar o histórico.</p>`;
    console.error("Erro ao carregar histórico de convites:", err);
  }
}

function cardNotifCapitao(docSnap) {
  const d = docSnap.data();
  garantirPainelSino();
  const lista = document.getElementById("sino-lista");
  if (!lista || document.getElementById(`notif-${docSnap.id}`)) return;
  // Remove apenas o texto vazio, sem apagar conteúdo de outra notificação.
  lista.querySelector(":scope > p")?.remove();

  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `background:#1a2a1a;border:1px solid #1e3a1e;border-radius:10px;
    padding:12px;font-size:0.85rem;color:#E6EDF3;margin-bottom:8px`;
  card.innerHTML = `
    <p style="margin:0 0 4px 0">
      <strong style="color:#12E06C">${escHtml(d.jogadorNome || "Jogador")}</strong> quer entrar no <strong>${escHtml(d.clube || "Clube")}</strong>
    </p>
    <p style="margin:0 0 10px 0;color:#A0AAB5;font-size:0.8rem">Posição: ${escHtml(d.posicao || "—")} · Overall: ${escHtml(d.overall || "—")}</p>
    <div style="display:flex;gap:8px">
      <button data-id="${docSnap.id}" data-jogador="${escHtml(d.jogadorUid || "")}" data-clube="${escHtml(d.clube || "Clube")}" class="btn-aceitar"
        style="flex:1;padding:8px;background:#12E06C;color:#050B14;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">✅ Aceitar</button>
      <button data-id="${docSnap.id}" class="btn-recusar"
        style="flex:1;padding:8px;background:#333;color:#fff;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">❌ Recusar</button>
    </div>`;
  card.querySelector(".btn-aceitar").addEventListener("click", (e) => {
    const b = e.currentTarget;
    aceitarCandidatura(b.dataset.id, b.dataset.jogador, b.dataset.clube, card);
  });
  card.querySelector(".btn-recusar").addEventListener("click", (e) =>
    recusarCandidatura(e.currentTarget.dataset.id, card)
  );
  lista.prepend(card);
}

function cardNotifJogador(docSnap) {
  const d = docSnap.data();
  garantirPainelSino();
  const lista = document.getElementById("sino-lista");
  if (!lista || document.getElementById(`notif-${docSnap.id}`)) return;
  lista.querySelector(":scope > p")?.remove();

  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `background:#0a1f0a;border:1px solid #12E06C;border-radius:10px;
    padding:12px;font-size:0.85rem;color:#E6EDF3;margin-bottom:8px`;
  card.innerHTML = `
    <p style="margin:0 0 8px 0">
      🎉 Você foi <strong style="color:#12E06C">aceito</strong> no clube <strong>${escHtml(d.clube || "Clube")}</strong>!
    </p>
    <button data-chat="${escHtml(d.chatId || "")}" class="btn-abrir-chat-notif"
      style="width:100%;padding:8px;background:#12E06C;color:#050B14;border:none;
             border-radius:8px;font-weight:bold;cursor:pointer">
      💬 Abrir chat do clube
    </button>`;
  card.querySelector(".btn-abrir-chat-notif").addEventListener("click", async (e) => {
    const chatId = e.currentTarget.dataset.chat;
    if (!chatId) { toast("O chat desta candidatura não está disponível.", "erro"); return; }
    try {
      await updateDoc(docSnap.ref, { jogadorViu: true });
    } catch (err) {
      console.warn("Não foi possível marcar a notificação como vista:", err);
    }
    abrirChat(chatId);
    document.getElementById("painel-sino").style.display = "none";
  });
  // Aqui quem está logado é o próprio jogador (auth.uid === usuarioAtual.uid),
  // então essa escrita é permitida pelas regras do Firestore.
  // IMPORTANTE: os campos precisam ser clubeAtualId/clubeAtualNome — é isso
  // que clube.js consulta pra montar o Elenco (where clubeAtualId == capitaoUid).
  if (usuarioAtual) {
    setDoc(doc(db, "jogadores", usuarioAtual.uid), {
      clubeAtualId: d.capitaoUid,
      clubeAtualNome: d.clube,
      procurandoClube: false,
      agenteLivre: false,
    }, { merge: true })
      .catch(err => console.error("Erro ao atualizar perfil do jogador:", err));
  }
  lista.prepend(card);
}

function cardNotifConviteClube(docSnap) {
  const convite = docSnap.data();
  garantirPainelSino();
  const lista = document.getElementById("sino-lista");
  const cardId = `convite-notif-${docSnap.id}`;
  if (!lista || document.getElementById(cardId)) return;
  lista.querySelector(":scope > p")?.remove();

  const card = document.createElement("div");
  card.id = cardId;
  card.style.cssText = `background:#0f2115;border:1px solid #22C55E;border-radius:10px;
    padding:12px;font-size:0.85rem;color:#E6EDF3;margin-bottom:8px`;
  card.innerHTML = `
    <p style="margin:0 0 9px 0">
      📩 <strong style="color:#22C55E">${escHtml(convite.clube || "Um clube")}</strong> convidou você para o elenco.
    </p>
    <div style="display:flex;gap:8px">
      <button type="button" class="btn-aceitar-convite-mercado"
        style="flex:1;padding:8px;background:#22C55E;color:#07130b;border:none;border-radius:8px;font-weight:bold;cursor:pointer">
        Aceitar
      </button>
      <button type="button" class="btn-recusar-convite-mercado"
        style="flex:1;padding:8px;background:#333;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer">
        Recusar
      </button>
    </div>`;

  card.querySelector(".btn-aceitar-convite-mercado").addEventListener("click", async () => {
    if (!usuarioAtual) return;
    card.querySelectorAll("button").forEach((botao) => (botao.disabled = true));
    try {
      await setDoc(doc(db, "jogadores", usuarioAtual.uid), {
        clubeAtualId: convite.capitaoUid,
        clubeAtualNome: convite.clube,
        procurandoClube: false,
        agenteLivre: false,
      }, { merge: true });
      const chatId = `convite-clube-${docSnap.id}`;
      const mensagemInicial = `Convite aceito! Agora faço parte do ${convite.clube || "clube"}.`;
      await setDoc(doc(db, "chats", chatId), {
        clube: convite.clube || "Clube",
        participantes: [convite.capitaoUid, usuarioAtual.uid],
        tipo: "convite-clube",
        criadoEm: serverTimestamp(),
        ultimaMensagemTexto: mensagemInicial,
        ultimaMensagemAutorUid: usuarioAtual.uid,
        ultimaMensagemEm: serverTimestamp(),
        lidoPor: [usuarioAtual.uid],
        arquivadoPor: [],
      }, { merge: true });
      try {
        await addDoc(collection(db, "chats", chatId, "mensagens"), {
          texto: mensagemInicial,
          autorUid: usuarioAtual.uid,
          autorNome: perfilAtual.nickname || usuarioAtual.displayName || "Jogador",
          enviadoEm: serverTimestamp(),
        });
      } catch (mensagemErr) {
        console.warn("Convite aceito, mas a mensagem inicial não foi criada:", mensagemErr);
      }
      await updateDoc(docSnap.ref, {
        status: "aceito",
        chatId,
        respondidoEm: serverTimestamp(),
      });
      perfilAtual = {
        ...perfilAtual,
        clubeAtualId: convite.capitaoUid,
        clubeAtualNome: convite.clube,
        procurandoClube: false,
        agenteLivre: false,
      };
      jogadoresDisponiveisAtuais = jogadoresDisponiveisAtuais.filter((jogador) => jogador.uid !== usuarioAtual.uid);
      aplicarFiltrosJogadores();
      card.remove();
      toast(`Bem-vindo ao ${convite.clube || "clube"}! A conversa foi criada.`);
    } catch (err) {
      card.querySelectorAll("button").forEach((botao) => (botao.disabled = false));
      toast("Não foi possível aceitar o convite.", "erro");
      console.error("Erro ao aceitar convite do clube:", err);
    }
  });

  card.querySelector(".btn-recusar-convite-mercado").addEventListener("click", async () => {
    card.querySelectorAll("button").forEach((botao) => (botao.disabled = true));
    try {
      await updateDoc(docSnap.ref, { status: "recusado", respondidoEm: serverTimestamp() });
      card.remove();
      toast("Convite recusado.");
    } catch (err) {
      card.querySelectorAll("button").forEach((botao) => (botao.disabled = false));
      toast("Não foi possível recusar o convite.", "erro");
    }
  });

  lista.prepend(card);
}

// =========================================================================
// 5. ACEITAR / RECUSAR CANDIDATURA
// =========================================================================
async function aceitarCandidatura(candidaturaId, jogadorUid, clube, card) {
  const usuario = usuarioAtual;
  if (!usuario || !jogadorUid) {
    toast("Não foi possível identificar os participantes.", "erro");
    return;
  }
  card.style.opacity = "0.6";
  card.querySelectorAll("button").forEach(b => b.disabled = true);
  try {
    const chatRef = doc(db, "chats", `candidatura-${candidaturaId}`);
    await setDoc(chatRef, {
      clube,
      participantes: [usuario.uid, jogadorUid],
      tipo: "candidatura",
      criadoEm: serverTimestamp(),
      lidoPor: [usuario.uid, jogadorUid],
      arquivadoPor: [],
    }, { merge: true });
    await updateDoc(doc(db,"candidaturas",candidaturaId), {
      status: "aceito",
      chatId: chatRef.id,
      jogadorViu: false,
      capitaoUid: usuario.uid,
      respondidoEm: serverTimestamp(),
      respondidoPor: usuario.uid,
      atualizadoEm: serverTimestamp(),
    });
    // OBS: a atualização do perfil do jogador (jogadores/{jogadorUid}) NÃO é feita
    // aqui, porque quem está rodando esse código é o capitão, e as regras do
    // Firestore só permitem que cada usuário escreva no próprio documento
    // (allow write: if request.auth.uid == uid). Isso é feito pelo próprio
    // jogador em cardNotifJogador(), quando ele visualiza a notificação de aceite.

    card.style.opacity = "1";
    card.innerHTML = `
      <p style="color:#12E06C;margin:0 0 8px 0;text-align:center;font-weight:bold">✅ Jogador aceito!</p>
      <button data-chat="${chatRef.id}" class="btn-abrir-chat-notif"
        style="width:100%;padding:8px;background:#12E06C;color:#050B14;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">💬 Abrir chat com o jogador</button>`;
    card.querySelector(".btn-abrir-chat-notif").addEventListener("click", (e) => {
      document.getElementById("painel-sino").style.display = "none";
      // Abre o painel de mensagens direto no chat criado
      garantirPainelMsg();
      document.getElementById("painel-msg").style.display = "flex";
      abrirChat(e.currentTarget.dataset.chat);
    });
    // Recarrega lista de chats em background
    carregarListaChats(usuario.uid);
  } catch (err) {
    card.style.opacity = "1";
    card.querySelectorAll("button").forEach(b => b.disabled = false);
    toast("Erro ao aceitar: " + err.message, "erro");
  }
}

async function recusarCandidatura(candidaturaId, card) {
  try {
    await updateDoc(doc(db,"candidaturas",candidaturaId), {
      status: "recusado",
      respondidoEm: serverTimestamp(),
      respondidoPor: usuarioAtual?.uid || "",
      atualizadoEm: serverTimestamp(),
    });
    card.style.opacity = "0.4";
    card.innerHTML = `<p style="color:#666;margin:0;text-align:center">Candidatura recusada.</p>`;
  } catch (err) { toast("Erro ao recusar: " + err.message, "erro"); }
}

// =========================================================================
// 6. PAINEL DE MENSAGENS (ícone ✉️)
// =========================================================================
function atualizarBadgeMensagens() {
  const icone = document.getElementById("emailIcon");
  if (!icone) return;
  let badge = document.getElementById("mensagens-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "mensagens-badge";
    badge.className = "mensagens-badge";
    icone.appendChild(badge);
  }
  badge.textContent = conversasNaoLidas > 9 ? "9+" : String(conversasNaoLidas);
  badge.hidden = conversasNaoLidas === 0;
  icone.setAttribute(
    "aria-label",
    conversasNaoLidas
      ? `Abrir mensagens. ${conversasNaoLidas} conversa(s) com mensagem nova.`
      : "Abrir mensagens"
  );
}

function escutarChatsNaoLidos(uid) {
  if (unsubChatsNaoLidos) unsubChatsNaoLidos();
  unsubChatsNaoLidos = onSnapshot(
    query(collection(db, "chats"), where("participantes", "array-contains", uid)),
    (snap) => {
      conversasNaoLidas = snap.docs.filter((chatDoc) => {
        const chat = chatDoc.data();
        const lidoPor = Array.isArray(chat.lidoPor) ? chat.lidoPor : [];
        const arquivadoPor = Array.isArray(chat.arquivadoPor) ? chat.arquivadoPor : [];
        return !arquivadoPor.includes(uid) &&
          chat.ultimaMensagemAutorUid &&
          chat.ultimaMensagemAutorUid !== uid &&
          !lidoPor.includes(uid);
      }).length;
      atualizarBadgeMensagens();
    },
    (err) => console.warn("Não foi possível acompanhar mensagens não lidas:", err.message)
  );
}

function iniciarPainelMensagens() {
  garantirPainelMsg();
  if (painelMensagensIniciado) return;
  painelMensagensIniciado = true;
  document.getElementById("emailIcon")?.addEventListener("click", (e) => {
    e.stopPropagation();
    fecharPainelSino();
    const p = document.getElementById("painel-msg");
    const aberto = p.style.display === "flex";
    p.style.display = aberto ? "none" : "flex";
    if (!aberto && usuarioAtual) carregarListaChats(usuarioAtual.uid);
  });
}

function garantirPainelMsg() {
  let p = document.getElementById("painel-msg");
  if (p) return p;
  p = document.createElement("div");
  p.id = "painel-msg";
  p.style.cssText = `
    position:fixed;top:80px;right:20px;width:360px;max-height:85vh;
    background:#0F1A2C;border:1px solid #1e3a1e;border-radius:14px;
    z-index:9998;box-shadow:0 8px 32px rgba(0,0,0,0.6);
    display:none;flex-direction:column;overflow:hidden;
  `;
  p.innerHTML = `
    <!-- Header do painel -->
    <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;
                border-bottom:1px solid #1e3a1e;flex-shrink:0">
      <button id="msg-btn-voltar" style="display:none;background:none;border:none;
        color:#12E06C;font-size:1.2rem;cursor:pointer;padding:0 4px">←</button>
      <span id="msg-titulo" style="color:#fff;font-weight:700;font-size:0.95rem">💬 Mensagens</span>
      <button id="msg-btn-fechar" style="margin-left:auto;background:none;border:none;
        color:#A0AAB5;font-size:1.1rem;cursor:pointer">✕</button>
    </div>
    <!-- Lista de chats -->
    <div id="msg-lista" style="overflow-y:auto;flex:1;padding:12px"></div>
    <!-- Área do chat ativo -->
    <div id="msg-chat" style="display:none;flex-direction:column;flex:1;overflow:hidden">
      <div id="msg-mensagens" style="flex:1;overflow-y:auto;padding:12px;display:flex;
        flex-direction:column;gap:8px"></div>
      <form id="msg-form" style="display:flex;gap:8px;padding:10px 12px;
        border-top:1px solid #1e3a1e;flex-shrink:0">
        <input id="msg-input" type="text" placeholder="Digite sua mensagem..."
          autocomplete="off" maxlength="500"
          style="flex:1;background:#1a2a1a;border:1px solid #1e3a1e;border-radius:20px;
                 padding:10px 16px;color:#fff;font-family:'Montserrat',sans-serif;
                 font-size:0.85rem;outline:none"/>
        <button type="submit"
          style="background:#12E06C;color:#050B14;border:none;border-radius:50%;
                 width:40px;height:40px;font-size:1rem;cursor:pointer;flex-shrink:0">➤</button>
      </form>
    </div>
  `;
  document.body.appendChild(p);

  document.getElementById("msg-btn-fechar").addEventListener("click", fecharPainelMsg);
  document.getElementById("msg-btn-voltar").addEventListener("click", voltarListaChats);
  document.getElementById("msg-form").addEventListener("submit", enviarMensagem);
  document.addEventListener("click", (e) => {
    if (!p.contains(e.target) && e.target.id !== "emailIcon" && !e.target.closest("#emailIcon"))
      p.style.display = "none";
  });
  return p;
}

function fecharPainelMsg() {
  const p = document.getElementById("painel-msg");
  if (p) p.style.display = "none";
}
function fecharPainelSino() {
  const p = document.getElementById("painel-sino");
  if (p) p.style.display = "none";
}

async function carregarListaChats(uid) {
  voltarListaChats();
  const lista = document.getElementById("msg-lista");
  if (!lista) return;
  lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center">Carregando...</p>`;

  try {
    const snap = await getDocs(
      query(collection(db,"chats"), where("participantes","array-contains",uid))
    );
    const chatsVisiveis = snap.docs
      .filter((chatDoc) => !(chatDoc.data().arquivadoPor || []).includes(uid))
      .sort((a, b) => {
        const chatA = a.data();
        const chatB = b.data();
        return (chatB.ultimaMensagemEm?.toMillis?.() || chatB.criadoEm?.toMillis?.() || 0) -
          (chatA.ultimaMensagemEm?.toMillis?.() || chatA.criadoEm?.toMillis?.() || 0);
      });
    if (!chatsVisiveis.length) {
      lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center;margin-top:20px">
        Nenhuma conversa ativa.<br>Aceite um convite ou candidate-se para começar.</p>`;
      return;
    }
    lista.innerHTML = "";
    chatsVisiveis.forEach(d => {
      const chat = d.data();
      const lidoPor = Array.isArray(chat.lidoPor) ? chat.lidoPor : [];
      const naoLido = chat.ultimaMensagemAutorUid && chat.ultimaMensagemAutorUid !== uid && !lidoPor.includes(uid);
      const previa = chat.ultimaMensagemTexto || "Toque para abrir a conversa";
      const hora = chat.ultimaMensagemEm?.toDate?.().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) || "";
      const item = document.createElement("div");
      item.className = `chat-lista-item${naoLido ? " nao-lido" : ""}`;
      item.style.cssText = `display:flex;align-items:center;gap:12px;padding:12px;
        border-radius:10px;cursor:pointer;transition:border-color 0.15s;margin-bottom:6px;
        background:#1a2a1a;border:1px solid #1e3a1e;position:relative`;
      item.innerHTML = `
        <div style="width:40px;height:40px;background:#12E06C22;border-radius:50%;
          display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">⚽</div>
        <div style="flex:1;min-width:0">
          <p style="margin:0;font-weight:700;color:#fff;font-size:0.9rem;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(chat.clube || "Clube")}</p>
          <p style="margin:3px 0 0;color:${naoLido ? "#fff" : "#A0AAB5"};font-size:0.75rem;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:${naoLido ? "700" : "400"}">${escHtml(previa)}</p>
        </div>
        ${hora ? `<small style="color:#718075;font-size:0.65rem">${hora}</small>` : ""}
        ${naoLido ? `<span class="chat-nao-lido-dot" title="Mensagem nova"></span>` : ""}
        <span class="chat-seta" style="color:#12E06C;font-size:1.1rem;margin-right:4px">›</span>
        <button class="btn-excluir-chat" data-chat-id="${d.id}"
          title="Arquivar conversa"
          style="background:transparent;border:none;color:#555;font-size:1rem;
                 cursor:pointer;padding:4px;border-radius:6px;flex-shrink:0;
                 transition:color 0.2s,background 0.2s"
          onmouseover="this.style.color='#d32f2f';this.style.background='rgba(211,47,47,0.1)'"
          onmouseout="this.style.color='#555';this.style.background='transparent'">✓</button>`;

      item.addEventListener("mouseenter", () => item.style.borderColor = "#12E06C");
      item.addEventListener("mouseleave", () => item.style.borderColor = "#1e3a1e");

      // Clique na área principal abre o chat
      item.addEventListener("click", (e) => {
        if (e.target.closest(".btn-excluir-chat")) return;
        abrirChat(d.id, chat.clube);
      });

      // Arquiva apenas para o usuário atual; a conversa continua para o outro participante.
      item.querySelector(".btn-excluir-chat").addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await confirmModal({
          titulo: "Arquivar conversa",
          mensagem: `Arquivar a conversa com "${chat.clube || "Clube"}"? Ela voltará se uma nova mensagem chegar.`,
          textoConfirmar: "Arquivar",
        });
        if (!ok) return;
        try {
          await updateDoc(doc(db, "chats", d.id), { arquivadoPor: arrayUnion(uid) });
          item.remove();
          if (!lista.querySelector(".chat-lista-item"))
            lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center;margin-top:20px">
              Nenhuma conversa ainda.</p>`;
          toast("Conversa arquivada.");
        } catch (err) { toast("Erro ao arquivar: " + err.message, "erro"); }
      });

      lista.appendChild(item);
    });
  } catch (err) {
    lista.innerHTML = `<p style="color:#d32f2f;font-size:0.85rem;text-align:center">Erro ao carregar.</p>`;
    console.error(err);
  }
}

function voltarListaChats() {
  if (unsubChat) { unsubChat(); unsubChat = null; }
  chatAbertoId = null;
  const lista = document.getElementById("msg-lista");
  const chat = document.getElementById("msg-chat");
  const voltar = document.getElementById("msg-btn-voltar");
  const titulo = document.getElementById("msg-titulo");
  const mensagens = document.getElementById("msg-mensagens");
  const input = document.getElementById("msg-input");
  if (lista) lista.style.display = "block";
  if (chat) chat.style.display = "none";
  if (voltar) voltar.style.display = "none";
  if (titulo) titulo.textContent = "💬 Mensagens";
  if (mensagens) mensagens.replaceChildren();
  if (input) input.value = "";
}

async function abrirChat(chatId, clubeNome) {
  const usuario = usuarioAtual;
  if (!usuario || !chatId) return;
  garantirPainelMsg();

  let meuNome = usuario.displayName || "Jogador";
  const chatRef = doc(db, "chats", chatId);
  try {
    const chatSnap = await getDoc(chatRef);
    const participantes = chatSnap.exists() && Array.isArray(chatSnap.data().participantes)
      ? chatSnap.data().participantes
      : [];
    if (!chatSnap.exists() || !participantes.includes(usuario.uid)) {
      toast("Sem acesso a este chat.", "erro"); return;
    }
    const nome = clubeNome || chatSnap.data().clube || "Chat";
    document.getElementById("msg-titulo").textContent = `⚽ ${nome}`;
    const perfilSnap = await getDoc(doc(db,"jogadores",usuario.uid));
    meuNome = perfilSnap.exists()
      ? (perfilSnap.data().nickname || meuNome)
      : meuNome;
    try {
      await updateDoc(chatRef, {
        lidoPor: arrayUnion(usuario.uid),
        arquivadoPor: arrayRemove(usuario.uid),
      });
    } catch (leituraErr) {
      console.warn("Chat aberto, mas não foi possível atualizar o estado de leitura:", leituraErr);
    }
  } catch (err) { toast("Erro ao abrir chat.", "erro"); return; }

  if (unsubChat) { unsubChat(); unsubChat = null; }
  chatAbertoId = chatId;

  // Mostra área de chat, esconde lista
  document.getElementById("msg-lista").style.display = "none";
  document.getElementById("msg-chat").style.display  = "flex";
  document.getElementById("msg-btn-voltar").style.display = "block";

  // Garante que o painel esteja aberto
  document.getElementById("painel-msg").style.display = "flex";

  // Escuta mensagens em tempo real
  const msgRef = collection(db,"chats",chatId,"mensagens");

  unsubChat = onSnapshot(
    query(msgRef, orderBy("enviadoEm","asc")),
    (snap) => {
      const container = document.getElementById("msg-mensagens");
      if (!container) return;
      container.innerHTML = "";
      if (snap.empty) {
        container.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center;margin:auto">
          Nenhuma mensagem ainda. Diga olá! 👋</p>`;
        return;
      }
      snap.forEach(d => {
        const msg   = d.data();
        const minha = msg.autorUid === usuario.uid;
        const hora  = msg.enviadoEm?.toDate
          ? msg.enviadoEm.toDate().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})
          : "";
        const bolha = document.createElement("div");
        bolha.style.cssText = `
          max-width:80%;padding:9px 14px;border-radius:16px;font-size:0.85rem;
          line-height:1.4;word-break:break-word;
          align-self:${minha?"flex-end":"flex-start"};
          background:${minha?"#12E06C":"#1a2a1a"};
          color:${minha?"#050B14":"#E6EDF3"};
          border-bottom-${minha?"right":"left"}-radius:4px;
        `;
        bolha.innerHTML = `
          ${!minha?`<div style="font-size:0.7rem;font-weight:700;opacity:0.7;margin-bottom:3px">${escHtml(msg.autorNome || "Jogador")}</div>`:""}
          <div>${escHtml(msg.texto)}</div>
          <div style="font-size:0.68rem;opacity:0.5;text-align:right;margin-top:3px">${hora}</div>`;
        container.appendChild(bolha);
      });
      container.scrollTop = container.scrollHeight;
      if (chatAbertoId === chatId) {
        updateDoc(chatRef, { lidoPor: arrayUnion(usuario.uid) })
          .catch((err) => console.warn("Não foi possível marcar a conversa como lida:", err));
      }
    },
    (err) => {
      console.error("Erro ao acompanhar mensagens:", err);
      toast("Não foi possível atualizar as mensagens.", "erro");
    }
  );

  // Guarda nome para o envio
  document.getElementById("msg-input").dataset.nome = meuNome;
}

async function enviarMensagem(e) {
  e.preventDefault();
  const usuario = usuarioAtual;
  if (!chatAbertoId || !usuario) return;
  const input = document.getElementById("msg-input");
  const texto = input.value.trim();
  if (!texto) return;
  input.value = "";
  const meuNome = input.dataset.nome || usuario.displayName || "Jogador";
  try {
    await addDoc(collection(db,"chats",chatAbertoId,"mensagens"), {
      texto, autorUid: usuario.uid, autorNome: meuNome, enviadoEm: serverTimestamp(),
    });
    try {
      await updateDoc(doc(db, "chats", chatAbertoId), {
        ultimaMensagemTexto: texto,
        ultimaMensagemAutorUid: usuario.uid,
        ultimaMensagemEm: serverTimestamp(),
        lidoPor: [usuario.uid],
        arquivadoPor: [],
      });
    } catch (metadataErr) {
      console.warn("Mensagem enviada, mas o resumo da conversa não foi atualizado:", metadataErr);
    }
  } catch (err) {
    console.error("Erro ao enviar:", err);
    input.value = texto;
    toast("Não foi possível enviar a mensagem.", "erro");
  }
}

function escHtml(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function imagemSegura(src) {
  const valor = String(src || "").trim();
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(valor)) return valor;
  if (/^https:\/\//i.test(valor)) return valor;
  return "";
}

// =========================================================================
// TOAST
// =========================================================================
function toast(msg, tipo="sucesso") {
  document.getElementById("toast-mercado")?.remove();
  const el = Object.assign(document.createElement("div"),{id:"toast-mercado",textContent:msg});
  Object.assign(el.style,{
    position:"fixed",bottom:"24px",right:"24px",
    background:tipo==="sucesso"?"#12E06C":"#d32f2f",
    color:tipo==="sucesso"?"#050B14":"#fff",
    fontWeight:"bold",padding:"14px 22px",borderRadius:"8px",
    fontFamily:"'Montserrat',sans-serif",fontSize:"0.9rem",
    boxShadow:"0 4px 16px rgba(0,0,0,0.4)",zIndex:"9999",opacity:"0",transition:"opacity 0.3s",
  });
  document.body.appendChild(el);
  requestAnimationFrame(()=>(el.style.opacity="1"));
  setTimeout(()=>{el.style.opacity="0";setTimeout(()=>el.remove(),300);},3500);
}

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
  query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const EXPIRACAO_MS = 30 * 24 * 60 * 60 * 1000; // vagas: 30 dias

let usuarioAtual = null;
let perfilAtual  = {};
let chatAbertoId   = null; // chat atualmente aberto no painel
let unsubChat      = null; // listener de mensagens ativo
let fotosClubeBase64 = []; // até 3 imagens selecionadas no formulário de vaga (opcional)
let vagaEditandoId  = null; // id da vaga em edição (null = criando nova)
const MAX_FOTOS_VAGA = 3;

// ─── Comprime imagem no navegador antes de salvar (reduz tamanho no Firestore) ─
function comprimirImagem(arquivo, maxLargura = 900, qualidade = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const escala = Math.min(1, maxLargura / img.width);
        const canvas = document.createElement("canvas");
        canvas.width  = img.width  * escala;
        canvas.height = img.height * escala;
        const ctx = canvas.getContext("2d");
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
      if (arquivo.size > 2 * 1024 * 1024) {
        toast(`⚠️ "${arquivo.name}" é muito grande. Use até 2MB.`, "erro");
        continue;
      }
      try {
        const comprimida = await comprimirImagem(arquivo);
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

// ─── Auth ─────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  usuarioAtual = user;
  if (user) {
    const snap = await getDoc(doc(db, "jogadores", user.uid));
    perfilAtual = snap.exists() ? snap.data() : {};
    escutarNotificacoes(user.uid);
    iniciarPainelMensagens();
  }
  await carregarVagas();
  destacarVagaCompartilhada();
});

// =========================================================================
// 1. PUBLICAR VAGA
// =========================================================================
document.getElementById("form-lfg")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!usuarioAtual) { toast("Você precisa estar logado.", "erro"); return; }

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
        collection(db, "vagas"), where("capitaoUid", "==", usuarioAtual.uid)
      ));
      if (!existentes.empty) {
        toast("⚠️ Você já tem uma vaga ativa. Edite-a ou exclua antes de criar outra.", "erro");
        return;
      }
      const docRef = await addDoc(collection(db, "vagas"), {
        clube, plataforma, posicao, estilo, jogo, descricao, overallMinimo,
        fotosClube:  fotosClubeBase64,
        capitaoUid:  usuarioAtual.uid,
        capitaoNome: perfilAtual.nickname || usuarioAtual.displayName || "Capitão",
        criadoEm:    serverTimestamp(),
      });
      await setDoc(doc(db, "jogadores", usuarioAtual.uid),
        { clubeId: docRef.id, ehCapitao: true, clube }, { merge: true });
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
  document.getElementById("post-plataforma").value   = v.plataforma || "";
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
  const feed = document.getElementById("lfg-feed");
  const btnMais = document.getElementById("btn-carregar-mais");
  if (!feed) return;
  feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">Carregando vagas...</p>`;
  quantidadeExibida = TAMANHO_PAGINA;

  const filtPlat  = document.getElementById("filtro-plataforma")?.value || "todas";
  const filtPos   = document.getElementById("filtro-posicao")?.value    || "todas";
  const filtJogo  = document.getElementById("filtro-jogo")?.value       || "todas";
  const ordenar   = document.getElementById("ordenar-vagas")?.value     || "recentes";
  const busca     = (document.getElementById("busca-texto")?.value || "").trim().toLowerCase();
  const soMeuNivel = document.getElementById("filtro-meu-nivel")?.checked || false;

  try {
    const snap  = await getDocs(query(collection(db, "vagas"), orderBy("criadoEm", "desc")));
    const agora = Date.now();
    const validas = [];

    snap.docs.forEach(d => {
      const dados    = { id: d.id, ...d.data() };
      const criadoMs = dados.criadoEm?.toMillis?.() || 0;
      if (agora - criadoMs >= EXPIRACAO_MS) deleteDoc(d.ref);
      else validas.push(dados);
    });

    // Estado vazio: nenhuma vaga publicada ainda na plataforma (não é sobre os filtros)
    if (!validas.length) {
      feed.innerHTML = `
        <div style="text-align:center;padding:30px 16px;color:#A0AAB5">
          <p style="font-size:1rem;margin-bottom:10px">
            ⚽ Ainda não há vagas publicadas por aqui.
          </p>
          <p style="font-size:0.85rem;margin-bottom:16px">
            Seja o primeiro clube a anunciar e apareça pra todo mundo que está procurando time!
          </p>
        </div>`;
      btnMais?.classList.add("hidden");
      return;
    }

    let filtradas = validas;
    if (filtPlat !== "todas") filtradas = filtradas.filter(v => v.plataforma === filtPlat);
    if (filtPos  !== "todas") filtradas = filtradas.filter(v => v.posicao    === filtPos);
    if (filtJogo !== "todas") filtradas = filtradas.filter(v => v.jogo       === filtJogo);
    if (busca) {
      filtradas = filtradas.filter(v =>
        (v.clube || "").toLowerCase().includes(busca) ||
        (v.descricao || "").toLowerCase().includes(busca)
      );
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

    // Estado vazio: existem vagas, mas nenhuma bate com o filtro/busca atual
    if (!filtradas.length) {
      feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">
        Nenhuma vaga encontrada com esses filtros. Tente ajustar a busca.</p>`;
      btnMais?.classList.add("hidden");
      return;
    }

    renderPaginaAtual();

  } catch (err) {
    feed.innerHTML = `<p style="color:#d32f2f;text-align:center">Erro ao carregar vagas.</p>`;
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
      candidatar(btn.dataset.vagaId, btn.dataset.capitaoUid, btn.dataset.clube))
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
  // Compatível com vagas antigas (campo fotoClube único) e novas (fotosClube array)
  const fotos = Array.isArray(v.fotosClube) && v.fotosClube.length
    ? v.fotosClube
    : (v.fotoClube ? [v.fotoClube] : []);
  const [fotoPrincipal, ...fotosExtras] = fotos;

  return `
    <div class="lfg-card" id="card-${v.id}">
      <div class="card-topo">
        <span class="badge ${badgeClass[v.plataforma]||''}">${v.plataforma.toUpperCase()}</span>
        <span class="badge badge-posicao">${v.posicao.toUpperCase()}</span>
        <span class="badge" style="background:#1a2a1a;color:#12E06C;border:1px solid #12E06C">${v.jogo.toUpperCase()}</span>
        ${v.overallMinimo ? `<span class="badge-nivel-min">OVR mín: ${v.overallMinimo}</span>` : ""}
        <span style="margin-left:auto;font-size:0.75rem;font-weight:700;
          color:#A0AAB5;background:#1a1a1a;border:1px solid #333;
          border-radius:20px;padding:3px 10px;white-space:nowrap">${textoTempoPublicado(v.criadoEm)}</span>
      </div>
      <div class="card-corpo">
        <h3 class="gamertag">⚽ ${v.clube}<span id="selo-${v.id}"></span></h3>
        <p class="descricao">${v.descricao}</p>
        ${fotoPrincipal ? `
          <div class="card-imagem">
            <img src="${fotoPrincipal}" alt="Imagem do anúncio do clube ${v.clube}" />
          </div>` : ""}
        ${fotosExtras.length ? `
          <div class="card-galeria">
            ${fotosExtras.map((src, i) => `<img src="${src}" alt="Imagem extra ${i + 2} do anúncio de ${v.clube}" />`).join("")}
          </div>` : ""}
        <p style="font-size:0.8rem;color:#666">Capitão: ${v.capitaoNome} · ${v.estilo}</p>
        ${ehDono ? `<p id="contador-${v.id}" style="font-size:0.8rem;color:#12E06C;font-weight:bold"></p>` : ""}
      </div>
      <div class="card-rodape">
        <span class="estilo-jogo">${v.estilo}</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn-acao-card btn-compartilhar-vaga" data-vaga-id="${v.id}">🔗 Compartilhar</button>
          ${ehDono ? `
            <button class="btn-acao-card btn-editar-vaga" data-vaga-id="${v.id}">✏️ Editar</button>
            <button class="btn-acao-card btn-renovar-vaga" data-vaga-id="${v.id}">🔄 Renovar</button>
            <button class="btn-excluir-vaga" data-vaga-id="${v.id}"
              style="padding:6px 12px;background:transparent;color:#d32f2f;
                border:1px solid #d32f2f;border-radius:8px;font-weight:bold;cursor:pointer;font-size:0.75rem"
              onmouseover="this.style.background='#d32f2f';this.style.color='#fff'"
              onmouseout="this.style.background='transparent';this.style.color='#d32f2f'">
              🗑 Excluir
            </button>
            <span style="color:#12E06C;font-size:0.85rem;font-weight:bold">✓ Sua vaga</span>
          ` : `
            <button class="btn-acao-card btn-denunciar-vaga" data-vaga-id="${v.id}"
              data-clube="${v.clube}" data-capitao-uid="${v.capitaoUid}">🚩 Denunciar</button>
            <button class="btn-chamar btn-candidatar"
              data-vaga-id="${v.id}" data-capitao-uid="${v.capitaoUid}" data-clube="${v.clube}">
              Me candidatar
            </button>
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
  if (!confirm("Tem certeza que quer excluir essa vaga?")) return;
  try {
    await deleteDoc(doc(db, "vagas", vagaId));
    if (vagaEditandoId === vagaId) cancelarEdicaoVaga();
    toast("🗑 Vaga excluída.");
    await carregarVagas();
  } catch (err) { toast("Erro ao excluir: " + err.message, "erro"); }
}

// ─── Renovar vaga: reseta o prazo de 30 dias sem precisar recriar tudo ────────
async function renovarVaga(vagaId) {
  if (!confirm("Renovar essa vaga por mais 30 dias?")) return;
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
    await navigator.clipboard.writeText(link);
    toast("🔗 Link copiado! Cole no grupo do seu time.");
  } catch {
    prompt("Copie o link da vaga:", link);
  }
}

// ─── Denunciar vaga ────────────────────────────────────────────────────────────
async function denunciarVaga(vagaId, clube, capitaoUid) {
  if (!usuarioAtual) { toast("Faça login para denunciar.", "erro"); return; }
  if (!confirm(`Denunciar a vaga do clube "${clube}"? Nossa equipe vai revisar.`)) return;
  try {
    await addDoc(collection(db, "denuncias"), {
      vagaId, clube, capitaoUid,
      denuncianteUid: usuarioAtual.uid,
      criadoEm: serverTimestamp(),
    });
    toast("🚩 Denúncia enviada. Obrigado por ajudar a manter o mercado seguro!");
  } catch (err) { toast("Erro ao denunciar: " + err.message, "erro"); }
}

// ─── Contador de candidaturas (visível só pro capitão dono da vaga) ────────────
async function atualizarContadorCandidaturas(vagaId) {
  const el = document.getElementById(`contador-${vagaId}`);
  if (!el) return;
  try {
    const snap = await getDocs(query(collection(db, "candidaturas"), where("vagaId", "==", vagaId)));
    el.textContent = snap.size > 0
      ? `👥 ${snap.size} candidatura(s) recebida(s)`
      : "";
  } catch { /* silencioso: não é crítico exibir isso */ }
}

// ─── Selo de clube verificado (5+ contratações aceitas) ────────────────────────
const CONTRATACOES_PARA_SELO = 5;
const cacheVerificado = new Map();
async function aplicarSeloVerificado(vagaId, capitaoUid) {
  const el = document.getElementById(`selo-${vagaId}`);
  if (!el) return;
  try {
    if (!cacheVerificado.has(capitaoUid)) {
      const snap = await getDocs(query(
        collection(db, "candidaturas"),
        where("capitaoUid", "==", capitaoUid),
        where("status", "==", "aceito")
      ));
      cacheVerificado.set(capitaoUid, snap.size >= CONTRATACOES_PARA_SELO);
    }
    if (cacheVerificado.get(capitaoUid)) {
      el.innerHTML = `<span class="badge-verificado" title="${CONTRATACOES_PARA_SELO}+ contratações fechadas pela plataforma">✅ Verificado</span>`;
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

["filtro-plataforma","filtro-posicao","filtro-jogo","ordenar-vagas","filtro-meu-nivel"].forEach(id =>
  document.getElementById(id)?.addEventListener("change", carregarVagas)
);

// Busca por texto: espera o usuário parar de digitar (debounce) antes de filtrar
let buscaTimeout = null;
document.getElementById("busca-texto")?.addEventListener("input", () => {
  clearTimeout(buscaTimeout);
  buscaTimeout = setTimeout(carregarVagas, 350);
});

// =========================================================================
// 3. CANDIDATAR-SE
// =========================================================================
async function candidatar(vagaId, capitaoUid, clube) {
  if (!usuarioAtual) { toast("Faça login para se candidatar.", "erro"); return; }
  if (usuarioAtual.uid === capitaoUid) { toast("Você é o capitão desse clube!", "erro"); return; }
  try {
    const existSnap = await getDocs(query(
      collection(db, "candidaturas"),
      where("jogadorUid","==",usuarioAtual.uid),
      where("vagaId","==",vagaId)
    ));
    if (!existSnap.empty) { toast("Você já se candidatou a esse clube.", "erro"); return; }
    await addDoc(collection(db, "candidaturas"), {
      vagaId, clube,
      jogadorUid:  usuarioAtual.uid,
      jogadorNome: perfilAtual.nickname || usuarioAtual.displayName || "Jogador",
      jogadorFoto: perfilAtual.fotoURL  || "",
      posicao:     perfilAtual.posicao  || "—",
      overall:     perfilAtual.overall  || "—",
      capitaoUid, status: "pendente", criadoEm: serverTimestamp(),
    });
    toast("✅ Candidatura enviada! Aguarde o capitão.");
  } catch (err) { toast("Erro ao candidatar: " + err.message, "erro"); }
}

// =========================================================================
// 4. NOTIFICAÇÕES (sino 🔔)
// =========================================================================
function escutarNotificacoes(uid) {
  // Capitão: candidaturas pendentes
  onSnapshot(
    query(collection(db,"candidaturas"), where("capitaoUid","==",uid), where("status","==","pendente")),
    (snap) => {
      atualizarBadgeSino(snap.size);
      snap.docChanges().forEach(c => { if (c.type==="added") cardNotifCapitao(c.doc); });
    }
  );
  // Jogador: aceites não vistos
  onSnapshot(
    query(collection(db,"candidaturas"),
      where("jogadorUid","==",uid), where("status","==","aceito"), where("jogadorViu","==",false)),
    (snap) => {
      if (snap.size > 0) {
        const b = document.getElementById("badge");
        if (b) { b.textContent = (parseInt(b.textContent)||0) + snap.size; b.classList.remove("hidden"); }
      }
      snap.docChanges().forEach(c => { if (c.type==="added") cardNotifJogador(c.doc); });
    },
    (err) => console.warn("Índice pendente:", err.message)
  );
}

function atualizarBadgeSino(count) {
  const b = document.getElementById("badge");
  if (!b) return;
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
    background:#0F1A2C;border:1px solid #1e3a1e;border-radius:14px;padding:16px;
    z-index:9998;box-shadow:0 8px 32px rgba(0,0,0,0.6);display:none;flex-direction:column;gap:8px;
  `;
  p.innerHTML = `
    <h3 style="color:#12E06C;margin:0 0 8px 0;font-size:0.9rem">🔔 Notificações</h3>
    <div id="sino-lista"><p style="color:#A0AAB5;font-size:0.85rem;text-align:center">Sem notificações.</p></div>
  `;
  document.body.appendChild(p);

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

function cardNotifCapitao(docSnap) {
  const d = docSnap.data();
  garantirPainelSino();
  const lista = document.getElementById("sino-lista");
  if (!lista || document.getElementById(`notif-${docSnap.id}`)) return;
  // Remove placeholder
  lista.querySelector("p")?.remove();

  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `background:#1a2a1a;border:1px solid #1e3a1e;border-radius:10px;
    padding:12px;font-size:0.85rem;color:#E6EDF3;margin-bottom:8px`;
  card.innerHTML = `
    <p style="margin:0 0 4px 0">
      <strong style="color:#12E06C">${d.jogadorNome}</strong> quer entrar no <strong>${d.clube}</strong>
    </p>
    <p style="margin:0 0 10px 0;color:#A0AAB5;font-size:0.8rem">Posição: ${d.posicao} · Overall: ${d.overall}</p>
    <div style="display:flex;gap:8px">
      <button data-id="${docSnap.id}" data-jogador="${d.jogadorUid}" data-clube="${d.clube}" class="btn-aceitar"
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
  lista.querySelector("p")?.remove();

  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `background:#0a1f0a;border:1px solid #12E06C;border-radius:10px;
    padding:12px;font-size:0.85rem;color:#E6EDF3;margin-bottom:8px`;
  card.innerHTML = `
    <p style="margin:0 0 8px 0">
      🎉 Você foi <strong style="color:#12E06C">aceito</strong> no clube <strong>${d.clube}</strong>!
    </p>
    <button data-chat="${d.chatId}" class="btn-abrir-chat-notif"
      style="width:100%;padding:8px;background:#12E06C;color:#050B14;border:none;
             border-radius:8px;font-weight:bold;cursor:pointer">
      💬 Abrir chat do clube
    </button>`;
  card.querySelector(".btn-abrir-chat-notif").addEventListener("click", (e) => {
    abrirChat(e.currentTarget.dataset.chat);
    document.getElementById("painel-sino").style.display = "none";
  });
  updateDoc(docSnap.ref, { jogadorViu: true });
  // Aqui quem está logado é o próprio jogador (auth.uid === usuarioAtual.uid),
  // então essa escrita é permitida pelas regras do Firestore.
  setDoc(doc(db, "jogadores", usuarioAtual.uid), { clubeId: d.chatId, clube: d.clube }, { merge: true })
    .catch(err => console.error("Erro ao atualizar perfil do jogador:", err));
  lista.prepend(card);
}

// =========================================================================
// 5. ACEITAR / RECUSAR CANDIDATURA
// =========================================================================
async function aceitarCandidatura(candidaturaId, jogadorUid, clube, card) {
  card.style.opacity = "0.6";
  card.querySelectorAll("button").forEach(b => b.disabled = true);
  try {
    const chatRef = await addDoc(collection(db, "chats"), {
      clube, participantes: [usuarioAtual.uid, jogadorUid], criadoEm: serverTimestamp(),
    });
    await updateDoc(doc(db,"candidaturas",candidaturaId), {
      status:"aceito", chatId:chatRef.id, jogadorViu:false,
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
    carregarListaChats(usuarioAtual.uid);
  } catch (err) {
    card.style.opacity = "1";
    card.querySelectorAll("button").forEach(b => b.disabled = false);
    toast("Erro ao aceitar: " + err.message, "erro");
  }
}

async function recusarCandidatura(candidaturaId, card) {
  try {
    await updateDoc(doc(db,"candidaturas",candidaturaId), { status:"recusado" });
    card.style.opacity = "0.4";
    card.innerHTML = `<p style="color:#666;margin:0;text-align:center">Candidatura recusada.</p>`;
  } catch (err) { toast("Erro ao recusar: " + err.message, "erro"); }
}

// =========================================================================
// 6. PAINEL DE MENSAGENS (ícone ✉️)
// =========================================================================
function iniciarPainelMensagens() {
  garantirPainelMsg();
  document.getElementById("emailIcon")?.addEventListener("click", (e) => {
    e.stopPropagation();
    fecharPainelSino();
    const p = document.getElementById("painel-msg");
    const aberto = p.style.display === "flex";
    p.style.display = aberto ? "none" : "flex";
    if (!aberto) carregarListaChats(usuarioAtual.uid);
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
    if (snap.empty) {
      lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center;margin-top:20px">
        Nenhuma conversa ainda.<br>Candidate-se a um clube para começar!</p>`;
      return;
    }
    lista.innerHTML = "";
    snap.docs.forEach(d => {
      const chat = d.data();
      const item = document.createElement("div");
      item.style.cssText = `display:flex;align-items:center;gap:12px;padding:12px;
        border-radius:10px;cursor:pointer;transition:border-color 0.15s;margin-bottom:6px;
        background:#1a2a1a;border:1px solid #1e3a1e;position:relative`;
      item.innerHTML = `
        <div style="width:40px;height:40px;background:#12E06C22;border-radius:50%;
          display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">⚽</div>
        <div style="flex:1;min-width:0">
          <p style="margin:0;font-weight:700;color:#fff;font-size:0.9rem;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${chat.clube || "Clube"}</p>
          <p style="margin:0;color:#A0AAB5;font-size:0.75rem">Toque para abrir</p>
        </div>
        <span class="chat-seta" style="color:#12E06C;font-size:1.1rem;margin-right:4px">›</span>
        <button class="btn-excluir-chat" data-chat-id="${d.id}"
          title="Excluir conversa"
          style="background:transparent;border:none;color:#555;font-size:1rem;
                 cursor:pointer;padding:4px;border-radius:6px;flex-shrink:0;
                 transition:color 0.2s,background 0.2s"
          onmouseover="this.style.color='#d32f2f';this.style.background='rgba(211,47,47,0.1)'"
          onmouseout="this.style.color='#555';this.style.background='transparent'">🗑</button>`;

      item.addEventListener("mouseenter", () => item.style.borderColor = "#12E06C");
      item.addEventListener("mouseleave", () => item.style.borderColor = "#1e3a1e");

      // Clique na área principal abre o chat
      item.addEventListener("click", (e) => {
        if (e.target.closest(".btn-excluir-chat")) return;
        abrirChat(d.id, chat.clube);
      });

      // Botão excluir
      item.querySelector(".btn-excluir-chat").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Excluir a conversa "${chat.clube || "Clube"}"? Isso não pode ser desfeito.`)) return;
        try {
          await deleteDoc(doc(db, "chats", d.id));
          item.remove();
          if (!lista.querySelector("div"))
            lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center;margin-top:20px">
              Nenhuma conversa ainda.</p>`;
          toastMercado("🗑 Conversa excluída.");
        } catch (err) { toastMercado("Erro ao excluir: " + err.message, "erro"); }
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
  document.getElementById("msg-lista").style.display = "block";
  document.getElementById("msg-chat").style.display  = "none";
  document.getElementById("msg-btn-voltar").style.display = "none";
  document.getElementById("msg-titulo").textContent = "💬 Mensagens";
  document.getElementById("msg-mensagens").innerHTML = "";
  document.getElementById("msg-input").value = "";
}

async function abrirChat(chatId, clubeNome) {
  if (!usuarioAtual) return;
  chatAbertoId = chatId;

  // Verifica acesso
  try {
    const chatSnap = await getDoc(doc(db,"chats",chatId));
    if (!chatSnap.exists() || !chatSnap.data().participantes.includes(usuarioAtual.uid)) {
      toast("Sem acesso a este chat.", "erro"); return;
    }
    const nome = clubeNome || chatSnap.data().clube || "Chat";
    document.getElementById("msg-titulo").textContent = `⚽ ${nome}`;
  } catch (err) { toast("Erro ao abrir chat.", "erro"); return; }

  // Mostra área de chat, esconde lista
  document.getElementById("msg-lista").style.display = "none";
  document.getElementById("msg-chat").style.display  = "flex";
  document.getElementById("msg-btn-voltar").style.display = "block";

  // Garante que o painel esteja aberto
  document.getElementById("painel-msg").style.display = "flex";

  // Escuta mensagens em tempo real
  const msgRef = collection(db,"chats",chatId,"mensagens");
  const perfilSnap = await getDoc(doc(db,"jogadores",usuarioAtual.uid));
  const meuNome = perfilSnap.exists()
    ? (perfilSnap.data().nickname || usuarioAtual.displayName || "Jogador")
    : (usuarioAtual.displayName || "Jogador");

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
        const minha = msg.autorUid === usuarioAtual.uid;
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
          ${!minha?`<div style="font-size:0.7rem;font-weight:700;opacity:0.7;margin-bottom:3px">${msg.autorNome}</div>`:""}
          <div>${escHtml(msg.texto)}</div>
          <div style="font-size:0.68rem;opacity:0.5;text-align:right;margin-top:3px">${hora}</div>`;
        container.appendChild(bolha);
      });
      container.scrollTop = container.scrollHeight;
    }
  );

  // Guarda nome para o envio
  document.getElementById("msg-input").dataset.nome = meuNome;
}

async function enviarMensagem(e) {
  e.preventDefault();
  if (!chatAbertoId || !usuarioAtual) return;
  const input = document.getElementById("msg-input");
  const texto = input.value.trim();
  if (!texto) return;
  input.value = "";
  const meuNome = input.dataset.nome || usuarioAtual.displayName || "Jogador";
  try {
    await addDoc(collection(db,"chats",chatAbertoId,"mensagens"), {
      texto, autorUid: usuarioAtual.uid, autorNome: meuNome, enviadoEm: serverTimestamp(),
    });
  } catch (err) { console.error("Erro ao enviar:", err); }
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
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
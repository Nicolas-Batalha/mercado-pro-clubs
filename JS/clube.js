// =========================================================================
// MERCADO PRO CLUBS — clube.js
// Liga a lógica de dados (Firestore) ao layout de clubes.html / clube.css
// Elenco: NÃO é uma lista salva dentro do clube. Cada jogador guarda em
// jogadores/{uid}.clubeAtualId o capitaoUid do clube em que está — o elenco
// é sempre uma CONSULTA (where clubeAtualId == capitaoUid).
// =========================================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp,
  collection, query, where, getDocs, onSnapshot, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { confirmModal } from "./confirm-modal.js";

function toast(msg, tipo = "sucesso") {
  document.getElementById("toast-clube")?.remove();
  const el = Object.assign(document.createElement("div"), { id: "toast-clube", textContent: msg });
  Object.assign(el.style, {
    position: "fixed", bottom: "24px", right: "24px",
    background: tipo === "sucesso" ? "#22C55E" : "#d32f2f",
    color: tipo === "sucesso" ? "#0a0a0a" : "#fff",
    fontWeight: "bold", padding: "14px 22px", borderRadius: "8px",
    fontFamily: "inherit", fontSize: "0.9rem",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: "9999",
    opacity: "0", transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = "1"));
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3000);
}

function comprimirImagem(arquivo, maxLargura = 500, qualidade = 0.75) {
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

async function buscarElenco(capitaoUid) {
  const [snap, capitaoSnap] = await Promise.all([
    getDocs(query(collection(db, "jogadores"), where("clubeAtualId", "==", capitaoUid))),
    getDoc(doc(db, "jogadores", capitaoUid)),
  ]);
  const jogadores = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  if (capitaoSnap.exists() && !jogadores.some(j => j.uid === capitaoUid)) {
    jogadores.unshift({ uid: capitaoSnap.id, ...capitaoSnap.data() });
  }
  return jogadores;
}

// =========================================================================
// ELENCO — tabela real (sem dados fake), busca de jogadores livres e convites
// =========================================================================
let elencoAtual = [];
let clubeCarregado = {};

function linhaElenco(jogador, capitaoUid, podeEditar) {
  const ehCapitaoLinha = jogador.uid === capitaoUid;
  const avatar = imagemSegura(jogador.fotoURL, "../IMG/user-icon.svg");
  const posicao = (jogador.posicao || "—").toString();
  return `
    <tr data-uid="${escHtml(jogador.uid)}">
      <td class="col-jogador">
        <a href="./meu-perfil.html?uid=${encodeURIComponent(jogador.uid)}" class="col-jogador-link" title="Ver perfil">
          <img src="${escHtml(avatar)}" alt="" class="jogador-avatar">
          <div class="jogador-info">
            <span class="jogador-nome">${escHtml(jogador.nickname || "Jogador")}${ehCapitaoLinha ? ' <span class="tag-capitao">Capitão</span>' : ""}</span>
            ${jogador.eaId ? `<span class="jogador-idea">ID EA: ${escHtml(jogador.eaId)}</span>` : ""}
          </div>
        </a>
      </td>
      <td><span class="tag-posicao">${escHtml(posicao === "—" ? posicao : posicao.toUpperCase())}</span></td>
      <td class="col-ger">${escHtml(jogador.overall ?? "—")}</td>
      <td class="col-acoes">
        ${podeEditar && !ehCapitaoLinha
          ? `<button type="button" class="btn-remover-jogador" data-uid="${escHtml(jogador.uid)}" data-nome="${escHtml(jogador.nickname || "jogador")}">Remover</button>`
          : `<span class="acao-vazia">—</span>`}
      </td>
    </tr>`;
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function aplicarFiltrosElenco(capitaoUid, podeEditar) {
  const termo = (document.getElementById("elenco-busca")?.value || "").toLowerCase().trim();
  const posFiltro = document.getElementById("elenco-filtro-posicao")?.value || "todas";

  const filtrado = elencoAtual.filter(j => {
    const bateNome = !termo || (j.nickname || "").toLowerCase().includes(termo);
    const batePos = posFiltro === "todas" || (j.posicao || "").toLowerCase() === posFiltro;
    return bateNome && batePos;
  });

  const tbody = document.getElementById("elenco-tbody");
  const mostrando = document.getElementById("elenco-mostrando");
  if (!tbody) return;

  if (!elencoAtual.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="elenco-vazio">Esse elenco ainda não tem jogadores.${podeEditar ? ' Clique em "Convidar Jogador" pra começar.' : ""}</td></tr>`;
    if (mostrando) mostrando.textContent = "Mostrando 0 jogadores";
    return;
  }
  if (!filtrado.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="elenco-vazio">Nenhum jogador encontrado com esse filtro.</td></tr>`;
    if (mostrando) mostrando.textContent = `Mostrando 0 de ${elencoAtual.length} jogadores`;
    return;
  }

  tbody.innerHTML = filtrado.map(j => linhaElenco(j, capitaoUid, podeEditar)).join("");
  if (mostrando) {
    mostrando.textContent = filtrado.length === elencoAtual.length
      ? `Mostrando ${elencoAtual.length} jogador${elencoAtual.length === 1 ? "" : "es"}`
      : `Mostrando ${filtrado.length} de ${elencoAtual.length} jogadores`;
  }

  if (podeEditar) {
    tbody.querySelectorAll(".btn-remover-jogador").forEach(btn =>
      btn.addEventListener("click", () => removerJogador(btn.dataset.uid, btn.dataset.nome, capitaoUid, podeEditar))
    );
  }
}

async function renderizarElenco(capitaoUid, podeEditar) {
  const tbody = document.getElementById("elenco-tbody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="elenco-vazio">Carregando elenco...</td></tr>`;
  try {
    elencoAtual = await buscarElenco(capitaoUid);
    aplicarFiltrosElenco(capitaoUid, podeEditar);
  } catch (err) {
    console.error("Erro ao carregar elenco:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="elenco-vazio" style="color:#d32f2f">Não foi possível carregar o elenco.</td></tr>`;
  }

  const busca = document.getElementById("elenco-busca");
  const filtro = document.getElementById("elenco-filtro-posicao");
  if (busca && !busca.dataset.listenerElenco) {
    busca.dataset.listenerElenco = "true";
    busca.addEventListener("input", () => aplicarFiltrosElenco(capitaoUid, podeEditar));
  }
  if (filtro && !filtro.dataset.listenerElenco) {
    filtro.dataset.listenerElenco = "true";
    filtro.addEventListener("change", () => aplicarFiltrosElenco(capitaoUid, podeEditar));
  }
}

async function removerJogador(jogadorUid, nome, capitaoUid, podeEditar) {
  const ok = await confirmModal({
    titulo: "Remover do elenco",
    mensagem: `Tem certeza que quer remover ${nome} do elenco?`,
    textoConfirmar: "Remover",
    destrutivo: true,
  });
  if (!ok) return;
  try {
    // OBS: as regras do Firestore normalmente só deixam cada jogador escrever
    // no próprio documento. Se o capitão não tiver permissão especial, essa
    // escrita vai falhar — nesse caso, a saída precisa partir do jogador
    // (o botão "Sair do clube" que ele já tem no próprio painel).
    await updateDoc(doc(db, "jogadores", jogadorUid), { clubeAtualId: null, clubeAtualNome: null });
    toast(`${nome} foi removido do elenco.`);
    renderizarElenco(capitaoUid, podeEditar);
  } catch (err) {
    toast("Não foi possível remover diretamente (permissão do Firestore). Peça pro jogador sair pelo próprio painel.", "erro");
  }
}

// ─── Buscar jogadores livres (sem clube) pra convidar ──────────────────────────
async function buscarJogadoresLivres(termo) {
  const inicio = termo.trim();
  if (!inicio) return [];
  const fim = inicio + "\uf8ff";
  const snap = await getDocs(query(
    collection(db, "jogadores"),
    where("nickname", ">=", inicio),
    where("nickname", "<=", fim),
    limit(10)
  ));
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(j => !j.clubeAtualId && j.uid !== auth.currentUser?.uid);
}

async function enviarConvite(capitaoUid, nomeClube, jogador) {
  const existeSnap = await getDocs(query(
    collection(db, "convitesClube"),
    where("capitaoUid", "==", capitaoUid),
    where("jogadorUid", "==", jogador.uid),
    where("status", "==", "pendente")
  ));
  if (!existeSnap.empty) { toast("Você já convidou esse jogador.", "erro"); return; }

  await addDoc(collection(db, "convitesClube"), {
    capitaoUid,
    clube: nomeClube || "seu clube",
    jogadorUid: jogador.uid,
    jogadorNome: jogador.nickname || "Jogador",
    status: "pendente",
    criadoEm: serverTimestamp(),
  });
  toast(`Convite enviado para ${jogador.nickname || "jogador"}!`);
}

function abrirModalConvidar(capitaoUid, nomeClube) {
  document.getElementById("modal-convidar")?.remove();

  const modal = document.createElement("div");
  modal.id = "modal-convidar";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-convidar-box">
      <div class="modal-convidar-cabecalho">
        <h3>Convidar Jogador</h3>
        <button type="button" class="modal-fechar" aria-label="fechar">&times;</button>
      </div>
      <input type="text" id="modal-busca-jogador" class="modal-busca-input" placeholder="Buscar por nickname..." autocomplete="off" />
      <div id="modal-resultados" class="modal-resultados">
        <p class="modal-dica">Digite pelo menos 2 letras pra buscar.</p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const fechar = () => modal.remove();
  modal.querySelector(".modal-fechar").addEventListener("click", fechar);
  modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });

  const input = document.getElementById("modal-busca-jogador");
  const resultadosEl = document.getElementById("modal-resultados");
  let timeoutBusca;

  input.addEventListener("input", () => {
    clearTimeout(timeoutBusca);
    const termo = input.value.trim();
    if (termo.length < 2) {
      resultadosEl.innerHTML = `<p class="modal-dica">Digite pelo menos 2 letras pra buscar.</p>`;
      return;
    }
    resultadosEl.innerHTML = `<p class="modal-dica">Buscando...</p>`;
    timeoutBusca = setTimeout(async () => {
      try {
        const jogadores = await buscarJogadoresLivres(termo);
        if (!jogadores.length) {
          resultadosEl.innerHTML = `<p class="modal-dica">Nenhum jogador livre encontrado.</p>`;
          return;
        }
        resultadosEl.innerHTML = jogadores.map(j => `
          <div class="modal-resultado-item">
            <img src="${escHtml(imagemSegura(j.fotoURL, '../IMG/user-icon.svg'))}" class="modal-resultado-avatar" alt="">
            <div class="modal-resultado-info">
              <span class="modal-resultado-nome">${escHtml(j.nickname || "Jogador")}</span>
              <span class="modal-resultado-detalhe">${escHtml(j.posicao || "—")} · OVR ${escHtml(j.overall ?? "—")}</span>
            </div>
            <button type="button" class="btn-convidar-resultado" data-uid="${j.uid}">Convidar</button>
          </div>`).join("");

        resultadosEl.querySelectorAll(".btn-convidar-resultado").forEach(btn => {
          btn.addEventListener("click", async () => {
            const jogador = jogadores.find(j => j.uid === btn.dataset.uid);
            btn.disabled = true;
            btn.textContent = "Enviando...";
            try {
              await enviarConvite(capitaoUid, nomeClube, jogador);
              btn.textContent = "Convidado ✓";
            } catch (err) {
              toast("Erro ao convidar: " + err.message, "erro");
              btn.disabled = false;
              btn.textContent = "Convidar";
            }
          });
        });
      } catch (err) {
        console.error("Erro ao buscar jogadores:", err);
        resultadosEl.innerHTML = `<p class="modal-dica" style="color:#d32f2f">Não foi possível buscar jogadores.</p>`;
      }
    }, 350);
  });

  input.focus();
}

// ─── Convites pendentes pro jogador (aceitar entra pro elenco) ────────────────
function escutarConvitesPendentes(uid) {
  const q = query(collection(db, "convitesClube"), where("jogadorUid", "==", uid), where("status", "==", "pendente"));
  onSnapshot(q, snap => {
    snap.docChanges().forEach(change => {
      if (change.type === "added") mostrarBannerConvite(change.doc.id, change.doc.data());
    });
  }, err => console.error("Erro ao acompanhar convites:", err));
}

function mostrarBannerConvite(conviteId, convite) {
  if (document.getElementById(`convite-${conviteId}`)) return;
  const banner = document.createElement("div");
  banner.id = `convite-${conviteId}`;
  banner.className = "banner-convite";
  banner.innerHTML = `
    <span>📩 <strong>${escHtml(convite.clube || "Um clube")}</strong> te convidou pro elenco!</span>
    <div class="banner-convite-acoes">
      <button type="button" class="btn-aceitar-convite">Aceitar</button>
      <button type="button" class="btn-recusar-convite">Recusar</button>
    </div>`;
  document.body.prepend(banner);

  banner.querySelector(".btn-aceitar-convite").addEventListener("click", async () => {
    try {
      const usuario = auth.currentUser;
      if (!usuario) throw new Error("Faça login novamente para aceitar o convite.");
      await setDoc(doc(db, "jogadores", usuario.uid), {
        clubeAtualId: convite.capitaoUid,
        clubeAtualNome: convite.clube,
        procurandoClube: false,
        agenteLivre: false,
      }, { merge: true });
      const chatId = `convite-clube-${conviteId}`;
      const mensagemInicial = `Convite aceito! Agora faço parte do ${convite.clube || "clube"}.`;
      await setDoc(doc(db, "chats", chatId), {
        clube: convite.clube || "Clube",
        participantes: [convite.capitaoUid, usuario.uid],
        tipo: "convite-clube",
        criadoEm: serverTimestamp(),
        ultimaMensagemTexto: mensagemInicial,
        ultimaMensagemAutorUid: usuario.uid,
        ultimaMensagemEm: serverTimestamp(),
        lidoPor: [usuario.uid],
        arquivadoPor: [],
      }, { merge: true });
      try {
        await addDoc(collection(db, "chats", chatId, "mensagens"), {
          texto: mensagemInicial,
          autorUid: usuario.uid,
          autorNome: usuario.displayName || convite.jogadorNome || "Jogador",
          enviadoEm: serverTimestamp(),
        });
      } catch (mensagemErr) {
        console.warn("Convite aceito, mas a mensagem inicial não foi criada:", mensagemErr);
      }
      await updateDoc(doc(db, "convitesClube", conviteId), {
        status: "aceito",
        chatId,
        respondidoEm: serverTimestamp(),
      });
      toast("Bem-vindo ao clube! A conversa foi criada. 🎉");
      banner.remove();
      setTimeout(() => location.reload(), 800);
    } catch (err) { toast("Erro ao aceitar convite: " + err.message, "erro"); }
  });
  banner.querySelector(".btn-recusar-convite").addEventListener("click", async () => {
    try {
      await updateDoc(doc(db, "convitesClube", conviteId), { status: "recusado" });
      banner.remove();
    } catch (err) { toast("Erro ao recusar: " + err.message, "erro"); }
  });
}

// ─── Preenche o dashboard do capitão com os dados salvos ──────────────────────
function preencherFormulario(clube, perfilAtual) {
  clubeCarregado = { ...clube };
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };

  set("clube", clube.nome);
  set("plataforma", clube.plataforma);
  set("divisao", clube.divisao);
  set("regiao", clube.regiao);
  set("jogo", clube.jogo);
  set("estilo-jogo", clube.estiloJogo);
  set("horario-treino", clube.horarioTreino);
  set("objetivo", clube.objetivo || "casual");
  set("descricao", clube.descricao);
  set("discord", clube.discord);
  set("whatsapp", clube.whatsapp);
  set("instagram", clube.instagram);
  set("capitao-nome", perfilAtual.nickname);
  set("capitao-idea", clube.capitaoIdEA || perfilAtual.eaId);
  set("capitao-microfone", clube.capitaoMicrofone || "sim");

  const escudo = imagemSegura(clube.escudoUrl);
  if (escudo) {
    document.getElementById("foto-perfil-preview").src = escudo;
    document.getElementById("preview-escudo").src = escudo;
  }

  document.querySelectorAll(".chip[data-dia]").forEach(chip => chip.classList.remove("active"));
  (Array.isArray(clube.diasTreino) ? clube.diasTreino : []).forEach(dia => {
    Array.from(document.querySelectorAll(".chip[data-dia]"))
      .find(chip => chip.dataset.dia === String(dia))
      ?.classList.add("active");
  });

  const necessidades = clube.necessidades || {};
  document.querySelectorAll("[data-pos-check]").forEach(chk => {
    const marcado = !!necessidades[chk.dataset.posCheck];
    chk.checked = marcado;
    chk.closest(".necessidade-item")?.classList.toggle("marcado", marcado);
  });

  atualizarPreview();
  atualizarProgressoClube();
}

function atualizarPreview() {
  const texto = (id, fallback = "—") => document.getElementById(id)?.value || fallback;
  const textoSelect = (id, fallback = "—") => {
    const el = document.getElementById(id);
    return el?.value ? el.options[el.selectedIndex].text : fallback;
  };
  document.getElementById("preview-nome").textContent = texto("clube", "Seu Clube");
  document.getElementById("preview-objetivo").textContent = textoSelect("objetivo");
  document.getElementById("preview-jogo").textContent = textoSelect("jogo");
  document.getElementById("preview-plataforma").textContent = textoSelect("plataforma");
  document.getElementById("preview-divisao").textContent = texto("divisao");
  document.getElementById("preview-treinos").textContent = texto("horario-treino");
}

function dadosClubeDoFormulario() {
  const valor = (id) => document.getElementById(id)?.value?.trim?.() || "";
  const necessidades = {};
  document.querySelectorAll("[data-pos-check]").forEach((campo) => {
    necessidades[campo.dataset.posCheck] = campo.checked;
  });
  return {
    nome: valor("clube"),
    escudoUrl: document.getElementById("upload-escudo")?.dataset.novaImagem || clubeCarregado.escudoUrl || "",
    plataforma: valor("plataforma"),
    divisao: valor("divisao"),
    regiao: valor("regiao"),
    jogo: valor("jogo"),
    estiloJogo: valor("estilo-jogo"),
    horarioTreino: valor("horario-treino"),
    objetivo: valor("objetivo"),
    descricao: valor("descricao"),
    discord: valor("discord"),
    whatsapp: valor("whatsapp"),
    instagram: valor("instagram"),
    capitaoIdEA: valor("capitao-idea"),
    capitaoMicrofone: valor("capitao-microfone"),
    diasTreino: Array.from(document.querySelectorAll(".chip.active")).map((item) => item.dataset.dia),
    necessidades,
  };
}

function atualizarProgressoClube() {
  const container = document.getElementById("clube-progresso");
  if (!container) return;
  const dados = dadosClubeDoFormulario();
  const campos = [
    { nome: "Nome do clube", alvo: "clube", completo: dados.nome.length >= 3 },
    { nome: "Escudo", alvo: "btn-upload-escudo", completo: Boolean(dados.escudoUrl) },
    { nome: "Plataforma", alvo: "plataforma", completo: Boolean(dados.plataforma) },
    { nome: "Jogo", alvo: "jogo", completo: Boolean(dados.jogo) },
    { nome: "Região", alvo: "regiao", completo: Boolean(dados.regiao) },
    { nome: "Divisão", alvo: "divisao", completo: Boolean(dados.divisao) },
    { nome: "Objetivo", alvo: "objetivo", completo: Boolean(dados.objetivo) },
    { nome: "Estilo de jogo", alvo: "estilo-jogo", completo: Boolean(dados.estiloJogo) },
    { nome: "Descrição com 30 caracteres", alvo: "descricao", completo: dados.descricao.length >= 30 },
    { nome: "Horário de treino", alvo: "horario-treino", completo: Boolean(dados.horarioTreino) },
    { nome: "Dias de treino", alvo: "chip-dia", completo: dados.diasTreino.length > 0 },
    { nome: "Posições procuradas", alvo: "posicao-necessaria", completo: Object.values(dados.necessidades).some(Boolean) },
    { nome: "Canal de contato", alvo: "discord", completo: Boolean(dados.discord || dados.whatsapp || dados.instagram) },
    { nome: "ID EA do capitão", alvo: "capitao-idea", completo: Boolean(dados.capitaoIdEA) },
    { nome: "Informação de microfone", alvo: "capitao-microfone", completo: Boolean(dados.capitaoMicrofone) },
  ];
  const pendentes = campos.filter((campo) => !campo.completo);
  const percentual = Math.round(((campos.length - pendentes.length) / campos.length) * 100);
  container.hidden = false;
  container.classList.toggle("completo", percentual === 100);
  document.getElementById("clube-progresso-percentual").textContent = `${percentual}%`;
  document.getElementById("clube-progresso-barra").style.width = `${percentual}%`;
  const trilha = container.querySelector("[role='progressbar']");
  trilha?.setAttribute("aria-valuenow", String(percentual));
  document.getElementById("clube-progresso-mensagem").textContent = percentual === 100
    ? "Perfil completo. Seu clube já apresenta as principais informações aos jogadores."
    : `Faltam ${pendentes.length} item(ns). Complete o perfil para transmitir mais confiança.`;
  const resumoPendencias = pendentes.slice(0, 5).map((campo) => `<span>${escHtml(campo.nome)}</span>`);
  if (pendentes.length > 5) resumoPendencias.push(`<span>+${pendentes.length - 5} itens</span>`);
  document.getElementById("clube-progresso-pendencias").innerHTML = resumoPendencias.join("");
  const botao = document.getElementById("clube-progresso-ir");
  if (botao) botao.dataset.alvo = pendentes[0]?.alvo || "";
}

// ─── Liga os eventos do dashboard (upload, chips, checkboxes, preview, salvar) ─
function ligarEventosDashboard(uid) {
  // Preview ao vivo
  ["clube","divisao","horario-treino","objetivo","jogo","plataforma"].forEach(id =>
    document.getElementById(id)?.addEventListener("input", atualizarPreview)
  );
  document.querySelectorAll("select").forEach(sel => sel.addEventListener("change", atualizarPreview));
  [
    "clube", "plataforma", "divisao", "regiao", "jogo", "estilo-jogo",
    "horario-treino", "objetivo", "descricao", "discord", "whatsapp",
    "instagram", "capitao-idea", "capitao-microfone",
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", atualizarProgressoClube);
    document.getElementById(id)?.addEventListener("change", atualizarProgressoClube);
  });
  document.getElementById("clube-progresso-ir")?.addEventListener("click", () => {
    document.getElementById("aba-geral")?.click();
    const alvo = document.getElementById("clube-progresso-ir")?.dataset.alvo;
    let elemento = document.getElementById(alvo);
    if (alvo === "chip-dia") elemento = document.querySelector(".chip[data-dia]");
    if (alvo === "posicao-necessaria") elemento = document.querySelector("[data-pos-check]")?.closest("label") || document.querySelector("[data-pos-check]");
    elemento?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => elemento?.focus?.(), 350);
  });

  // Upload de escudo: botão abre o input de arquivo escondido
  document.getElementById("btn-upload-escudo")?.addEventListener("click", () =>
    document.getElementById("upload-escudo").click()
  );
  document.getElementById("upload-escudo")?.addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      toast("Selecione um arquivo de imagem válido.", "erro");
      e.target.value = "";
      return;
    }
    if (arquivo.size > 2 * 1024 * 1024) {
      toast("⚠️ Imagem muito grande. Use até 2MB.", "erro");
      e.target.value = "";
      return;
    }
    try {
      const comprimida = await comprimirImagem(arquivo);
      if (comprimida.length > 850_000) throw new Error("A imagem ainda ficou muito grande.");
      document.getElementById("foto-perfil-preview").src = comprimida;
      document.getElementById("preview-escudo").src = comprimida;
      document.getElementById("upload-escudo").dataset.novaImagem = comprimida;
      atualizarProgressoClube();
    } catch { toast("Erro ao processar imagem.", "erro"); }
    finally { e.target.value = ""; }
  });

  // Chips de dias da semana
  document.querySelectorAll(".chip").forEach(chip =>
    chip.addEventListener("click", () => {
      chip.classList.toggle("active");
      atualizarProgressoClube();
    })
  );

  // Necessidades (checkbox)
  document.querySelectorAll("[data-pos-check]").forEach(chk =>
    chk.addEventListener("change", () => {
      chk.closest(".necessidade-item")?.classList.toggle("marcado", chk.checked);
      atualizarProgressoClube();
    })
  );

  // Elenco: dados reais (sem jogador fake) + botão de convidar
  renderizarElenco(uid, true);
  document.getElementById("btn-convidar-jogador")?.addEventListener("click", () => {
    const nomeClube = document.getElementById("clube")?.value.trim() || "seu clube";
    abrirModalConvidar(uid, nomeClube);
  });

  // Salvar
  document.getElementById("btn-salvar-clube")?.addEventListener("click", async () => {
    const nome = document.getElementById("clube").value.trim();
    if (!nome) { toast("O nome do clube não pode ficar vazio.", "erro"); return; }

    const diasTreino = Array.from(document.querySelectorAll(".chip.active")).map(c => c.dataset.dia);
    const necessidades = {};
    document.querySelectorAll("[data-pos-check]").forEach(chk => necessidades[chk.dataset.posCheck] = chk.checked);

    const dados = {
      nome,
      capitaoUid:       uid,
      plataforma:       document.getElementById("plataforma").value,
      divisao:          document.getElementById("divisao").value.trim(),
      regiao:           document.getElementById("regiao").value,
      jogo:             document.getElementById("jogo").value,
      estiloJogo:       document.getElementById("estilo-jogo").value.trim(),
      horarioTreino:    document.getElementById("horario-treino").value,
      diasTreino,
      objetivo:         document.getElementById("objetivo").value,
      descricao:        document.getElementById("descricao").value.trim(),
      discord:          document.getElementById("discord").value.trim(),
      whatsapp:         document.getElementById("whatsapp").value.trim(),
      instagram:        document.getElementById("instagram").value.trim(),
      capitaoIdEA:      document.getElementById("capitao-idea").value.trim(),
      capitaoMicrofone: document.getElementById("capitao-microfone").value,
      necessidades,
    };
    const novaImagem = document.getElementById("upload-escudo").dataset.novaImagem;
    if (novaImagem) dados.escudoUrl = novaImagem;

    try {
      await setDoc(doc(db, "clubes", uid), dados, { merge: true });
      await setDoc(doc(db, "jogadores", uid), {
        ehCapitao: true,
        clube: nome,
        clubeAtualId: uid,
        clubeAtualNome: nome,
      }, { merge: true });
      clubeCarregado = { ...clubeCarregado, ...dados };
      if (novaImagem) clubeCarregado.escudoUrl = novaImagem;
      atualizarProgressoClube();
      toast("✅ Clube atualizado!");
    } catch (err) { toast("Erro ao salvar: " + err.message, "erro"); }
  });
}

async function carregarEstatisticas(uid) {
  try {
    const elenco = await buscarElenco(uid);
    const vagasSnap = await getDocs(query(collection(db, "vagas"), where("capitaoUid", "==", uid)));
    document.getElementById("stat-jogadores").textContent = elenco.length;
    document.getElementById("stat-vagas").textContent = vagasSnap.size;
  } catch { /* silencioso */ }
}

// ─── Visão de quem não é capitão (jogador de time, ou sem clube) ───────────────
function itemElencoSimples(jogador, capitaoUid) {
  const ehCapitao = jogador.uid === capitaoUid;
  return `
    <div class="rede-item" style="justify-content:space-between">
      <span style="color:#fff">${escHtml(jogador.nickname || "Jogador")}${ehCapitao ? " 👑" : ""}</span>
      <span style="color:#8b8b8b;font-size:12px">${escHtml(jogador.posicao || "—")} · OVR ${escHtml(jogador.overall || "—")}</span>
    </div>`;
}

async function renderPainelJogador(perfilAtual) {
  const capitaoUid = perfilAtual.clubeAtualId;
  const elenco = await buscarElenco(capitaoUid);
  document.getElementById("dashboard-clube").outerHTML = `
    <div class="card" style="max-width:640px;margin:0 auto 16px">
      <h3 style="color:#22C55E">Você joga no ${escHtml(perfilAtual.clubeAtualNome || "seu clube")}</h3>
      <p style="color:#8b8b8b">Esse é o elenco atual do time.</p>
      <button type="button" id="btn-sair-clube" class="btn-salvar-clube" style="background:transparent;border:1px solid #d32f2f;color:#d32f2f;margin:10px 0 0">Sair do clube</button>
    </div>
    <div class="card" style="max-width:640px;margin:0 auto">
      <h3>Elenco (${elenco.length} jogador${elenco.length === 1 ? '' : 'es'})</h3>
      ${elenco.map(j => itemElencoSimples(j, capitaoUid)).join("")}
    </div>`;
  const btnConvidar = document.getElementById("btn-convidar-jogador");
  if (btnConvidar) btnConvidar.hidden = true;
  await renderizarElenco(capitaoUid, false);
  document.getElementById("btn-sair-clube").addEventListener("click", async () => {
    const ok = await confirmModal({
      titulo: "Sair do clube",
      mensagem: "Tem certeza que quer sair do clube? Você pode ser convidado de novo depois.",
      textoConfirmar: "Sair",
      destrutivo: true,
    });
    if (!ok) return;
    try {
      const usuario = auth.currentUser;
      if (!usuario) throw new Error("Faça login novamente para sair do clube.");
      await updateDoc(doc(db, "jogadores", usuario.uid), { clubeAtualId: null, clubeAtualNome: null });
      toast("Você saiu do clube.");
      setTimeout(() => location.reload(), 800);
    } catch (err) { toast("Erro ao sair: " + err.message, "erro"); }
  });
}

function renderCTASemClube() {
  document.getElementById("dashboard-clube").outerHTML = `
    <div class="card" style="max-width:520px;margin:60px auto;text-align:center">
      <p style="color:#fff">⚽ Você ainda não faz parte de nenhum clube.</p>
      <p style="color:#8b8b8b;font-size:13px">Publique uma vaga como capitão ou candidate-se a um clube na área de vagas e jogadores.</p>
      <a href="../HTML/mercado.html" class="btn-salvar-clube" style="display:inline-block;text-decoration:none;margin-top:14px">Abrir vagas e jogadores</a>
    </div>`;
  const btnConvidar = document.getElementById("btn-convidar-jogador");
  if (btnConvidar) btnConvidar.hidden = true;
  elencoAtual = [];
  aplicarFiltrosElenco("", false);
}

// ─── Modo visitante: perfil público completo do clube (via ?uid=) ─────────────
const ROTULOS_DIAS = {
  domingo: "Domingo",
  segunda: "Segunda",
  terca: "Terça",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "Sábado",
};

const ROTULOS_POSICOES_CLUBE = {
  goleiro: "Goleiro",
  gk: "Goleiro",
  gol: "Goleiro",
  zagueiro: "Zagueiro",
  zag: "Zagueiro",
  lateral: "Lateral",
  lat: "Lateral",
  volante: "Volante",
  vol: "Volante",
  meia: "Meia",
  mei: "Meia",
  atacante: "Atacante",
  ata: "Atacante",
  ponta: "Ponta",
};

const TEMPO_ATIVO_VAGA_MS = 30 * 24 * 60 * 60 * 1000;

function textoPublico(valor, fallback = "Não informado") {
  const resultado = String(valor ?? "").trim();
  return resultado || fallback;
}

function rotuloPublico(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return "Não informado";
  const formatado = texto.replaceAll("_", " ").replaceAll("-", " ");
  return formatado.charAt(0).toUpperCase() + formatado.slice(1);
}

function rotuloPosicaoClube(valor) {
  const chave = String(valor ?? "").toLowerCase().trim();
  return ROTULOS_POSICOES_CLUBE[chave] || rotuloPublico(valor);
}

function criarLinkContato(tipo, valor) {
  const original = String(valor || "").trim();
  if (!original) return null;

  if (tipo === "Discord") {
    const limpo = original.replace(/^https?:\/\//i, "");
    if (/^(?:www\.)?discord(?:\.gg|\.com\/invite)\/[A-Za-z0-9_-]+\/?$/i.test(limpo)) {
      return { tipo, texto: "Abrir Discord", url: `https://${limpo}` };
    }
  }

  if (tipo === "WhatsApp") {
    const numero = original.replace(/\D/g, "");
    if (numero.length >= 10 && numero.length <= 15) {
      const numeroInternacional = numero.length <= 11 ? `55${numero}` : numero;
      return { tipo, texto: "Conversar no WhatsApp", url: `https://wa.me/${numeroInternacional}` };
    }
  }

  if (tipo === "Instagram") {
    const usuario = original
      .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .replace(/\/$/, "");
    if (/^[A-Za-z0-9._]{1,30}$/.test(usuario)) {
      return { tipo, texto: `@${usuario}`, url: `https://instagram.com/${usuario}` };
    }
  }

  return null;
}

function renderizarContatosPublicos(clube) {
  const contatos = [
    criarLinkContato("Discord", clube.discord),
    criarLinkContato("WhatsApp", clube.whatsapp),
    criarLinkContato("Instagram", clube.instagram),
  ].filter(Boolean);
  const container = document.getElementById("publico-contatos");
  const principal = document.getElementById("publico-contato-principal");

  if (container) {
    container.innerHTML = contatos.length
      ? contatos.map(contato => `
          <a href="${escHtml(contato.url)}" target="_blank" rel="noopener noreferrer" class="publico-contato-link">
            <span>${escHtml(contato.tipo)}</span>
            <strong>${escHtml(contato.texto)}</strong>
          </a>`).join("")
      : '<div class="publico-vazio">O capitão ainda não informou canais públicos de contato.</div>';
  }

  if (principal && contatos.length) {
    principal.href = contatos[0].url;
    principal.target = "_blank";
    principal.rel = "noopener noreferrer";
    principal.hidden = false;
  }
}

function renderizarElencoPublico(elenco, capitaoUid) {
  const container = document.getElementById("publico-elenco");
  const contagem = document.getElementById("publico-elenco-contagem");
  if (!container) return;

  const ordenado = [...elenco].sort((a, b) => {
    if (a.uid === capitaoUid) return -1;
    if (b.uid === capitaoUid) return 1;
    return String(a.nickname || "").localeCompare(String(b.nickname || ""), "pt-BR");
  });
  if (contagem) contagem.textContent = `${ordenado.length} jogador${ordenado.length === 1 ? "" : "es"}`;

  container.innerHTML = ordenado.length
    ? ordenado.map(jogador => {
        const capitao = jogador.uid === capitaoUid;
        const avatar = imagemSegura(jogador.fotoURL, "../IMG/user-icon.svg");
        const nivel = jogador.nivel || jogador.level;
        return `
          <a href="./meu-perfil.html?uid=${encodeURIComponent(jogador.uid)}" class="publico-jogador-card">
            <img src="${escHtml(avatar)}" alt="Foto de ${escHtml(jogador.nickname || "jogador")}" />
            <div class="publico-jogador-info">
              <strong>${escHtml(jogador.nickname || "Jogador")}</strong>
              <span>${escHtml(rotuloPosicaoClube(jogador.posicao))}${jogador.eaId ? ` · ${escHtml(jogador.eaId)}` : ""}</span>
              <span data-reputacao-uid="${escHtml(jogador.uid)}" data-reputacao-tipo="jogador"></span>
            </div>
            <div class="publico-jogador-numeros">
              ${capitao ? '<span class="publico-selo-capitao">Capitão</span>' : ""}
              <span>OVR <b>${escHtml(jogador.overall ?? "—")}</b></span>
              ${nivel ? `<span>Nível <b>${escHtml(nivel)}</b></span>` : ""}
            </div>
          </a>`;
      }).join("")
    : '<div class="publico-vazio">Este clube ainda não possui jogadores no elenco.</div>';

  container.querySelectorAll(".publico-jogador-card img").forEach(imagem => {
    imagem.addEventListener("error", () => {
      imagem.src = "../IMG/user-icon.svg";
    }, { once: true });
  });
}

function renderizarVagasPublicas(vagas) {
  const container = document.getElementById("publico-vagas");
  if (!container) return;
  container.innerHTML = vagas.length
    ? vagas.map(vaga => `
        <article class="publico-vaga-card">
          <div class="publico-vaga-topo">
            <span class="publico-chip ativo">${escHtml(rotuloPosicaoClube(vaga.posicao))}</span>
            ${vaga.overallMinimo ? `<span class="publico-chip">OVR mínimo ${escHtml(vaga.overallMinimo)}</span>` : ""}
          </div>
          <h3>${escHtml(textoPublico(vaga.clube, "Vaga do clube"))}</h3>
          <p>${escHtml(textoPublico(vaga.descricao, "Veja os detalhes desta oportunidade no mercado."))}</p>
          <div class="publico-vaga-rodape">
            <span>${escHtml(textoPublico(vaga.jogo))} · ${escHtml(rotuloPublico(vaga.estilo))}</span>
            <a href="./mercado.html?vaga=${encodeURIComponent(vaga.id)}">Ver e candidatar-se →</a>
          </div>
        </article>`).join("")
    : '<div class="publico-vazio">Este clube não possui vagas abertas no momento.</div>';
}

function renderizarPerfilPublico(clube, perfilCapitao, elenco, vagas, uidClube) {
  const publico = document.getElementById("clube-publico");
  publico.hidden = false;

  const reputacao = document.getElementById("publico-reputacao");
  if (reputacao) reputacao.dataset.reputacaoUid = uidClube;
  window.mercadoReputacao?.atualizar();

  const nome = textoPublico(clube.nome, "Clube");
  const escudo = imagemSegura(clube.escudoUrl, "../IMG/real madrid.svg");
  const necessidades = Object.entries(clube.necessidades || {})
    .filter(([, ativo]) => ativo === true)
    .map(([posicao]) => posicao);
  const dias = Array.isArray(clube.diasTreino) ? clube.diasTreino : [];

  document.title = `${nome} | Mercado Pro Clubs`;
  document.getElementById("publico-nome-clube").textContent = nome;
  document.getElementById("publico-capitao").textContent = `Capitão: ${textoPublico(perfilCapitao.nickname || clube.capitaoNome, "Não informado")}`;
  const escudoElemento = document.getElementById("publico-escudo");
  escudoElemento.src = escudo;
  escudoElemento.alt = `Escudo do ${nome}`;
  escudoElemento.addEventListener("error", () => {
    escudoElemento.src = "../IMG/real madrid.svg";
  }, { once: true });
  document.getElementById("publico-descricao").textContent = textoPublico(
    clube.descricao,
    "O capitão ainda não adicionou uma apresentação para este clube.",
  );

  document.getElementById("publico-tags").innerHTML = [clube.jogo, clube.plataforma, clube.regiao]
    .filter(Boolean)
    .map(valor => `<span>${escHtml(rotuloPublico(valor))}</span>`)
    .join("");

  document.getElementById("publico-total-jogadores").textContent = elenco.length;
  document.getElementById("publico-total-vagas").textContent = vagas.length;
  document.getElementById("publico-total-posicoes").textContent = necessidades.length;
  document.getElementById("publico-divisao-resumo").textContent = textoPublico(clube.divisao, "—");

  const destaques = [
    ["Objetivo", rotuloPublico(clube.objetivo)],
    ["Estilo de jogo", textoPublico(clube.estiloJogo)],
    ["Treinos", clube.horarioTreino ? `${clube.horarioTreino}h` : "Não informado"],
  ];
  document.getElementById("publico-destaques").innerHTML = destaques.map(([titulo, valor]) => `
    <div><span>${escHtml(titulo)}</span><strong>${escHtml(valor)}</strong></div>`).join("");

  const detalhes = [
    ["Jogo", clube.jogo],
    ["Plataforma", rotuloPublico(clube.plataforma)],
    ["Região", clube.regiao],
    ["Divisão", clube.divisao],
    ["Estilo", clube.estiloJogo],
    ["Objetivo", rotuloPublico(clube.objetivo)],
    ["Horário", clube.horarioTreino ? `${clube.horarioTreino}h` : null],
    ["ID EA do capitão", clube.capitaoIdEA || perfilCapitao.eaId],
    ["Capitão com microfone", clube.capitaoMicrofone === "sim" ? "Sim" : clube.capitaoMicrofone === "nao" ? "Não" : null],
  ];
  document.getElementById("publico-lista-detalhes").innerHTML = detalhes.map(([titulo, valor]) => `
    <div><dt>${escHtml(titulo)}</dt><dd>${escHtml(textoPublico(valor))}</dd></div>`).join("");

  document.getElementById("publico-necessidades").innerHTML = necessidades.length
    ? necessidades.map(posicao => `<span class="publico-chip ativo">${escHtml(rotuloPosicaoClube(posicao))}</span>`).join("")
    : '<span class="publico-chip">Sem posições anunciadas</span>';
  document.getElementById("publico-dias-treino").innerHTML = dias.length
    ? dias.map(dia => `<span class="publico-chip">${escHtml(ROTULOS_DIAS[dia] || rotuloPublico(dia))}</span>`).join("")
    : '<span class="publico-chip">Dias não informados</span>';

  renderizarElencoPublico(elenco, uidClube);
  renderizarVagasPublicas(vagas);
  renderizarContatosPublicos(clube);
}

function mostrarErroClubePublico(mensagem) {
  const publico = document.getElementById("clube-publico");
  publico.hidden = false;
  publico.innerHTML = `
    <div class="publico-estado">
      <h1>Clube não disponível</h1>
      <p>${escHtml(mensagem)}</p>
      <a href="./mercado.html" class="publico-btn publico-btn-primario">Voltar para vagas e jogadores</a>
    </div>`;
}

async function carregarModoVisitante(uidClube) {
  document.body.classList.add("modo-visitante");
  try {
    const clubeSnap = await getDoc(doc(db, "clubes", uidClube));
    if (!clubeSnap.exists()) {
      mostrarErroClubePublico("Esse clube não foi encontrado ou não existe mais.");
      return;
    }

    const [perfilCapitaoSnap, elenco, vagasSnap] = await Promise.all([
      getDoc(doc(db, "jogadores", uidClube)),
      buscarElenco(uidClube),
      getDocs(query(collection(db, "vagas"), where("capitaoUid", "==", uidClube))),
    ]);
    const clube = clubeSnap.data();
    if (clube.suspenso === true) {
      mostrarErroClubePublico("Este clube está temporariamente indisponível para revisão da moderação.");
      return;
    }
    const perfilCapitao = perfilCapitaoSnap.exists() ? perfilCapitaoSnap.data() : {};
    const agora = Date.now();
    const vagas = vagasSnap.docs
      .map(vagaDoc => ({ id: vagaDoc.id, ...vagaDoc.data() }))
      .filter(vaga => {
        const criadoMs = vaga.criadoEm?.toMillis?.() || 0;
        return !criadoMs || agora - criadoMs < TEMPO_ATIVO_VAGA_MS;
      })
      .sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));

    const elencoPublico = elenco.filter(jogador => jogador.suspenso !== true);
    renderizarPerfilPublico(clube, perfilCapitao, elencoPublico, vagas, uidClube);
  } catch (err) {
    console.error("Erro ao carregar clube público:", err);
    mostrarErroClubePublico("Não foi possível carregar este clube. Atualize a página e tente novamente.");
  }
}

document.getElementById("publico-compartilhar")?.addEventListener("click", async () => {
  try {
    if (window.mercadoCompartilhar) {
      const nomeClube = document.getElementById("publico-nome")?.textContent?.trim() || "este clube";
      window.mercadoCompartilhar({
        titulo: nomeClube,
        texto: `Conheça o ${nomeClube}, veja o elenco, as vagas e todos os detalhes no Mercado Pro Clubs.`,
        url: location.href,
      });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: document.title, text: "Confira este clube no Mercado Pro Clubs", url: location.href });
      return;
    }
    await navigator.clipboard.writeText(location.href);
    toast("Link do clube copiado!");
  } catch (err) {
    if (err?.name !== "AbortError") toast("Não foi possível compartilhar o clube.", "erro");
  }
});

// ─── Troca de abas (Geral / Elenco / Vagas / Estatísticas / Aparência) ─────────
// Não depende de login nem do Firestore — roda assim que o script carrega.
function ligarAbas() {
  const botoes = document.querySelectorAll(".aba-item[data-tab]");
  if (!botoes.length) return;

  botoes.forEach(btn => {
    btn.addEventListener("click", () => {
      const alvo = btn.dataset.tab;

      botoes.forEach(b => b.classList.toggle("ativo", b === btn));

      document.querySelectorAll(".tab-painel[data-painel]").forEach(painel => {
        painel.hidden = painel.dataset.painel !== alvo;
      });
    });
  });
}
ligarAbas();

// Paginação do elenco: só o visual por enquanto (troca qual botão fica "ativa")
document.querySelectorAll(".pagina-num").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pagina-num").forEach(b => b.classList.remove("ativa"));
    btn.classList.add("ativa");
  });
});

// ─── Inicialização ──────────────────────────────────────────────────────────────
const uidVisitante = new URLSearchParams(window.location.search).get("uid");

if (uidVisitante) {
  // Qualquer pessoa pode ver um clube publicado, logada ou não.
  carregarModoVisitante(uidVisitante);
} else {
  onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) { window.location.href = "./cadastrar-se.html"; return; }

    escutarConvitesPendentes(usuario.uid);

    try {
      const perfilSnap = await getDoc(doc(db, "jogadores", usuario.uid));
      const perfilAtual = perfilSnap.exists() ? perfilSnap.data() : {};

      const clubeSnap = await getDoc(doc(db, "clubes", usuario.uid));
      const ehCapitao = clubeSnap.exists() || perfilAtual.ehCapitao;

      if (ehCapitao) {
        const dadosClube = clubeSnap.exists() ? clubeSnap.data() : { nome: perfilAtual.clube || "" };
        const linkPublico = document.getElementById("btn-ver-perfil-publico");
        if (linkPublico) {
          linkPublico.href = `./clubes.html?uid=${encodeURIComponent(usuario.uid)}`;
          linkPublico.hidden = false;
        }
        preencherFormulario(dadosClube, perfilAtual);
        ligarEventosDashboard(usuario.uid);
        await carregarEstatisticas(usuario.uid);
      } else if (perfilAtual.clubeAtualId) {
        document.querySelector(".menu-acao")?.setAttribute("hidden", "");
        await renderPainelJogador(perfilAtual);
      } else {
        document.querySelector(".menu-acao")?.setAttribute("hidden", "");
        renderCTASemClube();
      }
    } catch (err) {
      console.error("Erro ao carregar clube:", err);
      document.getElementById("dashboard-clube").innerHTML =
        `<p style="color:#d32f2f;text-align:center;grid-column:1/-1">Não foi possível carregar seu clube. Tente novamente.</p>`;
    }
  });
}

function imagemSegura(src, fallback = "") {
  const valor = String(src || "").trim();
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(valor)) return valor;
  if (/^https:\/\//i.test(valor)) return valor;
  if (/^(?:\.\.\/|\.\/|\/)[^"'<>]+$/.test(valor)) return valor;
  return fallback;
}

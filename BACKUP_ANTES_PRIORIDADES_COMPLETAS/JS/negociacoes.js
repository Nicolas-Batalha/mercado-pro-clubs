import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { confirmModal } from "./confirm-modal.js";

const estado = {
  usuario: null,
  perfil: {},
  clube: null,
  candidaturasEnviadas: [],
  candidaturasRecebidas: [],
  convitesRecebidos: [],
  convitesEnviados: [],
  chats: [],
  carregamento: 0,
};

function escHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizar(valor) {
  return String(valor || "").trim().toLowerCase();
}

function uidValido(valor) {
  const uid = normalizar(valor);
  return Boolean(uid) && !["undefined", "null", "—"].includes(uid);
}

function timestampMs(item) {
  return item.respondidoEm?.toMillis?.()
    || item.canceladoEm?.toMillis?.()
    || item.reenviadoEm?.toMillis?.()
    || item.atualizadoEm?.toMillis?.()
    || item.ultimaMensagemEm?.toMillis?.()
    || item.criadoEm?.toMillis?.()
    || 0;
}

function formatarData(item) {
  const ms = timestampMs(item);
  if (!ms) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(ms));
}

function statusItem(item) {
  const status = normalizar(item.status || "pendente");
  return ["pendente", "aceito", "recusado", "cancelado"].includes(status) ? status : "pendente";
}

function rotuloStatus(status) {
  return ({
    pendente: "Pendente",
    aceito: "Aceito",
    recusado: "Recusado",
    cancelado: "Cancelado",
  })[status] || "Pendente";
}

function ordenar(itens) {
  return [...itens].sort((a, b) => timestampMs(b) - timestampMs(a));
}

function toast(mensagem, tipo = "sucesso") {
  document.querySelector(".negociacoes-toast")?.remove();
  const elemento = document.createElement("div");
  elemento.className = `negociacoes-toast${tipo === "erro" ? " erro" : ""}`;
  elemento.setAttribute("role", tipo === "erro" ? "alert" : "status");
  elemento.textContent = mensagem;
  document.body.appendChild(elemento);
  window.setTimeout(() => elemento.remove(), 3800);
}

function vazio(titulo, mensagem, link = "", textoLink = "") {
  return `<div class="negociacoes-vazio">
    <strong>${escHtml(titulo)}</strong>
    <span>${escHtml(mensagem)}</span>
    ${link ? `<a href="${escHtml(link)}">${escHtml(textoLink)}</a>` : ""}
  </div>`;
}

function acaoBotao(acao, id, texto, classe = "") {
  return `<button type="button" class="negociacao-acao ${classe}" data-neg-acao="${escHtml(acao)}"
    data-id="${escHtml(id)}">${escHtml(texto)}</button>`;
}

function acaoLink(href, texto, classe = "") {
  return `<a class="negociacao-acao ${classe}" href="${escHtml(href)}">${escHtml(texto)}</a>`;
}

function cardBase({ tipo, titulo, status, resumo, meta = [], data, acoes = [], classe = "" }) {
  return `<article class="negociacao-card ${escHtml(classe)}">
    <div class="negociacao-card-topo">
      <div>
        <span class="negociacao-tipo">${escHtml(tipo)}</span>
        <h3>${escHtml(titulo)}</h3>
      </div>
      <span class="negociacao-status status-${escHtml(status)}">${escHtml(rotuloStatus(status))}</span>
    </div>
    <p class="negociacao-resumo">${escHtml(resumo)}</p>
    ${meta.length ? `<div class="negociacao-meta">${meta.map((valor) => `<span>${escHtml(valor)}</span>`).join("")}</div>` : ""}
    <small class="negociacao-data">Atualizado em ${escHtml(data)}</small>
    ${acoes.length ? `<div class="negociacao-acoes">${acoes.join("")}</div>` : ""}
  </article>`;
}

function cardCandidaturaJogador(item) {
  const status = statusItem(item);
  const acoes = [];
  if (uidValido(item.capitaoUid)) {
    acoes.push(acaoLink(`./clubes.html?uid=${encodeURIComponent(item.capitaoUid)}`, "Ver clube"));
  }
  if (status === "pendente") {
    acoes.push(acaoBotao("cancelar-candidatura", item.id, "Cancelar candidatura", "perigo"));
  } else if (["recusado", "cancelado"].includes(status)) {
    acoes.push(acaoBotao("reenviar-candidatura", item.id, "Candidatar novamente", "primaria"));
  } else if (status === "aceito" && item.chatId) {
    acoes.push(acaoLink(`./mercado.html?chat=${encodeURIComponent(item.chatId)}`, "Abrir conversa", "primaria"));
  }
  return cardBase({
    tipo: "Candidatura enviada",
    titulo: item.clube || "Clube",
    status,
    resumo: status === "pendente"
      ? "O capitão ainda está avaliando sua candidatura."
      : status === "aceito"
        ? "Sua candidatura foi aceita. Abra a conversa para combinar os próximos passos."
        : status === "recusado"
          ? "O clube encerrou esta candidatura. Você pode tentar novamente se a vaga continuar aberta."
          : "Você cancelou esta candidatura.",
    meta: [`Posição: ${item.posicao || "—"}`, `OVR: ${item.overall || "—"}`],
    data: formatarData(item),
    acoes,
  });
}

function cardConviteRecebido(item) {
  const status = statusItem(item);
  const acoes = [];
  if (uidValido(item.capitaoUid)) {
    acoes.push(acaoLink(`./clubes.html?uid=${encodeURIComponent(item.capitaoUid)}`, "Conhecer clube"));
  }
  if (status === "pendente") {
    acoes.push(acaoBotao("aceitar-convite", item.id, "Aceitar convite", "primaria"));
    acoes.push(acaoBotao("recusar-convite", item.id, "Recusar", "perigo"));
  } else if (status === "aceito" && item.chatId) {
    acoes.push(acaoLink(`./mercado.html?chat=${encodeURIComponent(item.chatId)}`, "Abrir conversa", "primaria"));
  }
  return cardBase({
    tipo: "Convite recebido",
    titulo: item.clube || "Clube",
    status,
    resumo: status === "pendente"
      ? "Este clube quer você no elenco. Confira o perfil antes de responder."
      : status === "aceito"
        ? "Você aceitou este convite e entrou para o elenco."
        : status === "recusado"
          ? "Você recusou este convite."
          : "O capitão cancelou este convite.",
    data: formatarData(item),
    acoes,
  });
}

function cardCandidaturaCapitao(item) {
  const status = statusItem(item);
  const acoes = [
    acaoLink(`./meu-perfil.html?uid=${encodeURIComponent(item.jogadorUid || "")}`, "Ver jogador"),
  ];
  if (status === "pendente") {
    acoes.push(acaoBotao("aceitar-candidatura", item.id, "Aceitar jogador", "primaria"));
    acoes.push(acaoBotao("recusar-candidatura", item.id, "Recusar", "perigo"));
  } else if (status === "aceito" && item.chatId) {
    acoes.push(acaoLink(`./mercado.html?chat=${encodeURIComponent(item.chatId)}`, "Abrir conversa", "primaria"));
  }
  return cardBase({
    tipo: "Candidato ao clube",
    titulo: item.jogadorNome || "Jogador",
    status,
    resumo: `${item.jogadorNome || "Um jogador"} quer entrar no ${item.clube || "seu clube"}.`,
    meta: [`Posição: ${item.posicao || "—"}`, `OVR: ${item.overall || "—"}`],
    data: formatarData(item),
    acoes,
  });
}

function cardConviteEnviado(item) {
  const status = statusItem(item);
  const acoes = [
    acaoLink(`./meu-perfil.html?uid=${encodeURIComponent(item.jogadorUid || "")}`, "Ver jogador"),
  ];
  if (status === "pendente") {
    acoes.push(acaoBotao("cancelar-convite", item.id, "Cancelar convite", "perigo"));
  } else if (status === "aceito" && item.chatId) {
    acoes.push(acaoLink(`./mercado.html?chat=${encodeURIComponent(item.chatId)}`, "Abrir conversa", "primaria"));
  }
  return cardBase({
    tipo: "Convite enviado",
    titulo: item.jogadorNome || "Jogador",
    status,
    resumo: status === "pendente"
      ? "Aguardando a resposta do jogador."
      : status === "aceito"
        ? "O jogador aceitou o convite do clube."
        : status === "recusado"
          ? "O jogador recusou este convite."
          : "Você cancelou este convite.",
    data: formatarData(item),
    acoes,
  });
}

function cardChat(item) {
  const lidoPor = Array.isArray(item.lidoPor) ? item.lidoPor : [];
  const naoLido = item.ultimaMensagemAutorUid
    && item.ultimaMensagemAutorUid !== estado.usuario.uid
    && !lidoPor.includes(estado.usuario.uid);
  return cardBase({
    tipo: naoLido ? "Nova mensagem" : "Conversa",
    titulo: item.clube || "Negociação",
    status: "aceito",
    resumo: item.ultimaMensagemTexto || "Conversa criada. Envie uma mensagem para combinar os detalhes.",
    meta: [item.tipo === "convite-clube" ? "Convite de clube" : "Candidatura"],
    data: formatarData(item),
    acoes: [acaoLink(`./mercado.html?chat=${encodeURIComponent(item.id)}`, "Abrir conversa", "primaria")],
    classe: naoLido ? "nao-lido" : "",
  });
}

function renderizar() {
  const jogadorItens = ordenar([
    ...estado.candidaturasEnviadas.map((item) => ({ ...item, categoria: "candidatura" })),
    ...estado.convitesRecebidos.map((item) => ({ ...item, categoria: "convite" })),
  ]);
  const capitaoItens = ordenar([
    ...estado.candidaturasRecebidas.map((item) => ({ ...item, categoria: "candidatura" })),
    ...estado.convitesEnviados.map((item) => ({ ...item, categoria: "convite" })),
  ]);
  const chatsVisiveis = ordenar(estado.chats.filter((chat) => (
    !(Array.isArray(chat.arquivadoPor) ? chat.arquivadoPor : []).includes(estado.usuario.uid)
  )));

  const pendenciasJogador = jogadorItens.filter((item) => statusItem(item) === "pendente").length;
  const pendenciasCapitao = capitaoItens.filter((item) => statusItem(item) === "pendente").length;
  document.getElementById("neg-metrica-jogador").textContent = String(pendenciasJogador);
  document.getElementById("neg-metrica-capitao").textContent = String(pendenciasCapitao);
  document.getElementById("neg-metrica-conversas").textContent = String(chatsVisiveis.length);
  document.getElementById("neg-badge-jogador").textContent = String(jogadorItens.length);
  document.getElementById("neg-badge-capitao").textContent = String(capitaoItens.length);
  document.getElementById("neg-badge-conversas").textContent = String(chatsVisiveis.length);

  const listaJogador = document.getElementById("neg-lista-jogador");
  listaJogador.innerHTML = jogadorItens.length
    ? jogadorItens.map((item) => item.categoria === "candidatura"
      ? cardCandidaturaJogador(item)
      : cardConviteRecebido(item)).join("")
    : vazio(
      "Nenhuma negociação como jogador.",
      "Candidate-se a uma vaga ou publique seu perfil para receber convites.",
      "./mercado.html",
      "Abrir vagas e jogadores",
    );

  const listaCapitao = document.getElementById("neg-lista-capitao");
  listaCapitao.innerHTML = capitaoItens.length
    ? capitaoItens.map((item) => item.categoria === "candidatura"
      ? cardCandidaturaCapitao(item)
      : cardConviteEnviado(item)).join("")
    : estado.clube
      ? vazio(
        "Nenhuma negociação do clube.",
        "Publique uma vaga ou convide jogadores disponíveis no mercado.",
        "./mercado.html",
        "Recrutar jogadores",
      )
      : vazio(
        "Você ainda não administra um clube.",
        "Crie seu clube para publicar vagas e receber candidaturas.",
        "./clubes.html",
        "Criar meu clube",
      );

  const listaConversas = document.getElementById("neg-lista-conversas");
  listaConversas.innerHTML = chatsVisiveis.length
    ? chatsVisiveis.map(cardChat).join("")
    : vazio(
      "Nenhuma conversa ativa.",
      "Uma conversa aparece quando uma candidatura ou convite é aceito.",
    );
}

async function carregarDados() {
  if (!estado.usuario) return;
  const carregamento = ++estado.carregamento;
  const app = document.getElementById("negociacoes-app");
  app.setAttribute("aria-busy", "true");
  try {
    const uid = estado.usuario.uid;
    const [perfilSnap, clubeSnap, candidaturasEnviadas, candidaturasRecebidas,
      convitesRecebidos, convitesEnviados, chats] = await Promise.all([
      getDoc(doc(db, "jogadores", uid)),
      getDoc(doc(db, "clubes", uid)),
      getDocs(query(collection(db, "candidaturas"), where("jogadorUid", "==", uid))),
      getDocs(query(collection(db, "candidaturas"), where("capitaoUid", "==", uid))),
      getDocs(query(collection(db, "convitesClube"), where("jogadorUid", "==", uid))),
      getDocs(query(collection(db, "convitesClube"), where("capitaoUid", "==", uid))),
      getDocs(query(collection(db, "chats"), where("participantes", "array-contains", uid))),
    ]);
    if (carregamento !== estado.carregamento || auth.currentUser?.uid !== uid) return;
    estado.perfil = perfilSnap.exists() ? perfilSnap.data() : {};
    estado.clube = clubeSnap.exists() ? { id: clubeSnap.id, ...clubeSnap.data() } : null;
    estado.candidaturasEnviadas = candidaturasEnviadas.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.candidaturasRecebidas = candidaturasRecebidas.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.convitesRecebidos = convitesRecebidos.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.convitesEnviados = convitesEnviados.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.chats = chats.docs.map((item) => ({ id: item.id, ...item.data() }));
    document.getElementById("negociacoes-boas-vindas").textContent =
      `Olá, ${estado.perfil.nickname || estado.usuario.displayName || "jogador"}. Acompanhe tudo que está acontecendo entre você e os clubes.`;
    renderizar();
  } catch (err) {
    console.error("Erro ao carregar negociações:", err);
    toast("Não foi possível atualizar as negociações. Confira as regras do Firebase.", "erro");
  } finally {
    app.setAttribute("aria-busy", "false");
  }
}

function encontrar(lista, id) {
  return lista.find((item) => item.id === id);
}

async function cancelarCandidatura(id) {
  const confirmar = await confirmModal({
    titulo: "Cancelar candidatura",
    mensagem: "Deseja cancelar esta candidatura? Você poderá se candidatar novamente enquanto a vaga estiver aberta.",
    textoConfirmar: "Cancelar candidatura",
    destrutivo: true,
  });
  if (!confirmar) return false;
  await updateDoc(doc(db, "candidaturas", id), {
    status: "cancelado",
    canceladoEm: serverTimestamp(),
    canceladoPor: estado.usuario.uid,
    atualizadoEm: serverTimestamp(),
  });
  toast("Candidatura cancelada.");
  return true;
}

async function reenviarCandidatura(id) {
  const item = encontrar(estado.candidaturasEnviadas, id);
  if (!item?.vagaId) throw new Error("A vaga desta candidatura não está disponível.");
  const vagaSnap = await getDoc(doc(db, "vagas", item.vagaId));
  if (!vagaSnap.exists()) throw new Error("Esta vaga foi removida. Escolha outra oportunidade no mercado.");
  const vaga = vagaSnap.data();
  if (!uidValido(vaga.capitaoUid)) throw new Error("O clube precisa republicar esta vaga antes de receber candidaturas.");
  if (estado.perfil.clubeAtualId) throw new Error("Saia do clube atual antes de se candidatar a outro.");
  await updateDoc(doc(db, "candidaturas", id), {
    capitaoUid: vaga.capitaoUid,
    clube: vaga.clube || item.clube || "Clube",
    jogadorNome: estado.perfil.nickname || estado.usuario.displayName || "Jogador",
    jogadorFoto: estado.perfil.fotoURL || "",
    posicao: estado.perfil.posicao || "—",
    overall: estado.perfil.overall || "—",
    status: "pendente",
    jogadorViu: false,
    reenviadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  toast("Candidatura enviada novamente.");
  return true;
}

async function aceitarCandidatura(id) {
  const item = encontrar(estado.candidaturasRecebidas, id);
  if (!item?.jogadorUid) throw new Error("Não foi possível identificar o jogador.");
  const chatId = `candidatura-${id}`;
  await setDoc(doc(db, "chats", chatId), {
    clube: item.clube || estado.clube?.nome || "Clube",
    participantes: [estado.usuario.uid, item.jogadorUid],
    tipo: "candidatura",
    criadoEm: serverTimestamp(),
    lidoPor: [estado.usuario.uid, item.jogadorUid],
    arquivadoPor: [],
  }, { merge: true });
  await updateDoc(doc(db, "candidaturas", id), {
    status: "aceito",
    chatId,
    jogadorViu: false,
    capitaoUid: estado.usuario.uid,
    respondidoEm: serverTimestamp(),
    respondidoPor: estado.usuario.uid,
    atualizadoEm: serverTimestamp(),
  });
  toast(`${item.jogadorNome || "Jogador"} foi aceito. A conversa está disponível.`);
  return true;
}

async function recusarCandidatura(id) {
  const confirmar = await confirmModal({
    titulo: "Recusar candidatura",
    mensagem: "Deseja encerrar esta candidatura?",
    textoConfirmar: "Recusar",
    destrutivo: true,
  });
  if (!confirmar) return false;
  await updateDoc(doc(db, "candidaturas", id), {
    status: "recusado",
    respondidoEm: serverTimestamp(),
    respondidoPor: estado.usuario.uid,
    atualizadoEm: serverTimestamp(),
  });
  toast("Candidatura recusada.");
  return true;
}

async function aceitarConvite(id) {
  const item = encontrar(estado.convitesRecebidos, id);
  if (!item || !uidValido(item.capitaoUid)) throw new Error("Este convite não possui um clube válido.");
  if (estado.perfil.clubeAtualId && estado.perfil.clubeAtualId !== item.capitaoUid) {
    throw new Error("Saia do clube atual antes de aceitar outro convite.");
  }
  await setDoc(doc(db, "jogadores", estado.usuario.uid), {
    clubeAtualId: item.capitaoUid,
    clubeAtualNome: item.clube || "Clube",
    procurandoClube: false,
    agenteLivre: false,
  }, { merge: true });
  const chatId = `convite-clube-${id}`;
  const mensagem = `Convite aceito! Agora faço parte do ${item.clube || "clube"}.`;
  await setDoc(doc(db, "chats", chatId), {
    clube: item.clube || "Clube",
    participantes: [item.capitaoUid, estado.usuario.uid],
    tipo: "convite-clube",
    criadoEm: serverTimestamp(),
    ultimaMensagemTexto: mensagem,
    ultimaMensagemAutorUid: estado.usuario.uid,
    ultimaMensagemEm: serverTimestamp(),
    lidoPor: [estado.usuario.uid],
    arquivadoPor: [],
  }, { merge: true });
  await addDoc(collection(db, "chats", chatId, "mensagens"), {
    texto: mensagem,
    autorUid: estado.usuario.uid,
    autorNome: estado.perfil.nickname || estado.usuario.displayName || "Jogador",
    enviadoEm: serverTimestamp(),
  });
  await updateDoc(doc(db, "convitesClube", id), {
    status: "aceito",
    chatId,
    respondidoEm: serverTimestamp(),
    respondidoPor: estado.usuario.uid,
    atualizadoEm: serverTimestamp(),
  });
  toast(`Bem-vindo ao ${item.clube || "clube"}!`);
  return true;
}

async function recusarConvite(id) {
  const confirmar = await confirmModal({
    titulo: "Recusar convite",
    mensagem: "Deseja recusar o convite deste clube?",
    textoConfirmar: "Recusar",
    destrutivo: true,
  });
  if (!confirmar) return false;
  await updateDoc(doc(db, "convitesClube", id), {
    status: "recusado",
    respondidoEm: serverTimestamp(),
    respondidoPor: estado.usuario.uid,
    atualizadoEm: serverTimestamp(),
  });
  toast("Convite recusado.");
  return true;
}

async function cancelarConvite(id) {
  const confirmar = await confirmModal({
    titulo: "Cancelar convite",
    mensagem: "Deseja cancelar este convite antes da resposta do jogador?",
    textoConfirmar: "Cancelar convite",
    destrutivo: true,
  });
  if (!confirmar) return false;
  await updateDoc(doc(db, "convitesClube", id), {
    status: "cancelado",
    canceladoEm: serverTimestamp(),
    canceladoPor: estado.usuario.uid,
    atualizadoEm: serverTimestamp(),
  });
  toast("Convite cancelado.");
  return true;
}

const ACOES = {
  "cancelar-candidatura": cancelarCandidatura,
  "reenviar-candidatura": reenviarCandidatura,
  "aceitar-candidatura": aceitarCandidatura,
  "recusar-candidatura": recusarCandidatura,
  "aceitar-convite": aceitarConvite,
  "recusar-convite": recusarConvite,
  "cancelar-convite": cancelarConvite,
};

document.getElementById("negociacoes-app")?.addEventListener("click", async (evento) => {
  const botao = evento.target.closest("[data-neg-acao]");
  if (!botao || botao.disabled) return;
  const executar = ACOES[botao.dataset.negAcao];
  if (!executar) return;
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Processando...";
  try {
    const alterou = await executar(botao.dataset.id);
    if (alterou !== false) await carregarDados();
  } catch (err) {
    toast(err.message || "Não foi possível concluir esta ação.", "erro");
    console.error("Erro na negociação:", err);
  } finally {
    if (document.body.contains(botao)) {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }
});

document.querySelectorAll("[data-neg-tab]").forEach((botao) => {
  botao.addEventListener("click", () => {
    const aba = botao.dataset.negTab;
    document.querySelectorAll("[data-neg-tab]").forEach((item) => {
      const ativa = item.dataset.negTab === aba;
      item.classList.toggle("ativa", ativa);
      item.setAttribute("aria-selected", String(ativa));
      item.tabIndex = ativa ? 0 : -1;
    });
    document.querySelectorAll("[data-neg-painel]").forEach((painel) => {
      painel.hidden = painel.dataset.negPainel !== aba;
    });
  });
});

onAuthStateChanged(auth, async (usuario) => {
  const acesso = document.getElementById("negociacoes-acesso");
  const app = document.getElementById("negociacoes-app");
  estado.usuario = usuario;
  if (!usuario) {
    app.hidden = true;
    acesso.hidden = false;
    acesso.innerHTML = `<h1>Entre para ver suas negociações</h1>
      <p>Candidaturas, convites e conversas são privados e só aparecem depois do login.</p>
      <a href="./cadastrar-se.html#login">Entrar na minha conta</a>`;
    return;
  }
  acesso.hidden = true;
  app.hidden = false;
  await carregarDados();
});

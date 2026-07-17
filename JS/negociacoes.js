import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
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
  arquivados: [],
  avaliacoesEnviadas: [],
  carregamento: 0,
};

let avaliacaoAtual = null;

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

function chaveArquivo(tipo, id) {
  return `${tipo}|${id}`;
}

function idDocumentoArquivo(tipo, id) {
  return `${estado.usuario.uid}__${tipo}__${id}`;
}

function estaArquivado(tipo, id) {
  return estado.arquivados.some((item) => item.tipo === tipo && item.registroId === id);
}

function alvoArquivo(valor) {
  const separador = String(valor || "").indexOf("|");
  if (separador < 1) return { tipo: "", id: "" };
  return {
    tipo: valor.slice(0, separador),
    id: valor.slice(separador + 1),
  };
}

function idDocumentoAvaliacao(tipo, negociacaoId) {
  return `${tipo}_${negociacaoId}_${estado.usuario.uid}`;
}

function jaAvaliou(tipo, negociacaoId) {
  const id = idDocumentoAvaliacao(tipo, negociacaoId);
  return estado.avaliacoesEnviadas.some((item) => item.id === id);
}

function contextoAvaliacao(tipo, id) {
  let item = null;
  let autorPapel = "";
  let alvoUid = "";
  let alvoTipo = "";
  let alvoNome = "";

  if (tipo === "candidatura") {
    item = encontrar(estado.candidaturasEnviadas, id);
    if (item) {
      autorPapel = "jogador";
      alvoUid = item.capitaoUid;
      alvoTipo = "clube";
      alvoNome = item.clube || "Clube";
    } else {
      item = encontrar(estado.candidaturasRecebidas, id);
      if (item) {
        autorPapel = "capitao";
        alvoUid = item.jogadorUid;
        alvoTipo = "jogador";
        alvoNome = item.jogadorNome || "Jogador";
      }
    }
  }

  if (tipo === "convite") {
    item = encontrar(estado.convitesRecebidos, id);
    if (item) {
      autorPapel = "jogador";
      alvoUid = item.capitaoUid;
      alvoTipo = "clube";
      alvoNome = item.clube || "Clube";
    } else {
      item = encontrar(estado.convitesEnviados, id);
      if (item) {
        autorPapel = "capitao";
        alvoUid = item.jogadorUid;
        alvoTipo = "jogador";
        alvoNome = item.jogadorNome || "Jogador";
      }
    }
  }

  if (!item || statusItem(item) !== "aceito" || !uidValido(alvoUid) || alvoUid === estado.usuario.uid) {
    return null;
  }
  return { tipo, id, item, autorPapel, alvoUid, alvoTipo, alvoNome };
}

function acaoAvaliacao(tipo, item) {
  if (statusItem(item) !== "aceito") return "";
  if (jaAvaliou(tipo, item.id)) {
    return '<span class="negociacao-avaliada">★ Avaliação enviada</span>';
  }
  const contexto = contextoAvaliacao(tipo, item.id);
  if (!contexto) return "";
  return acaoBotao(
    "avaliar-negociacao",
    chaveArquivo(tipo, item.id),
    `Avaliar ${contexto.alvoTipo === "clube" ? "clube" : "jogador"}`,
    "avaliar",
  );
}

function cardBase({
  tipo,
  titulo,
  status,
  resumo,
  meta = [],
  data,
  acoes = [],
  classe = "",
  reputacaoUid = "",
  reputacaoTipo = "jogador",
}) {
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
    ${uidValido(reputacaoUid) ? `<div class="negociacao-reputacao" data-reputacao-uid="${escHtml(reputacaoUid)}" data-reputacao-tipo="${escHtml(reputacaoTipo)}"></div>` : ""}
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
  const avaliacao = acaoAvaliacao("candidatura", item);
  if (avaliacao) acoes.push(avaliacao);
  if (status !== "pendente") {
    acoes.push(acaoBotao("arquivar-item", chaveArquivo("candidatura", item.id), "Arquivar", "arquivar"));
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
    reputacaoUid: item.capitaoUid,
    reputacaoTipo: "clube",
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
  const avaliacao = acaoAvaliacao("convite", item);
  if (avaliacao) acoes.push(avaliacao);
  if (status !== "pendente") {
    acoes.push(acaoBotao("arquivar-item", chaveArquivo("convite", item.id), "Arquivar", "arquivar"));
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
    reputacaoUid: item.capitaoUid,
    reputacaoTipo: "clube",
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
  const avaliacao = acaoAvaliacao("candidatura", item);
  if (avaliacao) acoes.push(avaliacao);
  if (status !== "pendente") {
    acoes.push(acaoBotao("arquivar-item", chaveArquivo("candidatura", item.id), "Arquivar", "arquivar"));
  }
  return cardBase({
    tipo: "Candidato ao clube",
    titulo: item.jogadorNome || "Jogador",
    status,
    resumo: `${item.jogadorNome || "Um jogador"} quer entrar no ${item.clube || "seu clube"}.`,
    meta: [`Posição: ${item.posicao || "—"}`, `OVR: ${item.overall || "—"}`],
    data: formatarData(item),
    acoes,
    reputacaoUid: item.jogadorUid,
    reputacaoTipo: "jogador",
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
  const avaliacao = acaoAvaliacao("convite", item);
  if (avaliacao) acoes.push(avaliacao);
  if (status !== "pendente") {
    acoes.push(acaoBotao("arquivar-item", chaveArquivo("convite", item.id), "Arquivar", "arquivar"));
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
    reputacaoUid: item.jogadorUid,
    reputacaoTipo: "jogador",
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
    acoes: [
      acaoLink(`./mercado.html?chat=${encodeURIComponent(item.id)}`, "Abrir conversa", "primaria"),
      acaoBotao("arquivar-item", chaveArquivo("chat", item.id), "Arquivar", "arquivar"),
    ],
    classe: naoLido ? "nao-lido" : "",
  });
}

function cardArquivado(tipo, item, papel) {
  const ehChat = tipo === "chat";
  const status = ehChat ? "aceito" : statusItem(item);
  const titulo = ehChat
    ? (item.clube || "Conversa")
    : papel === "jogador"
      ? (item.clube || "Clube")
      : (item.jogadorNome || "Jogador");
  const rotulo = ehChat
    ? "Conversa arquivada"
    : tipo === "candidatura"
      ? (papel === "jogador" ? "Candidatura arquivada" : "Candidato arquivado")
      : (papel === "jogador" ? "Convite recebido arquivado" : "Convite enviado arquivado");
  const acoes = [acaoBotao("restaurar-item", chaveArquivo(tipo, item.id), "Restaurar", "primaria")];
  const avaliacao = !ehChat ? acaoAvaliacao(tipo, item) : "";
  if (avaliacao) acoes.unshift(avaliacao);
  const reputacaoUid = ehChat
    ? ""
    : papel === "jogador"
      ? item.capitaoUid
      : item.jogadorUid;
  return cardBase({
    tipo: rotulo,
    titulo,
    status,
    resumo: "Este item está fora das listas principais apenas para você.",
    meta: [ehChat ? "Conversa" : tipo === "candidatura" ? "Candidatura" : "Convite"],
    data: formatarData(item),
    acoes,
    reputacaoUid,
    reputacaoTipo: papel === "jogador" ? "clube" : "jogador",
  });
}

function renderizar() {
  const jogadorTodos = ordenar([
    ...estado.candidaturasEnviadas.map((item) => ({ ...item, categoria: "candidatura" })),
    ...estado.convitesRecebidos.map((item) => ({ ...item, categoria: "convite" })),
  ]);
  const capitaoTodos = ordenar([
    ...estado.candidaturasRecebidas.map((item) => ({ ...item, categoria: "candidatura" })),
    ...estado.convitesEnviados.map((item) => ({ ...item, categoria: "convite" })),
  ]);
  const jogadorItens = jogadorTodos.filter((item) => !estaArquivado(item.categoria, item.id));
  const capitaoItens = capitaoTodos.filter((item) => !estaArquivado(item.categoria, item.id));
  const chatsVisiveis = ordenar(estado.chats.filter((chat) => (
    !(Array.isArray(chat.arquivadoPor) ? chat.arquivadoPor : []).includes(estado.usuario.uid)
  )));
  const chatsArquivados = estado.chats.filter((chat) => (
    (Array.isArray(chat.arquivadoPor) ? chat.arquivadoPor : []).includes(estado.usuario.uid)
  ));
  const itensArquivados = ordenar([
    ...jogadorTodos
      .filter((item) => estaArquivado(item.categoria, item.id))
      .map((item) => ({ ...item, tipoArquivo: item.categoria, papel: "jogador" })),
    ...capitaoTodos
      .filter((item) => estaArquivado(item.categoria, item.id))
      .map((item) => ({ ...item, tipoArquivo: item.categoria, papel: "capitao" })),
    ...chatsArquivados.map((item) => ({ ...item, tipoArquivo: "chat", papel: "jogador" })),
  ]);

  const pendenciasJogador = jogadorItens.filter((item) => statusItem(item) === "pendente").length;
  const pendenciasCapitao = capitaoItens.filter((item) => statusItem(item) === "pendente").length;
  const avaliacoesPendentes = [
    ...estado.candidaturasEnviadas.map((item) => ({ tipo: "candidatura", item })),
    ...estado.candidaturasRecebidas.map((item) => ({ tipo: "candidatura", item })),
    ...estado.convitesRecebidos.map((item) => ({ tipo: "convite", item })),
    ...estado.convitesEnviados.map((item) => ({ tipo: "convite", item })),
  ].filter(({ tipo, item }) => contextoAvaliacao(tipo, item.id) && !jaAvaliou(tipo, item.id)).length;
  document.getElementById("neg-metrica-jogador").textContent = String(pendenciasJogador);
  document.getElementById("neg-metrica-capitao").textContent = String(pendenciasCapitao);
  document.getElementById("neg-metrica-conversas").textContent = String(chatsVisiveis.length);
  document.getElementById("neg-metrica-arquivadas").textContent = String(itensArquivados.length);
  document.getElementById("neg-metrica-avaliacoes").textContent = String(avaliacoesPendentes);
  document.getElementById("neg-badge-jogador").textContent = String(jogadorItens.length);
  document.getElementById("neg-badge-capitao").textContent = String(capitaoItens.length);
  document.getElementById("neg-badge-conversas").textContent = String(chatsVisiveis.length);
  document.getElementById("neg-badge-arquivadas").textContent = String(itensArquivados.length);

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

  const listaArquivadas = document.getElementById("neg-lista-arquivadas");
  listaArquivadas.innerHTML = itensArquivados.length
    ? itensArquivados.map((item) => cardArquivado(item.tipoArquivo, item, item.papel)).join("")
    : vazio(
      "Nenhuma negociação arquivada.",
      "Use Arquivar nos itens encerrados ou nas conversas que não deseja manter nas listas principais.",
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
      convitesRecebidos, convitesEnviados, chats, arquivados, avaliacoesEnviadas] = await Promise.all([
      getDoc(doc(db, "jogadores", uid)),
      getDoc(doc(db, "clubes", uid)),
      getDocs(query(collection(db, "candidaturas"), where("jogadorUid", "==", uid))),
      getDocs(query(collection(db, "candidaturas"), where("capitaoUid", "==", uid))),
      getDocs(query(collection(db, "convitesClube"), where("jogadorUid", "==", uid))),
      getDocs(query(collection(db, "convitesClube"), where("capitaoUid", "==", uid))),
      getDocs(query(collection(db, "chats"), where("participantes", "array-contains", uid))),
      getDocs(query(collection(db, "negociacoesArquivadas"), where("usuarioUid", "==", uid))),
      getDocs(query(collection(db, "avaliacoes"), where("autorUid", "==", uid))),
    ]);
    if (carregamento !== estado.carregamento || auth.currentUser?.uid !== uid) return;
    estado.perfil = perfilSnap.exists() ? perfilSnap.data() : {};
    estado.clube = clubeSnap.exists() ? { id: clubeSnap.id, ...clubeSnap.data() } : null;
    estado.candidaturasEnviadas = candidaturasEnviadas.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.candidaturasRecebidas = candidaturasRecebidas.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.convitesRecebidos = convitesRecebidos.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.convitesEnviados = convitesEnviados.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.chats = chats.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.arquivados = arquivados.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.avaliacoesEnviadas = avaliacoesEnviadas.docs.map((item) => ({ id: item.id, ...item.data() }));
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

async function arquivarItem(valor) {
  const { tipo, id } = alvoArquivo(valor);
  if (!id || !["candidatura", "convite", "chat"].includes(tipo)) {
    throw new Error("Não foi possível identificar esta negociação.");
  }
  if (tipo === "chat") {
    await updateDoc(doc(db, "chats", id), { arquivadoPor: arrayUnion(estado.usuario.uid) });
  } else {
    await setDoc(doc(db, "negociacoesArquivadas", idDocumentoArquivo(tipo, id)), {
      usuarioUid: estado.usuario.uid,
      tipo,
      registroId: id,
      criadoEm: serverTimestamp(),
    });
  }
  toast("Negociação arquivada apenas para você.");
  return true;
}

async function restaurarItem(valor) {
  const { tipo, id } = alvoArquivo(valor);
  if (!id || !["candidatura", "convite", "chat"].includes(tipo)) {
    throw new Error("Não foi possível identificar esta negociação.");
  }
  if (tipo === "chat") {
    await updateDoc(doc(db, "chats", id), { arquivadoPor: arrayRemove(estado.usuario.uid) });
  } else {
    await deleteDoc(doc(db, "negociacoesArquivadas", idDocumentoArquivo(tipo, id)));
  }
  toast("Negociação restaurada.");
  return true;
}

function selecionarNotaAvaliacao(nota) {
  const valor = Number(nota);
  const campo = document.getElementById("neg-avaliacao-nota");
  if (campo) campo.value = Number.isInteger(valor) && valor >= 1 && valor <= 5 ? String(valor) : "";
  document.querySelectorAll("[data-avaliacao-nota]").forEach((botao) => {
    const selecionada = Number(botao.dataset.avaliacaoNota) <= valor;
    botao.classList.toggle("selecionada", selecionada);
    botao.setAttribute("aria-pressed", String(selecionada));
  });
}

function fecharAvaliacao() {
  const modal = document.getElementById("neg-avaliacao-modal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("neg-avaliacao-aberta");
  avaliacaoAtual = null;
}

async function abrirAvaliacao(valor) {
  const { tipo, id } = alvoArquivo(valor);
  if (!id || !["candidatura", "convite"].includes(tipo)) {
    throw new Error("Não foi possível identificar esta negociação.");
  }
  if (jaAvaliou(tipo, id)) throw new Error("Você já avaliou esta negociação.");
  const contexto = contextoAvaliacao(tipo, id);
  if (!contexto) throw new Error("Somente uma negociação aceita pode ser avaliada.");

  avaliacaoAtual = contexto;
  selecionarNotaAvaliacao(0);
  const comentario = document.getElementById("neg-avaliacao-comentario");
  if (comentario) comentario.value = "";
  const contador = document.getElementById("neg-avaliacao-contador");
  if (contador) contador.textContent = "0";
  document.getElementById("neg-avaliacao-titulo").textContent = `Avaliar ${contexto.alvoNome}`;
  document.getElementById("neg-avaliacao-descricao").textContent =
    `Esta avaliação ficará no perfil ${contexto.alvoTipo === "clube" ? "do clube" : "do jogador"} e será marcada como verificada.`;
  const modal = document.getElementById("neg-avaliacao-modal");
  modal.hidden = false;
  document.body.classList.add("neg-avaliacao-aberta");
  document.querySelector("[data-avaliacao-nota='5']")?.focus();
  return false;
}

async function enviarAvaliacao(evento) {
  evento.preventDefault();
  if (!avaliacaoAtual) return;
  const nota = Number(document.getElementById("neg-avaliacao-nota")?.value);
  const comentario = String(document.getElementById("neg-avaliacao-comentario")?.value || "").trim();
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    toast("Escolha uma nota de 1 a 5 estrelas.", "erro");
    return;
  }
  if (comentario.length > 300) {
    toast("O comentário deve ter no máximo 300 caracteres.", "erro");
    return;
  }
  if (!estado.usuario?.emailVerified) {
    toast("Confirme seu e-mail antes de enviar uma avaliação.", "erro");
    return;
  }

  const botao = evento.currentTarget.querySelector("button[type='submit']");
  const textoOriginal = botao?.textContent || "Enviar avaliação";
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Enviando...";
  }
  const contexto = avaliacaoAtual;
  try {
    await setDoc(doc(db, "avaliacoes", idDocumentoAvaliacao(contexto.tipo, contexto.id)), {
      negociacaoTipo: contexto.tipo,
      negociacaoId: contexto.id,
      autorUid: estado.usuario.uid,
      autorPapel: contexto.autorPapel,
      alvoUid: contexto.alvoUid,
      alvoTipo: contexto.alvoTipo,
      alvoNome: contexto.alvoNome,
      nota,
      comentario,
      criadoEm: serverTimestamp(),
    });
    fecharAvaliacao();
    toast("Avaliação publicada no perfil.");
    await carregarDados();
    await window.mercadoReputacao?.recarregar();
  } catch (err) {
    console.error("Erro ao enviar avaliação:", err);
    toast(err.message || "Não foi possível enviar a avaliação.", "erro");
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }
}

const ACOES = {
  "cancelar-candidatura": cancelarCandidatura,
  "reenviar-candidatura": reenviarCandidatura,
  "aceitar-candidatura": aceitarCandidatura,
  "recusar-candidatura": recusarCandidatura,
  "aceitar-convite": aceitarConvite,
  "recusar-convite": recusarConvite,
  "cancelar-convite": cancelarConvite,
  "arquivar-item": arquivarItem,
  "restaurar-item": restaurarItem,
  "avaliar-negociacao": abrirAvaliacao,
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

document.getElementById("neg-avaliacao-form")?.addEventListener("submit", enviarAvaliacao);
document.getElementById("neg-avaliacao-modal")?.addEventListener("click", (evento) => {
  const estrela = evento.target.closest("[data-avaliacao-nota]");
  if (estrela) selecionarNotaAvaliacao(estrela.dataset.avaliacaoNota);
  if (evento.target === evento.currentTarget || evento.target.closest("[data-avaliacao-fechar]")) {
    fecharAvaliacao();
  }
});
document.getElementById("neg-avaliacao-comentario")?.addEventListener("input", (evento) => {
  const contador = document.getElementById("neg-avaliacao-contador");
  if (contador) contador.textContent = String(evento.currentTarget.value.length);
});
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && !document.getElementById("neg-avaliacao-modal")?.hidden) fecharAvaliacao();
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

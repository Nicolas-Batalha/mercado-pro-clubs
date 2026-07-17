// =========================================================================
// MERCADO PRO CLUBS — torneio.js
// Área pública de torneios, inscrições de clubes e acompanhamento de chaves.
// =========================================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const estado = {
  usuario: null,
  torneios: [],
  inscricoes: new Map(),
  partidas: new Map(),
  enviosResultado: new Map(),
  aba: "aberto",
  busca: "",
  jogo: "",
  plataforma: "",
  torneioAbertoId: "",
  carregando: true,
};

const porId = (id) => document.getElementById(id);

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function texto(valor, fallback = "Não informado") {
  const resultado = String(valor ?? "").trim();
  return resultado || fallback;
}

function numero(valor, fallback = 0) {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : fallback;
}

function timestampParaMs(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  if (valor instanceof Date) return valor.getTime();
  const convertido = new Date(valor).getTime();
  return Number.isFinite(convertido) ? convertido : 0;
}

function formatarData(valor, incluirHora = false) {
  const ms = timestampParaMs(valor);
  if (!ms) return "A definir";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(incluirHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(ms));
}

function urlImagemSegura(valor) {
  const url = String(valor || "").trim();
  if (/^(https?:\/\/|data:image\/)/i.test(url)) return escaparHtml(url);
  return "../IMG/clube.svg";
}

function statusTorneio(torneio) {
  const status = normalizar(torneio.status).replaceAll(" ", "_");
  if (["andamento", "em_andamento", "iniciado"].includes(status)) return "andamento";
  if (["finalizado", "encerrado", "concluido"].includes(status)) return "finalizado";
  if (["cancelado", "cancelada"].includes(status)) return "cancelado";
  return "aberto";
}

function rotuloStatus(status) {
  return {
    aberto: "Inscrições abertas",
    andamento: "Em andamento",
    finalizado: "Finalizado",
    cancelado: "Cancelado",
  }[status] || "Inscrições abertas";
}

function rotuloPlataforma(valor) {
  return {
    ps5: "PlayStation 5",
    ps4: "PlayStation 4",
    xbox: "Xbox",
    xbox_series: "Xbox Series",
    pc: "PC",
    crossplay: "Crossplay",
  }[normalizar(valor).replaceAll(" ", "_")] || texto(valor);
}

function statusInscricao(inscricao) {
  const status = normalizar(inscricao?.status);
  if (["aprovada", "aprovado", "aceita", "aceito"].includes(status)) return "aprovada";
  if (["rejeitada", "rejeitado", "recusada", "recusado"].includes(status)) return "rejeitada";
  return "pendente";
}

function inscricoesDoTorneio(torneioId) {
  return estado.inscricoes.get(torneioId) || [];
}

function partidasDoTorneio(torneioId) {
  return estado.partidas.get(torneioId) || [];
}

function chavePartida(torneioId, partidaId) {
  return `${torneioId}/${partidaId}`;
}

function enviosDaPartida(torneioId, partidaId) {
  return estado.enviosResultado.get(chavePartida(torneioId, partidaId)) || [];
}

function usuarioParticipaDaPartida(partida) {
  if (!estado.usuario) return false;
  const uid = String(estado.usuario.uid);
  return uid === String(partida.timeAId || "") || uid === String(partida.timeBId || "");
}

function meuEnvioDaPartida(torneioId, partidaId) {
  if (!estado.usuario) return null;
  return enviosDaPartida(torneioId, partidaId).find(
    (envio) => String(envio.id || envio.capitaoUid) === String(estado.usuario.uid),
  ) || null;
}

function analisarEnviosResultado(torneioId, partidaId) {
  const unicos = new Map();
  enviosDaPartida(torneioId, partidaId).forEach((envio) => {
    const uid = String(envio.capitaoUid || envio.id || "");
    if (uid) unicos.set(uid, envio);
  });
  const envios = [...unicos.values()];
  const consenso = envios.length >= 2
    && numero(envios[0].placarA, -1) === numero(envios[1].placarA, -2)
    && numero(envios[0].placarB, -1) === numero(envios[1].placarB, -2);
  return {
    envios,
    consenso,
    divergente: envios.length >= 2 && !consenso,
  };
}

function inscricoesAprovadas(torneioId) {
  return inscricoesDoTorneio(torneioId).filter((item) => statusInscricao(item) === "aprovada");
}

function minhaInscricao(torneioId) {
  if (!estado.usuario) return null;
  return inscricoesDoTorneio(torneioId).find(
    (item) => item.id === estado.usuario.uid || item.capitaoUid === estado.usuario.uid,
  ) || null;
}

function toast(mensagem, tipo = "sucesso") {
  const elemento = porId("torneios-toast");
  if (!elemento) return;
  elemento.textContent = mensagem;
  elemento.classList.toggle("erro", tipo === "erro");
  elemento.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    elemento.hidden = true;
  }, 4200);
}

function mostrarEstado(titulo, mensagem, carregando = false) {
  const grid = porId("torneios-grid");
  if (!grid) return;
  grid.setAttribute("aria-busy", carregando ? "true" : "false");
  grid.innerHTML = `
    <div class="torneios-estado">
      ${carregando ? '<span class="torneios-carregando" aria-hidden="true"></span>' : ""}
      <strong>${escaparHtml(titulo)}</strong>
      <p>${escaparHtml(mensagem)}</p>
    </div>
  `;
}

async function carregarSubcolecao(torneioId, nome) {
  try {
    const snapshot = await getDocs(collection(db, "torneios", torneioId, nome));
    return snapshot.docs.map((registro) => ({ id: registro.id, ...registro.data() }));
  } catch (erro) {
    console.warn(`Não foi possível carregar ${nome} do torneio ${torneioId}.`, erro);
    return [];
  }
}

async function carregarEnviosDaPartida(torneioId, partida) {
  if (!estado.usuario || !usuarioParticipaDaPartida(partida)) return;
  const uid = estado.usuario.uid;
  const chave = chavePartida(torneioId, partida.id);
  const referenciaPropria = doc(
    db,
    "torneios",
    torneioId,
    "partidas",
    partida.id,
    "envios",
    uid,
  );

  try {
    const proprioSnapshot = await getDoc(referenciaPropria);
    if (!proprioSnapshot.exists()) {
      estado.enviosResultado.set(chave, []);
      return;
    }

    const snapshot = await getDocs(
      collection(db, "torneios", torneioId, "partidas", partida.id, "envios"),
    );
    estado.enviosResultado.set(
      chave,
      snapshot.docs.map((registro) => ({ id: registro.id, ...registro.data() })),
    );
  } catch (erro) {
    console.warn(`Nao foi possivel carregar os envios da partida ${partida.id}.`, erro);
    estado.enviosResultado.set(chave, []);
  }
}

async function carregarEnviosPermitidos() {
  if (!estado.usuario) return;
  const tarefas = estado.torneios.flatMap((torneio) =>
    partidasDoTorneio(torneio.id)
      .filter(usuarioParticipaDaPartida)
      .map((partida) => carregarEnviosDaPartida(torneio.id, partida)),
  );
  await Promise.all(tarefas);
}

async function carregarTorneios() {
  estado.carregando = true;
  estado.inscricoes = new Map();
  estado.partidas = new Map();
  estado.enviosResultado = new Map();
  mostrarEstado("Buscando competições...", "Estamos organizando o calendário de torneios.", true);

  try {
    const snapshot = await getDocs(collection(db, "torneios"));
    estado.torneios = snapshot.docs
      .map((registro) => ({ id: registro.id, ...registro.data() }))
      .sort((a, b) => {
        const dataA = timestampParaMs(a.dataInicio) || timestampParaMs(a.criadoEm);
        const dataB = timestampParaMs(b.dataInicio) || timestampParaMs(b.criadoEm);
        return dataA - dataB;
      });

    await Promise.all(
      estado.torneios.map(async (torneio) => {
        const [inscricoes, partidas] = await Promise.all([
          carregarSubcolecao(torneio.id, "inscricoes"),
          carregarSubcolecao(torneio.id, "partidas"),
        ]);
        estado.inscricoes.set(torneio.id, inscricoes);
        estado.partidas.set(torneio.id, partidas);
      }),
    );
    await carregarEnviosPermitidos();
  } catch (erro) {
    console.error("Erro ao carregar torneios:", erro);
    estado.torneios = [];
    toast("Não foi possível carregar os torneios agora.", "erro");
  } finally {
    estado.carregando = false;
    renderizarTudo();
  }
}

function atualizarMetricas() {
  const abertos = estado.torneios.filter((item) => statusTorneio(item) === "aberto").length;
  const andamento = estado.torneios.filter((item) => statusTorneio(item) === "andamento").length;
  const clubes = new Set(
    estado.torneios.flatMap((torneio) =>
      inscricoesAprovadas(torneio.id).map((inscricao) => inscricao.clubeId || inscricao.capitaoUid || inscricao.id),
    ),
  ).size;

  porId("torneios-total-abertos").textContent = String(abertos);
  porId("torneios-total-andamento").textContent = String(andamento);
  porId("torneios-total-clubes").textContent = String(clubes);
}

function torneiosFiltrados() {
  return estado.torneios.filter((torneio) => {
    const status = statusTorneio(torneio);
    const correspondeAba = estado.aba === "meus"
      ? Boolean(minhaInscricao(torneio.id))
      : status === estado.aba;
    const alvoBusca = normalizar(`${torneio.nome || ""} ${torneio.organizadorNome || ""} ${torneio.descricao || ""}`);
    const correspondeBusca = !estado.busca || alvoBusca.includes(normalizar(estado.busca));
    const correspondeJogo = !estado.jogo || normalizar(torneio.jogo) === normalizar(estado.jogo);
    const correspondePlataforma = !estado.plataforma
      || normalizar(torneio.plataforma).replaceAll(" ", "_") === normalizar(estado.plataforma).replaceAll(" ", "_");
    return correspondeAba && correspondeBusca && correspondeJogo && correspondePlataforma;
  });
}

function cardTorneio(torneio) {
  const status = statusTorneio(torneio);
  const aprovadas = inscricoesAprovadas(torneio.id).length;
  const maximo = Math.max(2, numero(torneio.maxClubes, 16));
  const percentual = Math.min(100, Math.round((aprovadas / maximo) * 100));
  const minha = minhaInscricao(torneio.id);
  const statusMinha = minha ? statusInscricao(minha) : "";

  return `
    <article class="torneio-card">
      <div class="torneio-card-topo">
        <span class="torneio-status torneio-status-${status}">${rotuloStatus(status)}</span>
        ${minha ? `<span class="torneio-status torneio-status-${statusMinha}">Minha inscrição: ${statusMinha}</span>` : ""}
      </div>
      <h3>${escaparHtml(texto(torneio.nome, "Torneio de Pro Clubs"))}</h3>
      <p class="torneio-card-organizador">Organizado por ${escaparHtml(texto(torneio.organizadorNome, "Mercado Pro Clubs"))}</p>
      <p class="torneio-card-descricao">${escaparHtml(texto(torneio.descricao, "Competição aberta para clubes da comunidade."))}</p>
      <div class="torneio-card-meta">
        <span class="torneio-chip">${escaparHtml(texto(torneio.jogo, "EA FC"))}</span>
        <span class="torneio-chip">${escaparHtml(rotuloPlataforma(torneio.plataforma))}</span>
        <span class="torneio-chip">${escaparHtml(texto(torneio.formato, "Mata-mata"))}</span>
        <span class="torneio-chip">${escaparHtml(texto(torneio.regiao, "Todas as regiões"))}</span>
      </div>
      <div class="torneio-progresso">
        <div class="torneio-progresso-info"><span>Clubes confirmados</span><strong>${aprovadas}/${maximo}</strong></div>
        <div class="torneio-progresso-barra"><span style="width:${percentual}%"></span></div>
      </div>
      <div class="torneio-card-rodape">
        <span class="torneio-card-data">${status === "aberto" ? "Inscrições até" : "Início"}<br><strong>${formatarData(status === "aberto" ? torneio.inscricoesAte : torneio.dataInicio)}</strong></span>
        <button type="button" class="torneio-btn torneio-btn-primario" data-torneio-acao="detalhes" data-torneio-id="${escaparHtml(torneio.id)}">Ver detalhes</button>
      </div>
    </article>
  `;
}

function renderizarTorneios() {
  if (estado.carregando) return;
  const grid = porId("torneios-grid");
  const lista = torneiosFiltrados();
  grid.setAttribute("aria-busy", "false");
  porId("torneios-contagem").textContent = `${lista.length} ${lista.length === 1 ? "torneio encontrado" : "torneios encontrados"}`;

  if (!lista.length) {
    const mensagem = estado.aba === "meus" && !estado.usuario
      ? "Entre na sua conta para acompanhar as inscrições do seu clube."
      : "Nenhum torneio corresponde a esta seleção no momento.";
    mostrarEstado("Nada por aqui ainda", mensagem);
    return;
  }

  grid.innerHTML = lista.map(cardTorneio).join("");
}

function inscricaoItem(inscricao) {
  return `
    <div class="torneio-inscricao-item">
      <div class="torneio-inscricao-clube">
        <img src="${urlImagemSegura(inscricao.clubeEscudo)}" alt="" loading="lazy" />
        <strong>${escaparHtml(texto(inscricao.clubeNome, "Clube participante"))}</strong>
      </div>
      <span class="torneio-status torneio-status-aprovada">Confirmado</span>
    </div>
  `;
}

function partidaItem(torneioId, partida) {
  const placarA = partida.placarA ?? partida.golsA ?? "—";
  const placarB = partida.placarB ?? partida.golsB ?? "—";
  const vencedor = String(partida.vencedorId || "");
  const timeAId = String(partida.timeAId || partida.clubeAId || "");
  const timeBId = String(partida.timeBId || partida.clubeBId || "");
  const finalizada = normalizar(partida.status) === "finalizado";
  const participante = usuarioParticipaDaPartida(partida);
  const meuEnvio = meuEnvioDaPartida(torneioId, partida.id);
  const analise = analisarEnviosResultado(torneioId, partida.id);
  let mensagemResultado = "Aguardando envio dos capitães";
  let classeResultado = "aguardando";

  if (finalizada) {
    mensagemResultado = "Resultado homologado";
    classeResultado = "homologado";
  } else if (participante && analise.consenso) {
    mensagemResultado = "Placares conferem — aguardando homologação";
    classeResultado = "consenso";
  } else if (participante && analise.divergente) {
    mensagemResultado = "Placares divergentes — análise administrativa";
    classeResultado = "divergente";
  } else if (participante && meuEnvio) {
    mensagemResultado = "Seu placar foi enviado — aguardando o adversário";
    classeResultado = "enviado";
  }

  const formulario = participante && !finalizada ? `
    <form class="torneio-resultado-form" data-torneio-resultado-form data-torneio-id="${escaparHtml(torneioId)}" data-partida-id="${escaparHtml(partida.id)}">
      <strong>Enviar placar da partida</strong>
      <div class="torneio-resultado-campos">
        <label>
          <span>${escaparHtml(texto(partida.timeANome, "Clube A"))}</span>
          <input type="number" name="placarA" min="0" max="99" inputmode="numeric" required value="${meuEnvio?.placarA ?? ""}" aria-label="Gols de ${escaparHtml(texto(partida.timeANome, "Clube A"))}">
        </label>
        <b>×</b>
        <label>
          <span>${escaparHtml(texto(partida.timeBNome, "Clube B"))}</span>
          <input type="number" name="placarB" min="0" max="99" inputmode="numeric" required value="${meuEnvio?.placarB ?? ""}" aria-label="Gols de ${escaparHtml(texto(partida.timeBNome, "Clube B"))}">
        </label>
      </div>
      <label class="torneio-resultado-observacao">
        <span>Observação opcional</span>
        <textarea name="observacao" rows="2" maxlength="240" placeholder="Ex.: vitória nos pênaltis, W.O. ou informação para o administrador">${escaparHtml(meuEnvio?.observacao || "")}</textarea>
      </label>
      <p>O resultado só se torna oficial depois da homologação administrativa.</p>
      <button type="submit" class="torneio-btn torneio-btn-primario">${meuEnvio ? "Atualizar meu placar" : "Enviar meu placar"}</button>
    </form>
  ` : "";

  return `
    <article class="torneio-partida">
      <div class="torneio-partida-time ${vencedor && vencedor === timeAId ? "vencedor" : ""}">
        <span>${escaparHtml(texto(partida.timeANome || partida.clubeANome, "A definir"))}</span><strong>${escaparHtml(placarA)}</strong>
      </div>
      <div class="torneio-partida-time ${vencedor && vencedor === timeBId ? "vencedor" : ""}">
        <span>${escaparHtml(texto(partida.timeBNome || partida.clubeBNome, "A definir"))}</span><strong>${escaparHtml(placarB)}</strong>
      </div>
      <span class="torneio-partida-status ${classeResultado}">${escaparHtml(mensagemResultado)}</span>
      ${formulario}
    </article>
  `;
}

function bracketHtml(torneioId) {
  const partidas = [...partidasDoTorneio(torneioId)].sort((a, b) => {
    const rodada = numero(a.rodada, 1) - numero(b.rodada, 1);
    return rodada || numero(a.ordem, 0) - numero(b.ordem, 0);
  });
  if (!partidas.length) return '<p>A chave será publicada quando o torneio começar.</p>';

  const rodadas = new Map();
  partidas.forEach((partida) => {
    const rodada = numero(partida.rodada, 1);
    if (!rodadas.has(rodada)) rodadas.set(rodada, []);
    rodadas.get(rodada).push(partida);
  });
  const totalRodadas = Math.max(
    ...rodadas.keys(),
    ...partidas.map((partida) => numero(partida.totalRodadas, 1)),
  );

  return `<div class="torneio-bracket">${[...rodadas.entries()].map(([rodada, jogos]) => {
    const titulo = rodada === totalRodadas ? "Final" : totalRodadas - rodada === 1 ? "Semifinal" : `Rodada ${rodada}`;
    return `<section class="torneio-rodada"><h4>${titulo}</h4><div class="torneio-partidas">${jogos.map((partida) => partidaItem(torneioId, partida)).join("")}</div></section>`;
  }).join("")}</div>`;
}

function botoesInscricao(torneio) {
  const status = statusTorneio(torneio);
  const minha = minhaInscricao(torneio.id);
  if (status !== "aberto") return "";
  if (!estado.usuario) {
    return '<a class="torneio-btn torneio-btn-primario" href="./cadastrar-se.html">Entrar para inscrever meu clube</a>';
  }
  if (!minha) {
    const lotado = inscricoesAprovadas(torneio.id).length >= Math.max(2, numero(torneio.maxClubes, 16));
    return `<button type="button" class="torneio-btn torneio-btn-primario" data-torneio-acao="inscrever" data-torneio-id="${escaparHtml(torneio.id)}" ${lotado ? "disabled" : ""}>${lotado ? "Vagas preenchidas" : "Inscrever meu clube"}</button>`;
  }
  const statusAtual = statusInscricao(minha);
  if (statusAtual === "pendente") {
    return `<button type="button" class="torneio-btn torneio-btn-perigo" data-torneio-acao="cancelar-inscricao" data-torneio-id="${escaparHtml(torneio.id)}">Cancelar inscrição pendente</button>`;
  }
  return `<span class="torneio-status torneio-status-${statusAtual}">Inscrição ${statusAtual}</span>`;
}

function abrirDetalhes(torneioId) {
  const torneio = estado.torneios.find((item) => item.id === torneioId);
  if (!torneio) return;
  estado.torneioAbertoId = torneioId;
  const status = statusTorneio(torneio);
  const aprovadas = inscricoesAprovadas(torneioId);
  const conteudo = porId("torneio-modal-conteudo");

  conteudo.innerHTML = `
    <div class="torneio-detalhe-topo">
      <div>
        <span class="torneio-status torneio-status-${status}">${rotuloStatus(status)}</span>
        <h2 id="torneio-modal-titulo">${escaparHtml(texto(torneio.nome, "Torneio de Pro Clubs"))}</h2>
        <p>Organizado por ${escaparHtml(texto(torneio.organizadorNome, "Mercado Pro Clubs"))}</p>
      </div>
    </div>
    <p class="torneio-detalhe-descricao">${escaparHtml(texto(torneio.descricao, "Competição da comunidade Mercado Pro Clubs."))}</p>
    ${status === "finalizado" && torneio.campeaoNome ? `
      <section class="torneio-campeao" aria-label="Clube campeão">
        <img src="${urlImagemSegura(torneio.campeaoEscudo)}" alt="" loading="lazy">
        <div><span>CAMPEÃO</span><strong>${escaparHtml(torneio.campeaoNome)}</strong></div>
      </section>
    ` : ""}
    <div class="torneio-detalhe-meta">
      <span class="torneio-chip">Jogo: ${escaparHtml(texto(torneio.jogo, "EA FC"))}</span>
      <span class="torneio-chip">Plataforma: ${escaparHtml(rotuloPlataforma(torneio.plataforma))}</span>
      <span class="torneio-chip">Formato: ${escaparHtml(texto(torneio.formato, "Mata-mata"))}</span>
      <span class="torneio-chip">Região: ${escaparHtml(texto(torneio.regiao, "Todas"))}</span>
      <span class="torneio-chip">Início: ${formatarData(torneio.dataInicio, true)}</span>
      ${torneio.premio ? `<span class="torneio-chip">Prêmio: ${escaparHtml(torneio.premio)}</span>` : ""}
    </div>
    <section class="torneio-detalhe-bloco">
      <h3>Clubes confirmados (${aprovadas.length}/${Math.max(2, numero(torneio.maxClubes, 16))})</h3>
      <div class="torneio-inscricoes-lista">
        ${aprovadas.length ? aprovadas.map(inscricaoItem).join("") : "<p>Nenhum clube confirmado até agora.</p>"}
      </div>
    </section>
    <section class="torneio-detalhe-bloco">
      <h3>Chave e resultados</h3>
      ${bracketHtml(torneioId)}
    </section>
    <section class="torneio-detalhe-bloco">
      <h3>Regulamento</h3>
      <p>${escaparHtml(texto(torneio.regulamento, "O regulamento completo será informado pela organização antes do início."))}</p>
    </section>
    <div class="torneio-detalhe-acoes">${botoesInscricao(torneio)}</div>
  `;

  const modal = porId("torneio-modal");
  modal.hidden = false;
  document.body.classList.add("modal-aberto");
  porId("torneio-modal-fechar")?.focus();
}

function fecharDetalhes() {
  porId("torneio-modal").hidden = true;
  document.body.classList.remove("modal-aberto");
  estado.torneioAbertoId = "";
}

async function inscreverClube(torneioId, botao) {
  if (!estado.usuario) {
    window.location.href = "./cadastrar-se.html";
    return;
  }

  const torneio = estado.torneios.find((item) => item.id === torneioId);
  if (!torneio || statusTorneio(torneio) !== "aberto") {
    toast("As inscrições deste torneio não estão abertas.", "erro");
    return;
  }

  botao.disabled = true;
  const rotuloOriginal = botao.textContent;
  botao.textContent = "Verificando clube...";

  try {
    const clubeSnapshot = await getDoc(doc(db, "clubes", estado.usuario.uid));
    if (!clubeSnapshot.exists()) {
      toast("Para se inscrever, primeiro crie seu clube na aba Meu Clube.", "erro");
      return;
    }

    const clube = clubeSnapshot.data();
    if (clube.bloqueado === true || clube.suspenso === true) {
      toast("Este clube está impedido de participar no momento.", "erro");
      return;
    }

    const inscricao = {
      torneioId,
      clubeId: estado.usuario.uid,
      capitaoUid: estado.usuario.uid,
      clubeNome: texto(clube.clube || clube.nome, "Clube sem nome"),
      clubeEscudo: String(clube.escudoUrl || clube.logoUrl || ""),
      plataforma: String(clube.plataforma || ""),
      regiao: String(clube.regiao || ""),
      status: "pendente",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    };

    await setDoc(doc(db, "torneios", torneioId, "inscricoes", estado.usuario.uid), inscricao);
    estado.inscricoes.set(torneioId, [
      ...inscricoesDoTorneio(torneioId).filter((item) => item.id !== estado.usuario.uid),
      { id: estado.usuario.uid, ...inscricao, criadoEm: new Date() },
    ]);
    toast("Inscrição enviada! O administrador fará a análise.");
    renderizarTudo();
    abrirDetalhes(torneioId);
  } catch (erro) {
    console.error("Erro ao enviar inscrição:", erro);
    toast("Não foi possível enviar a inscrição. Confira as regras do Firebase.", "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = rotuloOriginal;
  }
}

async function cancelarInscricao(torneioId, botao) {
  if (!estado.usuario) return;
  const inscricao = minhaInscricao(torneioId);
  if (!inscricao || statusInscricao(inscricao) !== "pendente") return;
  if (!window.confirm("Deseja cancelar esta inscrição pendente?")) return;

  botao.disabled = true;
  try {
    await deleteDoc(doc(db, "torneios", torneioId, "inscricoes", estado.usuario.uid));
    estado.inscricoes.set(
      torneioId,
      inscricoesDoTorneio(torneioId).filter((item) => item.id !== estado.usuario.uid),
    );
    toast("Inscrição cancelada.");
    renderizarTudo();
    abrirDetalhes(torneioId);
  } catch (erro) {
    console.error("Erro ao cancelar inscrição:", erro);
    toast("Não foi possível cancelar a inscrição.", "erro");
  } finally {
    botao.disabled = false;
  }
}

async function enviarResultado(torneioId, partidaId, formulario) {
  if (!estado.usuario) {
    window.location.href = "./cadastrar-se.html";
    return;
  }

  const torneio = estado.torneios.find((item) => item.id === torneioId);
  const partida = partidasDoTorneio(torneioId).find((item) => item.id === partidaId);
  if (!torneio || statusTorneio(torneio) !== "andamento" || !partida) {
    toast("Esta partida não está disponível para envio de resultado.", "erro");
    return;
  }
  if (!usuarioParticipaDaPartida(partida) || normalizar(partida.status) === "finalizado") {
    toast("Somente os capitães desta partida podem enviar o placar.", "erro");
    return;
  }

  const placarA = numero(new FormData(formulario).get("placarA"), -1);
  const placarB = numero(new FormData(formulario).get("placarB"), -1);
  const observacao = String(new FormData(formulario).get("observacao") || "").trim().slice(0, 240);
  if (!Number.isInteger(placarA) || !Number.isInteger(placarB) || placarA < 0 || placarB < 0 || placarA > 99 || placarB > 99) {
    toast("Informe um placar válido entre 0 e 99.", "erro");
    return;
  }
  if (placarA === placarB) {
    toast("Partidas de mata-mata não podem terminar empatadas. Informe o placar após o desempate.", "erro");
    return;
  }

  const botao = formulario.querySelector('button[type="submit"]');
  const meuEnvio = meuEnvioDaPartida(torneioId, partidaId);
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Enviando...";
  }

  try {
    await setDoc(
      doc(db, "torneios", torneioId, "partidas", partidaId, "envios", estado.usuario.uid),
      {
        capitaoUid: estado.usuario.uid,
        clubeId: estado.usuario.uid,
        placarA,
        placarB,
        observacao,
        status: "enviado",
        criadoEm: meuEnvio?.criadoEm || serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      },
    );
    await carregarEnviosDaPartida(torneioId, partida);
    toast(meuEnvio ? "Seu placar foi atualizado." : "Placar enviado. Agora aguardamos o adversário.");
    renderizarTudo();
  } catch (erro) {
    console.error("Erro ao enviar resultado:", erro);
    toast("Não foi possível enviar o placar. Confirme sua conta e tente novamente.", "erro");
    if (botao) {
      botao.disabled = false;
      botao.textContent = meuEnvio ? "Atualizar meu placar" : "Enviar meu placar";
    }
  }
}

function renderizarTudo() {
  atualizarMetricas();
  renderizarTorneios();
  if (estado.torneioAbertoId) abrirDetalhes(estado.torneioAbertoId);
}

function configurarEventos() {
  document.querySelectorAll("[data-torneio-aba]").forEach((botao) => {
    botao.addEventListener("click", () => {
      estado.aba = botao.dataset.torneioAba;
      document.querySelectorAll("[data-torneio-aba]").forEach((item) => {
        const ativo = item === botao;
        item.classList.toggle("ativa", ativo);
        item.setAttribute("aria-selected", ativo ? "true" : "false");
      });
      renderizarTorneios();
    });
  });

  porId("torneios-busca")?.addEventListener("input", (evento) => {
    estado.busca = evento.target.value;
    renderizarTorneios();
  });
  porId("torneios-filtro-jogo")?.addEventListener("change", (evento) => {
    estado.jogo = evento.target.value;
    renderizarTorneios();
  });
  porId("torneios-filtro-plataforma")?.addEventListener("change", (evento) => {
    estado.plataforma = evento.target.value;
    renderizarTorneios();
  });

  document.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-torneio-acao]");
    if (!botao) return;
    const torneioId = botao.dataset.torneioId;
    const acao = botao.dataset.torneioAcao;
    if (acao === "detalhes") abrirDetalhes(torneioId);
    if (acao === "inscrever") inscreverClube(torneioId, botao);
    if (acao === "cancelar-inscricao") cancelarInscricao(torneioId, botao);
  });

  document.addEventListener("submit", (evento) => {
    const formulario = evento.target.closest("[data-torneio-resultado-form]");
    if (!formulario) return;
    evento.preventDefault();
    enviarResultado(
      formulario.dataset.torneioId,
      formulario.dataset.partidaId,
      formulario,
    );
  });

  porId("torneio-modal-fechar")?.addEventListener("click", fecharDetalhes);
  porId("torneio-modal")?.addEventListener("click", (evento) => {
    if (evento.target === evento.currentTarget) fecharDetalhes();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !porId("torneio-modal")?.hidden) fecharDetalhes();
  });
}

configurarEventos();
onAuthStateChanged(auth, async (usuario) => {
  estado.usuario = usuario;
  estado.enviosResultado = new Map();
  await carregarEnviosPermitidos();
  renderizarTudo();
});
carregarTorneios();

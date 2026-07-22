// =========================================================================
// MERCADO PRO CLUBS — admin.js
// Painel privado para consulta e moderação do conteúdo da plataforma.
// A interface verifica admins/{uid}; as regras do Firestore são a proteção real.
// =========================================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { confirmModal } from "./confirm-modal.js";

const NOMES_COLECOES = {
  jogadores: "jogadores",
  privados: "jogadoresPrivados",
  clubes: "clubes",
  vagas: "vagas",
  denuncias: "denuncias",
  candidaturas: "candidaturas",
  convites: "convitesClube",
  avaliacoes: "avaliacoes",
  logs: "logsAdmin",
  torneios: "torneios",
};

const ROTULOS_POSICAO = {
  gk: "Goleiro",
  zag: "Zagueiro",
  lat: "Lateral",
  vol: "Volante",
  mei: "Meia",
  ponta: "Ponta",
  ata: "Atacante",
  psd: "Qualquer posição",
};

const ROTULOS_PLATAFORMA = {
  ps5: "PlayStation 5",
  ps4: "PlayStation 4",
  xbox: "Xbox",
  xbox_series: "Xbox Series",
  pc: "PC",
  crossplay: "Crossplay",
};

const ROTULOS_MOTIVO_DENUNCIA = {
  spam: "Spam ou anúncio repetido",
  ofensivo: "Conteúdo ofensivo ou discriminatório",
  falso: "Informação falsa ou enganosa",
  golpe: "Suspeita de golpe",
  inadequado: "Conteúdo inadequado",
  outro: "Outro motivo",
};

const estado = {
  usuario: null,
  config: {},
  podeModerar: false,
  carregamento: 0,
  dados: {
    jogadores: [],
    privados: [],
    clubes: [],
    vagas: [],
    denuncias: [],
    candidaturas: [],
    convites: [],
    avaliacoes: [],
    logs: [],
    torneios: [],
  },
  inscricoesTorneio: new Map(),
  partidasTorneio: new Map(),
  enviosResultadoTorneio: new Map(),
  torneioModalId: "",
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

function texto(valor, fallback = "Não informado") {
  const resultado = String(valor ?? "").trim();
  return resultado || fallback;
}

function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function uidValido(valor) {
  const uid = String(valor || "").trim();
  return uid.length > 5 && !["undefined", "null", "—"].includes(uid.toLowerCase());
}

function timestampParaMs(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  if (valor instanceof Date) return valor.getTime();
  const convertido = new Date(valor).getTime();
  return Number.isFinite(convertido) ? convertido : 0;
}

function dataDoRegistro(registro) {
  return timestampParaMs(
    registro?.criadoEm || registro?.atualizadoEm || registro?.analisadaEm || registro?.resolvidaEm,
  );
}

function formatarData(valor, incluirHora = true) {
  const ms = timestampParaMs(valor);
  if (!ms) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(incluirHora ? { timeStyle: "short" } : {}),
  }).format(new Date(ms));
}

function dataParaInput(valor) {
  const ms = timestampParaMs(valor);
  if (!ms) return "";
  const data = new Date(ms);
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function numero(valor, fallback = 0) {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : fallback;
}

function statusTorneio(torneio) {
  const status = normalizar(torneio?.status).replaceAll(" ", "_");
  if (["andamento", "em_andamento", "iniciado"].includes(status)) return "andamento";
  if (["finalizado", "concluido"].includes(status)) return "finalizado";
  if (status === "cancelado") return "cancelado";
  if (["encerrado", "inscricoes_encerradas"].includes(status)) return "encerrado";
  const limite = timestampParaMs(torneio?.inscricoesAte);
  if (limite > 0 && Date.now() > limite) return "encerrado";
  return "aberto";
}

function statusInscricaoTorneio(inscricao) {
  const status = normalizar(inscricao?.status);
  if (["aprovada", "aprovado", "aceita", "aceito"].includes(status)) return "aprovada";
  if (["rejeitada", "rejeitado", "recusada", "recusado"].includes(status)) return "rejeitada";
  return "pendente";
}

function inscricoesDoTorneio(torneioId) {
  return estado.inscricoesTorneio.get(torneioId) || [];
}

function partidasDoTorneio(torneioId) {
  return estado.partidasTorneio.get(torneioId) || [];
}

function chavePartidaTorneio(torneioId, partidaId) {
  return `${torneioId}:${partidaId}`;
}

function enviosDaPartidaTorneio(torneioId, partidaId) {
  return estado.enviosResultadoTorneio.get(chavePartidaTorneio(torneioId, partidaId)) || [];
}

function analisarEnviosPartida(torneioId, partidaId) {
  const envios = enviosDaPartidaTorneio(torneioId, partidaId);
  if (envios.length < 2) return { tipo: envios.length ? "unico" : "nenhum", envios };
  const [primeiro, segundo] = envios;
  const iguais = numero(primeiro.placarA, -1) === numero(segundo.placarA, -1)
    && numero(primeiro.placarB, -1) === numero(segundo.placarB, -1);
  return { tipo: iguais ? "consenso" : "divergencia", envios };
}

function rotuloStatusTorneio(status) {
  return {
    aberto: "Inscrições abertas",
    encerrado: "Inscrições encerradas",
    andamento: "Em andamento",
    finalizado: "Finalizado",
    cancelado: "Cancelado",
  }[status] || "Inscrições abertas";
}

function ordenarRecentes(lista) {
  return [...lista].sort((a, b) => dataDoRegistro(b) - dataDoRegistro(a));
}

function rotuloPosicao(valor) {
  return ROTULOS_POSICAO[normalizar(valor)] || texto(valor);
}

function rotuloPlataforma(valor) {
  const chave = normalizar(valor).replaceAll(" ", "_").replaceAll("-", "_");
  return ROTULOS_PLATAFORMA[chave] || texto(valor);
}

function statusDenuncia(denuncia) {
  const status = normalizar(denuncia?.status || "pendente");
  if (["analisada", "analisado"].includes(status)) return "analisada";
  if (["resolvida", "resolvido"].includes(status)) return "resolvida";
  if (["descartada", "descartado"].includes(status)) return "descartada";
  return "pendente";
}

function estaPendente(denuncia) {
  return statusDenuncia(denuncia) === "pendente" && denuncia?.arquivada !== true;
}

function estaArquivada(denuncia) {
  return denuncia?.arquivada === true;
}

function toast(mensagem, tipo = "sucesso") {
  document.querySelector(".admin-toast")?.remove();
  const aviso = document.createElement("div");
  aviso.className = `admin-toast${tipo === "erro" ? " erro" : ""}`;
  aviso.setAttribute("role", tipo === "erro" ? "alert" : "status");
  aviso.setAttribute("aria-live", "polite");
  aviso.textContent = mensagem;
  document.body.appendChild(aviso);
  window.setTimeout(() => aviso.remove(), 4200);
}

function solicitarMotivo({ titulo, mensagem, confirmar = "Confirmar", destrutivo = false }) {
  return new Promise((resolve) => {
    document.getElementById("admin-motivo-modal")?.remove();
    const focoAnterior = document.activeElement;
    const overlay = document.createElement("div");
    overlay.id = "admin-motivo-modal";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-confirm-box" role="dialog" aria-modal="true" aria-labelledby="admin-motivo-titulo">
        <h3 id="admin-motivo-titulo" class="modal-confirm-titulo"></h3>
        <p class="modal-confirm-mensagem"></p>
        <div class="admin-motivo-campo">
          <label for="admin-motivo-texto">Motivo da ação</label>
          <textarea id="admin-motivo-texto" maxlength="300" placeholder="Explique o motivo com pelo menos 5 caracteres."></textarea>
          <span class="admin-motivo-contador">0/300</span>
        </div>
        <div class="modal-confirm-acoes">
          <button type="button" class="modal-confirm-cancelar">Cancelar</button>
          <button type="button" class="modal-confirm-confirmar${destrutivo ? " destrutivo" : ""}" disabled></button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".modal-confirm-titulo").textContent = titulo;
    overlay.querySelector(".modal-confirm-mensagem").textContent = mensagem;
    const textarea = overlay.querySelector("textarea");
    const contador = overlay.querySelector(".admin-motivo-contador");
    const botaoCancelar = overlay.querySelector(".modal-confirm-cancelar");
    const botaoConfirmar = overlay.querySelector(".modal-confirm-confirmar");
    botaoConfirmar.textContent = confirmar;

    let finalizado = false;
    const finalizar = (valor) => {
      if (finalizado) return;
      finalizado = true;
      document.removeEventListener("keydown", aoTeclar);
      overlay.remove();
      if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) focoAnterior.focus();
      resolve(valor);
    };
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") finalizar("");
    };
    textarea.addEventListener("input", () => {
      const motivo = textarea.value.trim();
      contador.textContent = `${textarea.value.length}/300`;
      botaoConfirmar.disabled = motivo.length < 5;
    });
    botaoCancelar.addEventListener("click", () => finalizar(""));
    botaoConfirmar.addEventListener("click", () => finalizar(textarea.value.trim()));
    overlay.addEventListener("click", (evento) => {
      if (evento.target === overlay) finalizar("");
    });
    document.addEventListener("keydown", aoTeclar);
    textarea.focus();
  });
}

function mostrarAcesso(titulo, mensagem, mostrarLogin = false) {
  const container = porId("admin-estado-acesso");
  if (!container) return;
  container.hidden = false;
  container.replaceChildren();

  const h1 = document.createElement("h1");
  h1.textContent = titulo;
  const p = document.createElement("p");
  p.textContent = mensagem;
  container.append(h1, p);

  if (mostrarLogin) {
    const link = document.createElement("a");
    link.href = "./cadastrar-se.html#login";
    link.textContent = "Entrar na minha conta";
    container.appendChild(link);
  }
}

function mostrarCarregamentoAcesso() {
  const container = porId("admin-estado-acesso");
  if (!container) return;
  container.hidden = false;
  container.innerHTML = `
    <div class="admin-carregando" aria-hidden="true"></div>
    <h1>Verificando acesso</h1>
    <p>Aguarde enquanto confirmamos sua permissão administrativa.</p>`;
}

async function carregarColecao(chave) {
  try {
    const snap = await getDocs(collection(db, NOMES_COLECOES[chave]));
    return { chave, itens: snap.docs.map((item) => ({ id: item.id, ...item.data() })) };
  } catch (erro) {
    console.error(`Erro ao carregar ${NOMES_COLECOES[chave]}:`, erro);
    return { chave, itens: [], erro };
  }
}

async function carregarSubcolecaoTorneio(torneioId, nome) {
  try {
    const snap = await getDocs(collection(db, "torneios", torneioId, nome));
    return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (erro) {
    console.error(`Erro ao carregar ${nome} do torneio ${torneioId}:`, erro);
    return [];
  }
}

async function carregarEnviosResultadoPartida(torneioId, partidaId) {
  try {
    const snap = await getDocs(collection(db, "torneios", torneioId, "partidas", partidaId, "envios"));
    return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (erro) {
    console.error(`Erro ao carregar placares da partida ${partidaId}:`, erro);
    return [];
  }
}

async function carregarDadosInternosTorneios() {
  estado.inscricoesTorneio = new Map();
  estado.partidasTorneio = new Map();
  estado.enviosResultadoTorneio = new Map();
  await Promise.all(
    estado.dados.torneios.map(async (torneio) => {
      const [inscricoes, partidas] = await Promise.all([
        carregarSubcolecaoTorneio(torneio.id, "inscricoes"),
        carregarSubcolecaoTorneio(torneio.id, "partidas"),
      ]);
      estado.inscricoesTorneio.set(torneio.id, ordenarRecentes(inscricoes));
      estado.partidasTorneio.set(torneio.id, partidas);
      await Promise.all(partidas.map(async (partida) => {
        const envios = await carregarEnviosResultadoPartida(torneio.id, partida.id);
        estado.enviosResultadoTorneio.set(
          chavePartidaTorneio(torneio.id, partida.id),
          ordenarRecentes(envios),
        );
      }));
    }),
  );
}

async function carregarDados() {
  const requisicao = ++estado.carregamento;
  const botao = porId("admin-atualizar");
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Atualizando...";
  }

  const resultados = await Promise.all(
    Object.keys(NOMES_COLECOES).map((chave) => carregarColecao(chave)),
  );

  if (requisicao !== estado.carregamento || !estado.usuario) return;

  resultados.forEach(({ chave, itens }) => {
    estado.dados[chave] = ordenarRecentes(itens);
  });

  await carregarDadosInternosTorneios();
  if (requisicao !== estado.carregamento || !estado.usuario) return;

  renderizarTudo();
  const falhas = resultados.filter((resultado) => resultado.erro);
  if (falhas.length) {
    const nomes = falhas.map(({ chave }) => NOMES_COLECOES[chave]).join(", ");
    toast(`Sem permissão para carregar: ${nomes}. Confira as regras do Firestore.`, "erro");
  }

  if (botao) {
    botao.disabled = false;
    botao.textContent = "Atualizar dados";
  }
}

function preencherMetrica(id, valor) {
  const elemento = porId(id);
  if (elemento) elemento.textContent = String(valor);
}

function registrosInvalidos() {
  const candidaturas = estado.dados.candidaturas
    .filter((item) => !uidValido(item.jogadorUid) || !uidValido(item.capitaoUid) || !texto(item.vagaId, ""))
    .map((item) => ({ ...item, colecao: "candidaturas", tipoRegistro: "Candidatura" }));
  const convites = estado.dados.convites
    .filter((item) => !uidValido(item.jogadorUid) || !uidValido(item.capitaoUid))
    .map((item) => ({ ...item, colecao: "convites", tipoRegistro: "Convite" }));
  return ordenarRecentes([...candidaturas, ...convites]);
}

function renderizarMetricas() {
  const pendentes = estado.dados.denuncias.filter(estaPendente);
  const inscricoesPendentes = [...estado.inscricoesTorneio.values()]
    .flat()
    .filter((inscricao) => statusInscricaoTorneio(inscricao) === "pendente");
  const resultadosPendentes = [...estado.partidasTorneio.entries()]
    .flatMap(([torneioId, partidas]) => partidas.map((partida) => ({ torneioId, partida })))
    .filter(({ torneioId, partida }) =>
      normalizar(partida.status) !== "finalizado"
      && enviosDaPartidaTorneio(torneioId, partida.id).length > 0,
    );
  const invalidos = registrosInvalidos();
  const convitesPendentes = estado.dados.convites.filter(
    (convite) => normalizar(convite.status || "pendente") === "pendente",
  );

  preencherMetrica("admin-total-jogadores", estado.dados.jogadores.length);
  preencherMetrica(
    "admin-total-disponiveis",
    estado.dados.jogadores.filter((jogador) => jogador.procurandoClube === true).length,
  );
  preencherMetrica("admin-total-clubes", estado.dados.clubes.length);
  preencherMetrica("admin-total-vagas", estado.dados.vagas.length);
  preencherMetrica("admin-total-torneios", estado.dados.torneios.length);
  preencherMetrica("admin-total-avaliacoes", estado.dados.avaliacoes.length);
  preencherMetrica("admin-total-denuncias", pendentes.length);
  preencherMetrica("admin-total-convites", convitesPendentes.length);
  preencherMetrica("admin-total-invalidos", invalidos.length);

  const contadorNav = porId("admin-nav-denuncias");
  if (contadorNav) {
    contadorNav.textContent = String(pendentes.length);
    contadorNav.hidden = pendentes.length === 0;
  }

  const contadorInvalidos = porId("admin-nav-invalidos");
  if (contadorInvalidos) {
    contadorInvalidos.textContent = String(invalidos.length);
    contadorInvalidos.hidden = invalidos.length === 0;
  }

  const contadorInscricoes = porId("admin-nav-inscricoes");
  if (contadorInscricoes) {
    const totalPendente = inscricoesPendentes.length + resultadosPendentes.length;
    contadorInscricoes.textContent = String(totalPendente);
    contadorInscricoes.hidden = totalPendente === 0;
  }

  const atualizacao = porId("admin-ultima-atualizacao");
  if (atualizacao) atualizacao.textContent = `Atualizado em ${formatarData(new Date())}`;
}

function renderizarResumos() {
  const denunciasEl = porId("admin-resumo-denuncias");
  const vagasEl = porId("admin-resumo-vagas");

  if (denunciasEl) {
    const ultimas = estado.dados.denuncias.filter(estaPendente).slice(0, 5);
    denunciasEl.innerHTML = ultimas.length
      ? ultimas.map((denuncia) => `
          <div class="admin-resumo-item">
            <strong>${escaparHtml(texto(denuncia.clube, "Vaga denunciada"))}</strong>
            <span>${escaparHtml(ROTULOS_MOTIVO_DENUNCIA[normalizar(denuncia.motivo)] || "Aguardando análise")}</span>
            <time>${escaparHtml(formatarData(denuncia.criadoEm))}</time>
          </div>`).join("")
      : '<div class="admin-vazio">Nenhuma denúncia pendente.</div>';
  }

  if (vagasEl) {
    const ultimas = estado.dados.vagas.slice(0, 5);
    vagasEl.innerHTML = ultimas.length
      ? ultimas.map((vaga) => `
          <div class="admin-resumo-item">
            <strong>${escaparHtml(texto(vaga.clube, "Clube sem nome"))}</strong>
            <span>${escaparHtml(rotuloPosicao(vaga.posicao))}</span>
            <time>${escaparHtml(formatarData(vaga.criadoEm))}</time>
          </div>`).join("")
      : '<div class="admin-vazio">Nenhuma vaga publicada.</div>';
  }
}

function statusJogador(jogador) {
  if (jogador.suspenso === true) return { texto: "Suspenso", classe: "vermelho" };
  if (jogador.procurandoClube === true) return { texto: "Procurando clube", classe: "verde" };
  if (jogador.ehCapitao === true) return { texto: "Capitão", classe: "amarelo" };
  return { texto: "Cadastrado", classe: "" };
}

function emailPrivadoJogador(jogador) {
  const privado = estado.dados.privados.find((item) => item.id === jogador.id);
  return texto(privado?.email || jogador.email, jogador.id);
}

function renderizarUsuarios() {
  const corpo = porId("admin-lista-usuarios");
  if (!corpo) return;
  const busca = normalizar(porId("admin-busca-usuarios")?.value);
  const filtro = porId("admin-filtro-usuarios")?.value || "todos";

  const filtrados = estado.dados.jogadores.filter((jogador) => {
    const email = emailPrivadoJogador(jogador);
    const correspondeBusca = !busca || normalizar([
      jogador.nickname,
      email,
      jogador.eaId,
      jogador.idEA,
      jogador.clubeAtualNome,
    ].filter(Boolean).join(" ")).includes(busca);

    const correspondeFiltro = filtro === "todos"
      || (filtro === "disponiveis" && jogador.procurandoClube === true)
      || (filtro === "capitaes" && jogador.ehCapitao === true)
      || (filtro === "suspensos" && jogador.suspenso === true);
    return correspondeBusca && correspondeFiltro;
  });

  const contagem = porId("admin-contagem-usuarios");
  if (contagem) contagem.textContent = `${filtrados.length} de ${estado.dados.jogadores.length}`;

  corpo.innerHTML = filtrados.length
    ? filtrados.map((jogador) => {
        const status = statusJogador(jogador);
        const clube = jogador.clubeAtualNome || jogador.clube;
        const email = emailPrivadoJogador(jogador);
        return `
          <tr>
            <td><div class="admin-entidade"><strong>${escaparHtml(texto(jogador.nickname, "Jogador"))}</strong><small>${escaparHtml(email)}</small></div></td>
            <td>${escaparHtml(rotuloPosicao(jogador.posicao))}</td>
            <td>${escaparHtml(rotuloPlataforma(jogador.plataforma))}</td>
            <td>${escaparHtml(texto(clube, "Sem clube"))}</td>
            <td><span class="admin-badge ${status.classe}">${escaparHtml(status.texto)}</span></td>
            <td>
              <div class="admin-acoes-inline">
                <a class="admin-btn-link" href="./meu-perfil.html?uid=${encodeURIComponent(jogador.id)}">Ver perfil</a>
                ${estado.podeModerar ? `
                  <button type="button" class="${jogador.suspenso === true ? "admin-btn-secundario" : "admin-btn-perigo"}"
                    data-admin-acao="${jogador.suspenso === true ? "reativar-jogador" : "suspender-jogador"}"
                    data-jogador-id="${escaparHtml(jogador.id)}"
                    data-nome="${escaparHtml(texto(jogador.nickname, "Jogador"))}">
                    ${jogador.suspenso === true ? "Reativar" : "Suspender"}
                  </button>` : ""}
              </div>
            </td>
          </tr>`;
      }).join("")
    : '<tr><td class="admin-vazio" colspan="6">Nenhum usuário encontrado.</td></tr>';
}

function obterJogador(uid) {
  return estado.dados.jogadores.find((jogador) => jogador.id === uid);
}

function renderizarClubes() {
  const corpo = porId("admin-lista-clubes");
  if (!corpo) return;
  const busca = normalizar(porId("admin-busca-clubes")?.value);
  const filtrados = estado.dados.clubes.filter((clube) => {
    const capitao = obterJogador(clube.capitaoUid || clube.id);
    return !busca || normalizar([
      clube.nome,
      clube.regiao,
      clube.plataforma,
      clube.estiloJogo,
      clube.capitaoIdEA,
      capitao?.nickname,
    ].filter(Boolean).join(" ")).includes(busca);
  });

  const contagem = porId("admin-contagem-clubes");
  if (contagem) contagem.textContent = `${filtrados.length} de ${estado.dados.clubes.length}`;

  corpo.innerHTML = filtrados.length
    ? filtrados.map((clube) => {
        const uidCapitao = clube.capitaoUid || clube.id;
        const capitao = obterJogador(uidCapitao);
        return `
          <tr>
            <td>
              <div class="admin-entidade">
                <strong>${escaparHtml(texto(clube.nome, "Clube sem nome"))}</strong>
                <small>${escaparHtml(texto(clube.divisao, "Divisão não informada"))}</small>
                <div class="admin-acoes-inline">
                  ${clube.verificado === true ? '<span class="admin-badge verde">Verificado</span>' : ""}
                  ${clube.suspenso === true ? '<span class="admin-badge vermelho">Bloqueado</span>' : ""}
                </div>
              </div>
            </td>
            <td>${escaparHtml(texto(capitao?.nickname || clube.capitaoNome || clube.capitaoIdEA, "Não informado"))}</td>
            <td>${escaparHtml(rotuloPlataforma(clube.plataforma))}</td>
            <td>${escaparHtml(texto(clube.regiao))}</td>
            <td>${escaparHtml(texto(clube.estiloJogo))}</td>
            <td>
              <div class="admin-acoes-inline">
                <a class="admin-btn-link" href="./clubes.html?uid=${encodeURIComponent(uidCapitao)}">Ver clube</a>
                ${estado.podeModerar ? `
                  <button type="button" class="admin-btn-secundario" data-admin-acao="alternar-verificacao-clube"
                    data-clube-id="${escaparHtml(clube.id)}" data-verificado="${String(clube.verificado === true)}"
                    data-nome="${escaparHtml(texto(clube.nome, "Clube"))}">
                    ${clube.verificado === true ? "Remover selo" : "Verificar"}
                  </button>
                  <button type="button" class="${clube.suspenso === true ? "admin-btn-secundario" : "admin-btn-perigo"}"
                    data-admin-acao="${clube.suspenso === true ? "desbloquear-clube" : "bloquear-clube"}"
                    data-clube-id="${escaparHtml(clube.id)}" data-nome="${escaparHtml(texto(clube.nome, "Clube"))}">
                    ${clube.suspenso === true ? "Desbloquear" : "Bloquear"}
                  </button>` : ""}
              </div>
            </td>
          </tr>`;
      }).join("")
    : '<tr><td class="admin-vazio" colspan="6">Nenhum clube encontrado.</td></tr>';
}

function botoesModeracaoVaga(vaga, denunciaId = "") {
  if (!estado.podeModerar) return "";
  return `
    <button type="button" class="admin-btn-perigo" data-admin-acao="remover-vaga"
      data-vaga-id="${escaparHtml(vaga.id)}" data-clube="${escaparHtml(texto(vaga.clube, "este clube"))}"
      ${denunciaId ? `data-denuncia-id="${escaparHtml(denunciaId)}"` : ""}>Remover vaga</button>`;
}

function renderizarVagas() {
  const lista = porId("admin-lista-vagas");
  if (!lista) return;
  const busca = normalizar(porId("admin-busca-vagas")?.value);
  const filtradas = estado.dados.vagas.filter((vaga) => !busca || normalizar([
    vaga.clube,
    vaga.capitaoNome,
    vaga.descricao,
    vaga.plataforma,
    vaga.posicao,
    vaga.jogo,
  ].filter(Boolean).join(" ")).includes(busca));

  const contagem = porId("admin-contagem-vagas");
  if (contagem) contagem.textContent = `${filtradas.length} de ${estado.dados.vagas.length}`;

  lista.innerHTML = filtradas.length
    ? filtradas.map((vaga) => `
        <article class="admin-registro">
          <div class="admin-registro-topo">
            <h3>${escaparHtml(texto(vaga.clube, "Clube sem nome"))}</h3>
            <span class="admin-badge verde">Publicada</span>
          </div>
          <div class="admin-registro-meta">
            <span class="admin-badge">${escaparHtml(rotuloPosicao(vaga.posicao))}</span>
            <span class="admin-badge">${escaparHtml(rotuloPlataforma(vaga.plataforma))}</span>
            <span class="admin-badge">${escaparHtml(texto(vaga.jogo, "Jogo não informado"))}</span>
          </div>
          <p>${escaparHtml(texto(vaga.descricao, "Sem descrição."))}</p>
          <div class="admin-registro-meta">
            <span>Capitão: ${escaparHtml(texto(vaga.capitaoNome))}</span>
            <span>• ${escaparHtml(formatarData(vaga.criadoEm))}</span>
          </div>
          <div class="admin-registro-acoes">
            <a class="admin-btn-link" href="./mercado.html?vaga=${encodeURIComponent(vaga.id)}">Abrir anúncio</a>
            ${botoesModeracaoVaga(vaga)}
          </div>
        </article>`).join("")
    : '<div class="admin-vazio">Nenhuma vaga encontrada.</div>';
}

function rotuloStatusDenuncia(denuncia) {
  if (estaArquivada(denuncia)) return { texto: "Arquivada", classe: "" };
  const status = statusDenuncia(denuncia);
  if (status === "analisada") return { texto: "Analisada", classe: "verde" };
  if (status === "resolvida") return { texto: "Resolvida", classe: "verde" };
  if (status === "descartada") return { texto: "Descartada", classe: "" };
  return { texto: "Aguardando análise", classe: "amarelo" };
}

function renderizarDenuncias() {
  const lista = porId("admin-lista-denuncias");
  if (!lista) return;
  const filtro = porId("admin-filtro-denuncias")?.value || "pendentes";
  const filtradas = estado.dados.denuncias.filter((denuncia) => {
    if (filtro === "pendentes") return estaPendente(denuncia);
    if (filtro === "analisadas") return !estaArquivada(denuncia) && statusDenuncia(denuncia) === "analisada";
    if (filtro === "resolvidas") return !estaArquivada(denuncia)
      && ["resolvida", "descartada"].includes(statusDenuncia(denuncia));
    if (filtro === "arquivadas") return estaArquivada(denuncia);
    return true;
  });

  const contagem = porId("admin-contagem-denuncias");
  if (contagem) contagem.textContent = `${filtradas.length} de ${estado.dados.denuncias.length}`;

  lista.innerHTML = filtradas.length
    ? filtradas.map((denuncia) => {
        const status = rotuloStatusDenuncia(denuncia);
        const vaga = estado.dados.vagas.find((item) => item.id === denuncia.vagaId);
        const denunciante = obterJogador(denuncia.denuncianteUid);
        const motivo = ROTULOS_MOTIVO_DENUNCIA[normalizar(denuncia.motivo)] || texto(denuncia.motivo, "Motivo não informado");
        return `
          <article class="admin-registro">
            <div class="admin-registro-topo">
              <h3>${escaparHtml(texto(denuncia.clube, "Vaga denunciada"))}</h3>
              <span class="admin-badge ${status.classe}">${status.texto}</span>
            </div>
            <div class="admin-registro-meta">
              <span class="admin-badge">Denúncia de ${escaparHtml(texto(denunciante?.nickname, "usuário da comunidade"))}</span>
              <span class="admin-badge">${escaparHtml(formatarData(denuncia.criadoEm))}</span>
              <span class="admin-badge amarelo">${escaparHtml(motivo)}</span>
            </div>
            <p class="admin-denuncia-detalhes">${escaparHtml(texto(denuncia.detalhes, "O usuário não acrescentou detalhes."))}</p>
            <div class="admin-registro-acoes">
              ${denuncia.vagaId ? `<a class="admin-btn-link" href="./mercado.html?vaga=${encodeURIComponent(denuncia.vagaId)}">Abrir anúncio</a>` : ""}
              ${estado.podeModerar && estaPendente(denuncia) ? `
                <button type="button" class="admin-btn-secundario" data-admin-acao="analisar-denuncia"
                  data-denuncia-id="${escaparHtml(denuncia.id)}">Marcar como analisada</button>
                <button type="button" class="admin-btn-secundario" data-admin-acao="descartar-denuncia"
                  data-denuncia-id="${escaparHtml(denuncia.id)}" data-clube="${escaparHtml(texto(denuncia.clube, "Clube"))}">Descartar</button>` : ""}
              ${vaga && !estaArquivada(denuncia) ? botoesModeracaoVaga(vaga, denuncia.id) : ""}
              ${estado.podeModerar && !estaPendente(denuncia) && !estaArquivada(denuncia) ? `
                <button type="button" class="admin-btn-secundario" data-admin-acao="arquivar-denuncia"
                  data-denuncia-id="${escaparHtml(denuncia.id)}">Arquivar</button>` : ""}
              ${estado.podeModerar && estaArquivada(denuncia) ? `
                <button type="button" class="admin-btn-secundario" data-admin-acao="restaurar-denuncia"
                  data-denuncia-id="${escaparHtml(denuncia.id)}">Restaurar</button>
                <button type="button" class="admin-btn-perigo" data-admin-acao="excluir-denuncia"
                  data-denuncia-id="${escaparHtml(denuncia.id)}" data-clube="${escaparHtml(texto(denuncia.clube, "Clube"))}">Excluir definitivamente</button>` : ""}
            </div>
          </article>`;
      }).join("")
    : '<div class="admin-vazio">Nenhuma denúncia neste filtro.</div>';
}

function renderizarAvaliacoes() {
  const lista = porId("admin-lista-avaliacoes");
  if (!lista) return;
  const busca = normalizar(porId("admin-busca-avaliacoes")?.value);
  const filtradas = estado.dados.avaliacoes.filter((avaliacao) => {
    const autor = obterJogador(avaliacao.autorUid);
    return !busca || normalizar([
      avaliacao.alvoNome,
      avaliacao.comentario,
      avaliacao.negociacaoTipo,
      avaliacao.negociacaoId,
      autor?.nickname,
    ].filter(Boolean).join(" ")).includes(busca);
  });

  const contagem = porId("admin-contagem-avaliacoes");
  if (contagem) contagem.textContent = `${filtradas.length} de ${estado.dados.avaliacoes.length}`;

  lista.innerHTML = filtradas.length
    ? filtradas.map((avaliacao) => {
        const autor = obterJogador(avaliacao.autorUid);
        const nota = Math.max(1, Math.min(5, Number(avaliacao.nota) || 1));
        const perfilHref = avaliacao.alvoTipo === "clube"
          ? `./clubes.html?uid=${encodeURIComponent(avaliacao.alvoUid || "")}`
          : `./meu-perfil.html?uid=${encodeURIComponent(avaliacao.alvoUid || "")}`;
        const tipoNegociacao = avaliacao.negociacaoTipo === "convite" ? "Convite aceito" : "Candidatura aceita";
        return `
          <article class="admin-registro">
            <div class="admin-registro-topo">
              <div>
                <h3>${escaparHtml(texto(avaliacao.alvoNome, "Perfil avaliado"))}</h3>
                <span class="admin-avaliacao-nota" aria-label="Nota ${nota} de 5">${"★".repeat(nota)}${"☆".repeat(5 - nota)}</span>
              </div>
              <span class="admin-badge verde">Avaliação verificada</span>
            </div>
            <div class="admin-registro-meta">
              <span class="admin-badge">Por ${escaparHtml(texto(autor?.nickname, "usuário da comunidade"))}</span>
              <span class="admin-badge">${escaparHtml(tipoNegociacao)}</span>
              <span class="admin-badge">${escaparHtml(formatarData(avaliacao.criadoEm))}</span>
            </div>
            <p>${escaparHtml(texto(avaliacao.comentario, "Sem comentário público."))}</p>
            <div class="admin-registro-acoes">
              <a class="admin-btn-link" href="${perfilHref}">Ver perfil avaliado</a>
              ${estado.podeModerar ? `<button type="button" class="admin-btn-perigo" data-admin-acao="excluir-avaliacao"
                data-avaliacao-id="${escaparHtml(avaliacao.id)}"
                data-nome="${escaparHtml(texto(avaliacao.alvoNome, "perfil"))}">Excluir avaliação</button>` : ""}
            </div>
          </article>`;
      }).join("")
    : '<div class="admin-vazio">Nenhuma avaliação encontrada.</div>';
}

function renderizarManutencao() {
  const lista = porId("admin-lista-invalidos");
  if (!lista) return;
  const invalidos = registrosInvalidos();
  const contagem = porId("admin-contagem-invalidos");
  if (contagem) contagem.textContent = `${invalidos.length} registro(s)`;
  const limparTodos = porId("admin-limpar-invalidos");
  if (limparTodos) limparTodos.hidden = !estado.podeModerar || invalidos.length === 0;
  const emailsPublicos = estado.dados.jogadores.filter((jogador) => (
    typeof jogador.email === "string" && jogador.email.includes("@")
  ));
  const contagemEmails = porId("admin-contagem-emails-publicos");
  if (contagemEmails) {
    contagemEmails.textContent = emailsPublicos.length
      ? `${emailsPublicos.length} e-mail(s) ainda público(s)`
      : "Todos os e-mails estão protegidos";
  }
  const protegerEmails = porId("admin-proteger-emails");
  if (protegerEmails) protegerEmails.hidden = !estado.podeModerar || emailsPublicos.length === 0;
  lista.innerHTML = invalidos.length
    ? invalidos.map((item) => {
        const problemas = [
          !uidValido(item.jogadorUid) ? "jogadorUid inválido" : "",
          !uidValido(item.capitaoUid) ? "capitaoUid inválido" : "",
          item.colecao === "candidaturas" && !texto(item.vagaId, "") ? "vagaId ausente" : "",
        ].filter(Boolean);
        return `
          <article class="admin-registro">
            <div class="admin-registro-topo">
              <h3>${escaparHtml(item.tipoRegistro)} antiga</h3>
              <span class="admin-badge vermelho">Inválida</span>
            </div>
            <div class="admin-registro-meta">
              ${problemas.map((problema) => `<span class="admin-badge">${escaparHtml(problema)}</span>`).join("")}
            </div>
            <p>Registro ${escaparHtml(item.id)} não consegue concluir o fluxo de negociação e pode ser removido com segurança.</p>
            <div class="admin-registro-acoes">
              ${estado.podeModerar ? `
                <button type="button" class="admin-btn-perigo" data-admin-acao="excluir-registro-invalido"
                  data-registro-id="${escaparHtml(item.id)}" data-colecao="${escaparHtml(item.colecao)}"
                  data-tipo="${escaparHtml(item.tipoRegistro)}">Excluir registro inválido</button>` : ""}
            </div>
          </article>`;
      }).join("")
    : '<div class="admin-vazio">Nenhum registro antigo inválido foi encontrado.</div>';
}

function rotuloAcao(acao) {
  const rotulos = {
    denuncia_analisada: "Denúncia marcada como analisada",
    denuncia_descartada: "Denúncia descartada",
    denuncia_arquivada: "Denúncia arquivada",
    denuncia_restaurada: "Denúncia restaurada",
    denuncia_excluida: "Denúncia excluída definitivamente",
    vaga_removida: "Vaga removida pela moderação",
    jogador_suspenso: "Jogador suspenso",
    jogador_reativado: "Jogador reativado",
    clube_verificado: "Clube verificado",
    verificacao_clube_removida: "Verificação de clube removida",
    clube_bloqueado: "Clube bloqueado",
    clube_desbloqueado: "Clube desbloqueado",
    registro_invalido_excluido: "Registro inválido excluído",
    torneio_criado: "Torneio criado",
    torneio_editado: "Torneio editado",
    torneio_excluido: "Torneio excluído",
    torneio_iniciado: "Torneio iniciado",
    torneio_finalizado: "Torneio finalizado",
    inscricao_torneio_aprovada: "Clube aprovado no torneio",
    inscricao_torneio_rejeitada: "Inscrição de torneio rejeitada",
    resultado_torneio_salvo: "Resultado de torneio salvo",
  };
  return rotulos[acao] || texto(acao, "Ação administrativa").replaceAll("_", " ");
}

function renderizarAtividade() {
  const lista = porId("admin-lista-atividade");
  if (!lista) return;
  const logs = estado.dados.logs.slice(0, 50);
  lista.innerHTML = logs.length
    ? logs.map((log) => `
        <article class="admin-timeline-item">
          <span class="admin-timeline-ponto" aria-hidden="true"></span>
          <div class="admin-timeline-conteudo">
            <strong>${escaparHtml(rotuloAcao(log.acao))}</strong>
            <span>${escaparHtml(texto(log.detalhes, `${texto(log.alvoTipo, "item")} ${texto(log.alvoId, "")}`))} • por ${escaparHtml(texto(log.adminNome || log.adminEmail, "administrador"))}</span>
          </div>
          <time>${escaparHtml(formatarData(log.criadoEm))}</time>
        </article>`).join("")
    : '<div class="admin-vazio">Nenhuma ação administrativa registrada ainda.</div>';
}

function torneioCardAdmin(torneio) {
  const status = statusTorneio(torneio);
  const inscricoes = inscricoesDoTorneio(torneio.id);
  const pendentes = inscricoes.filter((item) => statusInscricaoTorneio(item) === "pendente").length;
  const aprovadas = inscricoes.filter((item) => statusInscricaoTorneio(item) === "aprovada").length;
  const maximo = Math.max(2, numero(torneio.maxClubes, 8));
  return `
    <article class="admin-torneio-card">
      <div class="admin-torneio-card-topo">
        <span class="admin-torneio-status ${status}">${rotuloStatusTorneio(status)}</span>
        ${pendentes ? `<span class="admin-torneio-status pendente">${pendentes} para analisar</span>` : ""}
      </div>
      <h3>${escaparHtml(texto(torneio.nome, "Torneio sem nome"))}</h3>
      <p>${escaparHtml(texto(torneio.jogo, "EA FC"))} • ${escaparHtml(rotuloPlataforma(torneio.plataforma))} • ${escaparHtml(texto(torneio.formato, "Mata-mata"))}</p>
      <div class="admin-torneio-meta">
        <span class="admin-torneio-chip">${aprovadas}/${maximo} clubes</span>
        <span class="admin-torneio-chip">Início: ${escaparHtml(formatarData(torneio.dataInicio, false))}</span>
        <span class="admin-torneio-chip">${partidasDoTorneio(torneio.id).length} partidas</span>
      </div>
      <div class="admin-torneio-card-rodape">
        <small>Inscrições até<br><strong>${escaparHtml(formatarData(torneio.inscricoesAte))}</strong></small>
        <div class="admin-torneio-card-acoes">
          <button type="button" class="admin-btn-secundario" data-admin-acao="gerenciar-torneio" data-torneio-id="${escaparHtml(torneio.id)}">Gerenciar</button>
          ${["aberto", "encerrado"].includes(status) ? `<button type="button" class="admin-btn-link" data-admin-acao="editar-torneio" data-torneio-id="${escaparHtml(torneio.id)}">Editar</button>` : ""}
          <button type="button" class="admin-btn-perigo" data-admin-acao="excluir-torneio" data-torneio-id="${escaparHtml(torneio.id)}" data-nome="${escaparHtml(texto(torneio.nome, "Torneio"))}" ${estado.podeModerar ? "" : "disabled"}>Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function renderizarTorneiosAdmin() {
  const lista = porId("admin-lista-torneios");
  if (!lista) return;
  const torneios = [...estado.dados.torneios].sort((a, b) => {
    const prioridade = { aberto: 0, andamento: 1, encerrado: 2, finalizado: 3, cancelado: 4 };
    return prioridade[statusTorneio(a)] - prioridade[statusTorneio(b)]
      || timestampParaMs(b.criadoEm) - timestampParaMs(a.criadoEm);
  });
  porId("admin-contagem-torneios").textContent = `${torneios.length} ${torneios.length === 1 ? "torneio" : "torneios"}`;
  lista.innerHTML = torneios.length
    ? torneios.map(torneioCardAdmin).join("")
    : '<div class="admin-torneio-vazio">Nenhum torneio criado. Use o formulário acima para publicar o primeiro.</div>';

  if (estado.torneioModalId) renderizarModalTorneio(estado.torneioModalId);
}

function limparFormularioTorneio() {
  const form = porId("admin-form-torneio");
  form?.reset();
  porId("admin-torneio-id").value = "";
  porId("admin-torneio-max-clubes").value = "8";
  porId("admin-torneio-form-titulo").textContent = "Criar novo torneio";
  porId("admin-salvar-torneio").textContent = "Publicar torneio";
  porId("admin-cancelar-edicao-torneio").hidden = true;
}

function editarTorneio(torneioId) {
  const torneio = estado.dados.torneios.find((item) => item.id === torneioId);
  if (!torneio) return;
  abrirPainel("torneios");
  porId("admin-torneio-id").value = torneio.id;
  porId("admin-torneio-nome").value = texto(torneio.nome, "");
  porId("admin-torneio-descricao").value = texto(torneio.descricao, "");
  porId("admin-torneio-jogo").value = texto(torneio.jogo, "EA FC 26");
  porId("admin-torneio-plataforma").value = texto(torneio.plataforma, "crossplay");
  porId("admin-torneio-regiao").value = texto(torneio.regiao, "Brasil");
  porId("admin-torneio-formato").value = texto(torneio.formato, "Mata-mata");
  porId("admin-torneio-max-clubes").value = String(Math.max(2, numero(torneio.maxClubes, 8)));
  porId("admin-torneio-inscricoes-ate").value = dataParaInput(torneio.inscricoesAte);
  porId("admin-torneio-data-inicio").value = dataParaInput(torneio.dataInicio);
  porId("admin-torneio-premio").value = texto(torneio.premio, "");
  porId("admin-torneio-regulamento").value = texto(torneio.regulamento, "");
  porId("admin-torneio-form-titulo").textContent = "Editar torneio";
  porId("admin-salvar-torneio").textContent = "Salvar alterações";
  porId("admin-cancelar-edicao-torneio").hidden = false;
  porId("admin-form-torneio").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function salvarTorneio(evento) {
  evento.preventDefault();
  if (!estado.podeModerar) {
    toast("Sua conta não possui permissão para gerenciar torneios.", "erro");
    return;
  }

  const id = porId("admin-torneio-id").value.trim();
  const inscricoesAte = new Date(porId("admin-torneio-inscricoes-ate").value);
  const dataInicio = new Date(porId("admin-torneio-data-inicio").value);
  if (!Number.isFinite(inscricoesAte.getTime()) || !Number.isFinite(dataInicio.getTime())) {
    toast("Informe datas válidas para inscrição e início.", "erro");
    return;
  }
  if (dataInicio <= inscricoesAte) {
    toast("A data de início precisa ser posterior ao fim das inscrições.", "erro");
    return;
  }

  const dados = {
    nome: porId("admin-torneio-nome").value.trim(),
    descricao: porId("admin-torneio-descricao").value.trim(),
    jogo: porId("admin-torneio-jogo").value,
    plataforma: porId("admin-torneio-plataforma").value,
    regiao: porId("admin-torneio-regiao").value,
    formato: porId("admin-torneio-formato").value,
    maxClubes: numero(porId("admin-torneio-max-clubes").value, 8),
    inscricoesAte,
    dataInicio,
    premio: porId("admin-torneio-premio").value.trim(),
    regulamento: porId("admin-torneio-regulamento").value.trim(),
    organizadorUid: estado.usuario.uid,
    organizadorNome: estado.config.nome || estado.usuario.displayName || "Mercado Pro Clubs",
    atualizadoEm: serverTimestamp(),
  };

  const botao = porId("admin-salvar-torneio");
  botao.disabled = true;
  botao.textContent = "Salvando...";
  try {
    if (id) {
      await updateDoc(doc(db, "torneios", id), dados);
      await registrarLog("torneio_editado", "torneio", id, `Torneio “${dados.nome}” atualizado`);
      toast("Torneio atualizado.");
    } else {
      const referencia = await addDoc(collection(db, "torneios"), {
        ...dados,
        status: "aberto",
        criadoEm: serverTimestamp(),
      });
      await registrarLog("torneio_criado", "torneio", referencia.id, `Torneio “${dados.nome}” publicado`);
      toast("Torneio publicado e inscrições abertas.");
    }
    limparFormularioTorneio();
    await carregarDados();
  } catch (erro) {
    console.error("Erro ao salvar torneio:", erro);
    toast("Não foi possível salvar o torneio. Confira as regras do Firestore.", "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = porId("admin-torneio-id").value ? "Salvar alterações" : "Publicar torneio";
  }
}

async function excluirTorneio(torneioId, nome, botao) {
  if (!estado.podeModerar) return;
  const confirmado = await confirmModal({
    titulo: "Excluir torneio",
    mensagem: `Excluir “${nome}”, suas inscrições e partidas? Esta ação não pode ser desfeita.`,
    textoConfirmar: "Excluir torneio",
    destrutivo: true,
  });
  if (!confirmado) return;
  botao.disabled = true;
  try {
    const [inscricoes, partidas] = await Promise.all([
      getDocs(collection(db, "torneios", torneioId, "inscricoes")),
      getDocs(collection(db, "torneios", torneioId, "partidas")),
    ]);
    const enviosPorPartida = await Promise.all(
      partidas.docs.map((partida) =>
        getDocs(collection(db, "torneios", torneioId, "partidas", partida.id, "envios")),
      ),
    );
    await Promise.all([
      ...enviosPorPartida.flatMap((snapshot) => snapshot.docs.map((item) => deleteDoc(item.ref))),
      ...inscricoes.docs.map((item) => deleteDoc(item.ref)),
      ...partidas.docs.map((item) => deleteDoc(item.ref)),
    ]);
    await deleteDoc(doc(db, "torneios", torneioId));
    estado.torneioModalId = "";
    await registrarLog("torneio_excluido", "torneio", torneioId, `Torneio “${nome}” excluído`);
    toast("Torneio excluído.");
    await carregarDados();
  } catch (erro) {
    console.error("Erro ao excluir torneio:", erro);
    botao.disabled = false;
    toast("Não foi possível excluir o torneio.", "erro");
  }
}

function partidaTemChavePosterior(torneioId, partida) {
  return partidasDoTorneio(torneioId).some(
    (item) => numero(item.rodada, 1) > numero(partida.rodada, 1),
  );
}

function partidaAdminHtml(torneioId, partida) {
  const torneio = estado.dados.torneios.find((item) => item.id === torneioId);
  const analise = analisarEnviosPartida(torneioId, partida.id);
  const sugestao = ["consenso", "unico"].includes(analise.tipo) ? analise.envios[0] : null;
  const placarA = partida.placarA ?? sugestao?.placarA ?? "";
  const placarB = partida.placarB ?? sugestao?.placarB ?? "";
  const finalizada = normalizar(partida.status) === "finalizado";
  const bloqueada = finalizada
    && (statusTorneio(torneio) === "finalizado" || partidaTemChavePosterior(torneioId, partida));
  const rotuloAnalise = {
    consenso: "Consenso entre os capitães",
    divergencia: "Placares divergentes — decisão necessária",
    unico: "Um capitão enviou o placar",
    nenhum: "Nenhum placar enviado pelos capitães",
  }[analise.tipo];
  const rotuloBotao = bloqueada
    ? "Resultado encerrado"
    : analise.tipo === "consenso"
      ? "Homologar consenso"
      : analise.tipo === "divergencia"
        ? "Resolver divergência"
        : finalizada
          ? "Atualizar placar"
          : "Salvar resultado";

  return `
    <article class="admin-torneio-partida-admin" data-partida-id="${escaparHtml(partida.id)}">
      <div class="admin-torneio-resultado-status ${analise.tipo}">${rotuloAnalise}</div>
      ${analise.envios.length ? `
        <div class="admin-torneio-envios">
          ${analise.envios.map((envio) => `
            <div class="admin-torneio-envio">
              <div><strong>${escaparHtml(texto(envio.clubeNome, "Capitão"))}</strong><small>${escaparHtml(formatarData(envio.atualizadoEm || envio.criadoEm))}</small></div>
              <b>${numero(envio.placarA, 0)} × ${numero(envio.placarB, 0)}</b>
              ${envio.observacao ? `<p>${escaparHtml(envio.observacao)}</p>` : ""}
            </div>`).join("")}
        </div>` : ""}
      <div class="admin-torneio-partida-times">
        <span>${escaparHtml(texto(partida.timeANome, "A definir"))}</span>
        <input class="admin-placar-input" data-placar="a" type="number" min="0" max="99" value="${placarA}" aria-label="Gols do primeiro clube" ${bloqueada ? "disabled" : ""}>
        <strong>×</strong>
        <input class="admin-placar-input" data-placar="b" type="number" min="0" max="99" value="${placarB}" aria-label="Gols do segundo clube" ${bloqueada ? "disabled" : ""}>
        <span>${escaparHtml(texto(partida.timeBNome, "A definir"))}</span>
      </div>
      <div class="admin-torneio-partida-acoes">
        <small>Rodada ${numero(partida.rodada, 1)} • Jogo ${numero(partida.ordem, 0) + 1}</small>
        <button type="button" class="admin-btn-primary" data-admin-acao="salvar-resultado" data-torneio-id="${escaparHtml(torneioId)}" data-partida-id="${escaparHtml(partida.id)}" ${bloqueada ? "disabled" : ""}>${rotuloBotao}</button>
      </div>
      ${bloqueada ? '<p class="admin-torneio-resultado-bloqueado">Este placar foi bloqueado porque a chave já avançou.</p>' : ""}
    </article>
  `;
}

function renderizarModalTorneio(torneioId) {
  const torneio = estado.dados.torneios.find((item) => item.id === torneioId);
  const conteudo = porId("admin-torneio-modal-conteudo");
  if (!torneio || !conteudo) {
    fecharModalTorneio();
    return;
  }
  const status = statusTorneio(torneio);
  const inscricoes = inscricoesDoTorneio(torneioId);
  const podeGerenciarInscricoes = ["aberto", "encerrado"].includes(status);
  const aprovadas = inscricoes.filter((item) => statusInscricaoTorneio(item) === "aprovada");
  const partidas = [...partidasDoTorneio(torneioId)].sort(
    (a, b) => numero(a.rodada, 1) - numero(b.rodada, 1) || numero(a.ordem, 0) - numero(b.ordem, 0),
  );

  conteudo.innerHTML = `
    <h2 id="admin-torneio-modal-titulo">${escaparHtml(texto(torneio.nome, "Torneio"))}</h2>
    <p class="admin-torneio-modal-subtitulo">${rotuloStatusTorneio(status)} • ${aprovadas.length}/${Math.max(2, numero(torneio.maxClubes, 8))} clubes confirmados</p>
    <section class="admin-torneio-modal-bloco">
      <h3>Inscrições (${inscricoes.length})</h3>
      <div class="admin-torneio-inscricoes">
        ${inscricoes.length ? inscricoes.map((inscricao) => {
          const statusAtual = statusInscricaoTorneio(inscricao);
          return `
            <article class="admin-torneio-inscricao">
              <div class="admin-torneio-inscricao-info">
                <strong>${escaparHtml(texto(inscricao.clubeNome, "Clube sem nome"))}</strong>
                <small>${escaparHtml(texto(inscricao.plataforma, "Plataforma não informada"))} • ${escaparHtml(formatarData(inscricao.criadoEm))}</small>
              </div>
              <div class="admin-torneio-inscricao-acoes">
                <span class="admin-torneio-status ${statusAtual}">${statusAtual}</span>
                ${podeGerenciarInscricoes && statusAtual !== "aprovada" ? `<button type="button" class="admin-btn-primary" data-admin-acao="status-inscricao-torneio" data-torneio-id="${escaparHtml(torneioId)}" data-inscricao-id="${escaparHtml(inscricao.id)}" data-status="aprovada">Aprovar</button>` : ""}
                ${podeGerenciarInscricoes && statusAtual !== "rejeitada" ? `<button type="button" class="admin-btn-perigo" data-admin-acao="status-inscricao-torneio" data-torneio-id="${escaparHtml(torneioId)}" data-inscricao-id="${escaparHtml(inscricao.id)}" data-status="rejeitada">Rejeitar</button>` : ""}
              </div>
            </article>`;
        }).join("") : '<div class="admin-torneio-vazio">Nenhum clube se inscreveu ainda.</div>'}
      </div>
      ${podeGerenciarInscricoes ? `<div class="admin-torneio-form-acoes"><button type="button" class="admin-btn-primary" data-admin-acao="iniciar-torneio" data-torneio-id="${escaparHtml(torneioId)}">Gerar chave e iniciar torneio</button></div>` : ""}
    </section>
    <section class="admin-torneio-modal-bloco">
      <h3>Partidas e placares (${partidas.length})</h3>
      <div class="admin-torneio-partidas">
        ${partidas.length ? partidas.map((partida) => partidaAdminHtml(torneioId, partida)).join("") : '<div class="admin-torneio-vazio">A chave aparecerá aqui depois que o torneio for iniciado.</div>'}
      </div>
    </section>
  `;
}

function abrirGerenciarTorneio(torneioId) {
  estado.torneioModalId = torneioId;
  renderizarModalTorneio(torneioId);
  porId("admin-torneio-modal").hidden = false;
  document.body.style.overflow = "hidden";
  porId("admin-torneio-modal-fechar")?.focus();
}

function fecharModalTorneio() {
  estado.torneioModalId = "";
  const modal = porId("admin-torneio-modal");
  if (modal) modal.hidden = true;
  document.body.style.removeProperty("overflow");
}

async function alterarStatusInscricaoTorneio(torneioId, inscricaoId, novoStatus, botao) {
  if (!estado.podeModerar) return;
  const torneio = estado.dados.torneios.find((item) => item.id === torneioId);
  const inscricao = inscricoesDoTorneio(torneioId).find((item) => item.id === inscricaoId);
  if (!torneio || !inscricao || !["aberto", "encerrado"].includes(statusTorneio(torneio))) return;
  const maximo = Math.max(2, numero(torneio.maxClubes, 8));
  const aprovadas = inscricoesDoTorneio(torneioId).filter((item) => statusInscricaoTorneio(item) === "aprovada");
  if (novoStatus === "aprovada" && statusInscricaoTorneio(inscricao) !== "aprovada" && aprovadas.length >= maximo) {
    toast("O limite de clubes aprovados já foi atingido.", "erro");
    return;
  }
  botao.disabled = true;
  try {
    await updateDoc(doc(db, "torneios", torneioId, "inscricoes", inscricaoId), {
      status: novoStatus,
      analisadaEm: serverTimestamp(),
      analisadaPor: estado.usuario.uid,
      atualizadoEm: serverTimestamp(),
    });
    inscricao.status = novoStatus;
    inscricao.analisadaEm = new Date();
    await registrarLog(
      `inscricao_torneio_${novoStatus}`,
      "inscricaoTorneio",
      inscricaoId,
      `${texto(inscricao.clubeNome, "Clube")} • ${texto(torneio.nome, "Torneio")}`,
    );
    renderizarTudo();
    toast(novoStatus === "aprovada" ? "Clube aprovado no torneio." : "Inscrição rejeitada.");
  } catch (erro) {
    console.error("Erro ao analisar inscrição:", erro);
    botao.disabled = false;
    toast("Não foi possível atualizar a inscrição.", "erro");
  }
}

function embaralhar(lista) {
  const resultado = [...lista];
  for (let i = resultado.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [resultado[i], resultado[j]] = [resultado[j], resultado[i]];
  }
  return resultado;
}

async function iniciarTorneio(torneioId, botao) {
  if (!estado.podeModerar) return;
  const torneio = estado.dados.torneios.find((item) => item.id === torneioId);
  const aprovadas = inscricoesDoTorneio(torneioId).filter((item) => statusInscricaoTorneio(item) === "aprovada");
  const quantidade = aprovadas.length;
  if (!torneio || !["aberto", "encerrado"].includes(statusTorneio(torneio))) return;
  if (quantidade < 2 || (quantidade & (quantidade - 1)) !== 0) {
    toast("Para gerar a chave, aprove 2, 4, 8 ou 16 clubes.", "erro");
    return;
  }
  if (quantidade > Math.max(2, numero(torneio.maxClubes, 8))) {
    toast("Há mais clubes aprovados que o limite do torneio.", "erro");
    return;
  }
  const confirmado = await confirmModal({
    titulo: "Iniciar torneio",
    mensagem: `Gerar a chave com ${quantidade} clubes? Depois disso, as inscrições serão encerradas.`,
    textoConfirmar: "Gerar chave",
  });
  if (!confirmado) return;
  botao.disabled = true;
  try {
    const clubes = embaralhar(aprovadas);
    const totalRodadas = Math.log2(quantidade);
    const novasPartidas = [];
    const lote = writeBatch(db);
    for (let indice = 0; indice < clubes.length; indice += 2) {
      const timeA = clubes[indice];
      const timeB = clubes[indice + 1];
      const dados = {
        rodada: 1,
        totalRodadas,
        ordem: indice / 2,
        timeAId: timeA.clubeId || timeA.capitaoUid || timeA.id,
        timeANome: texto(timeA.clubeNome, "Clube A"),
        timeAEscudo: String(timeA.clubeEscudo || ""),
        timeBId: timeB.clubeId || timeB.capitaoUid || timeB.id,
        timeBNome: texto(timeB.clubeNome, "Clube B"),
        timeBEscudo: String(timeB.clubeEscudo || ""),
        status: "pendente",
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      };
      const referencia = doc(collection(db, "torneios", torneioId, "partidas"));
      lote.set(referencia, dados);
      novasPartidas.push({ id: referencia.id, ...dados, criadoEm: new Date() });
    }
    lote.update(doc(db, "torneios", torneioId), {
      status: "andamento",
      iniciadoEm: serverTimestamp(),
      totalRodadas,
      atualizadoEm: serverTimestamp(),
    });
    await lote.commit();
    estado.partidasTorneio.set(torneioId, novasPartidas);
    torneio.status = "andamento";
    torneio.totalRodadas = totalRodadas;
    await registrarLog("torneio_iniciado", "torneio", torneioId, `Chave de “${texto(torneio.nome)}” gerada com ${quantidade} clubes`);
    renderizarTudo();
    toast("Chave gerada. O torneio está em andamento.");
  } catch (erro) {
    console.error("Erro ao iniciar torneio:", erro);
    botao.disabled = false;
    toast("Não foi possível gerar a chave.", "erro");
  }
}

function vencedorDaPartida(partida) {
  if (String(partida.vencedorId) === String(partida.timeAId)) {
    return { id: partida.timeAId, nome: partida.timeANome, escudo: partida.timeAEscudo || "" };
  }
  return { id: partida.timeBId, nome: partida.timeBNome, escudo: partida.timeBEscudo || "" };
}

async function avancarChaveSePossivel(torneioId, rodada) {
  const torneio = estado.dados.torneios.find((item) => item.id === torneioId);
  const partidas = partidasDoTorneio(torneioId);
  const rodadaAtual = partidas
    .filter((item) => numero(item.rodada, 1) === rodada)
    .sort((a, b) => numero(a.ordem, 0) - numero(b.ordem, 0));
  if (!rodadaAtual.length || rodadaAtual.some((item) => normalizar(item.status) !== "finalizado")) return;
  const totalRodadas = numero(torneio.totalRodadas, numero(rodadaAtual[0]?.totalRodadas, rodada));

  if (rodada >= totalRodadas || rodadaAtual.length === 1) {
    const campeao = vencedorDaPartida(rodadaAtual[0]);
    await updateDoc(doc(db, "torneios", torneioId), {
      status: "finalizado",
      campeaoId: campeao.id,
      campeaoNome: campeao.nome,
      campeaoEscudo: campeao.escudo,
      finalizadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    torneio.status = "finalizado";
    torneio.campeaoId = campeao.id;
    torneio.campeaoNome = campeao.nome;
    torneio.campeaoEscudo = campeao.escudo;
    await registrarLog("torneio_finalizado", "torneio", torneioId, `${campeao.nome} foi campeão de “${texto(torneio.nome)}”`);
    toast(`Torneio finalizado. Campeão: ${campeao.nome}.`);
    return;
  }

  const proximaRodada = rodada + 1;
  if (partidas.some((item) => numero(item.rodada, 1) === proximaRodada)) return;
  const vencedores = rodadaAtual.map(vencedorDaPartida);
  const novasPartidas = [];
  const lote = writeBatch(db);
  for (let indice = 0; indice < vencedores.length; indice += 2) {
    const timeA = vencedores[indice];
    const timeB = vencedores[indice + 1];
    const dados = {
      rodada: proximaRodada,
      totalRodadas,
      ordem: indice / 2,
      timeAId: timeA.id,
      timeANome: timeA.nome,
      timeAEscudo: timeA.escudo,
      timeBId: timeB.id,
      timeBNome: timeB.nome,
      timeBEscudo: timeB.escudo,
      status: "pendente",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    };
    const referencia = doc(collection(db, "torneios", torneioId, "partidas"));
    lote.set(referencia, dados);
    novasPartidas.push({ id: referencia.id, ...dados, criadoEm: new Date() });
  }
  await lote.commit();
  estado.partidasTorneio.set(torneioId, [...partidas, ...novasPartidas]);
  toast(`Rodada ${proximaRodada} criada automaticamente.`);
}

async function salvarResultado(torneioId, partidaId, botao) {
  if (!estado.podeModerar) return;
  const card = botao.closest(".admin-torneio-partida-admin");
  const valorPlacarA = card?.querySelector('[data-placar="a"]')?.value ?? "";
  const valorPlacarB = card?.querySelector('[data-placar="b"]')?.value ?? "";
  const placarA = valorPlacarA === "" ? -1 : Number(valorPlacarA);
  const placarB = valorPlacarB === "" ? -1 : Number(valorPlacarB);
  if (!Number.isInteger(placarA) || !Number.isInteger(placarB) || placarA < 0 || placarB < 0 || placarA > 99 || placarB > 99) {
    toast("Informe dois placares inteiros entre 0 e 99.", "erro");
    return;
  }
  if (placarA === placarB) {
    toast("Em mata-mata o resultado não pode terminar empatado. Informe o placar após os critérios de desempate.", "erro");
    return;
  }
  const partida = partidasDoTorneio(torneioId).find((item) => item.id === partidaId);
  if (!partida) return;
  const torneio = estado.dados.torneios.find((item) => item.id === torneioId);
  if (normalizar(partida.status) === "finalizado"
    && (statusTorneio(torneio) === "finalizado" || partidaTemChavePosterior(torneioId, partida))) {
    toast("Este placar não pode mais ser alterado porque a chave já avançou.", "erro");
    return;
  }
  const analise = analisarEnviosPartida(torneioId, partidaId);
  const resultadoOrigem = analise.tipo === "consenso"
    ? "consenso_capitaes"
    : analise.tipo === "divergencia"
      ? "decisao_admin"
      : "inserido_admin";
  const vencedorId = placarA > placarB ? partida.timeAId : partida.timeBId;
  const vencedorNome = placarA > placarB ? partida.timeANome : partida.timeBNome;
  botao.disabled = true;
  try {
    await updateDoc(doc(db, "torneios", torneioId, "partidas", partidaId), {
      placarA,
      placarB,
      vencedorId,
      vencedorNome,
      status: "finalizado",
      resultadoOrigem,
      homologadoEm: serverTimestamp(),
      finalizadaEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    Object.assign(partida, {
      placarA,
      placarB,
      vencedorId,
      vencedorNome,
      status: "finalizado",
      resultadoOrigem,
      homologadoEm: new Date(),
      finalizadaEm: new Date(),
    });
    await registrarLog("resultado_torneio_salvo", "partidaTorneio", partidaId, `${partida.timeANome} ${placarA} × ${placarB} ${partida.timeBNome}`);
    await avancarChaveSePossivel(torneioId, numero(partida.rodada, 1));
    renderizarTudo();
    toast("Resultado salvo.");
  } catch (erro) {
    console.error("Erro ao salvar resultado:", erro);
    botao.disabled = false;
    toast("Não foi possível salvar o resultado.", "erro");
  }
}

function renderizarTudo() {
  renderizarMetricas();
  renderizarResumos();
  renderizarUsuarios();
  renderizarClubes();
  renderizarVagas();
  renderizarTorneiosAdmin();
  renderizarAvaliacoes();
  renderizarDenuncias();
  renderizarManutencao();
  renderizarAtividade();
}

function abrirPainel(nome) {
  document.querySelectorAll(".admin-painel").forEach((painel) => {
    const ativo = painel.id === `admin-painel-${nome}`;
    painel.hidden = !ativo;
    painel.classList.toggle("ativo", ativo);
  });

  document.querySelectorAll("[data-admin-painel]").forEach((botao) => {
    const ativo = botao.dataset.adminPainel === nome;
    botao.classList.toggle("ativo", ativo);
    if (ativo) botao.setAttribute("aria-current", "page");
    else botao.removeAttribute("aria-current");
  });
}

async function registrarLog(acao, alvoTipo, alvoId, detalhes) {
  const dados = {
    acao,
    alvoTipo,
    alvoId,
    detalhes,
    adminUid: estado.usuario.uid,
    adminEmail: estado.usuario.email || "",
    adminNome: estado.config.nome || estado.usuario.displayName || "",
    criadoEm: serverTimestamp(),
  };

  try {
    const referencia = await addDoc(collection(db, "logsAdmin"), dados);
    estado.dados.logs.unshift({ ...dados, id: referencia.id, criadoEm: new Date() });
    renderizarAtividade();
  } catch (erro) {
    console.warn("A ação foi concluída, mas o log administrativo não foi salvo:", erro);
    toast("A ação foi concluída, mas o histórico não pôde ser salvo.", "erro");
  }
}

async function marcarDenunciaAnalisada(denunciaId, botao) {
  if (!estado.podeModerar) {
    toast("Sua conta possui somente acesso de leitura.", "erro");
    return;
  }

  botao.disabled = true;
  try {
    await updateDoc(doc(db, "denuncias", denunciaId), {
      status: "analisada",
      analisadaPor: estado.usuario.uid,
      analisadaEm: serverTimestamp(),
    });
    const denuncia = estado.dados.denuncias.find((item) => item.id === denunciaId);
    if (denuncia) {
      denuncia.status = "analisada";
      denuncia.analisadaPor = estado.usuario.uid;
      denuncia.analisadaEm = new Date();
    }
    renderizarTudo();
    await registrarLog(
      "denuncia_analisada",
      "denuncia",
      denunciaId,
      `Denúncia do clube ${texto(denuncia?.clube, "não informado")} analisada`,
    );
    toast("Denúncia marcada como analisada.");
  } catch (erro) {
    console.error("Erro ao analisar denúncia:", erro);
    botao.disabled = false;
    toast("Não foi possível atualizar a denúncia. Confira as permissões.", "erro");
  }
}

async function removerVaga(vagaId, nomeClube, denunciaId, botao) {
  if (!estado.podeModerar) {
    toast("Sua conta possui somente acesso de leitura.", "erro");
    return;
  }

  const motivo = await solicitarMotivo({
    titulo: "Remover vaga",
    mensagem: `Explique por que a vaga do clube “${nomeClube}” deve ser removida. Essa ação não pode ser desfeita.`,
    confirmar: "Remover vaga",
    destrutivo: true,
  });
  if (!motivo) return;

  botao.disabled = true;
  try {
    await deleteDoc(doc(db, "vagas", vagaId));
    estado.dados.vagas = estado.dados.vagas.filter((vaga) => vaga.id !== vagaId);

    if (denunciaId) {
      await updateDoc(doc(db, "denuncias", denunciaId), {
        status: "resolvida",
        motivoModeracao: motivo,
        resolvidaPor: estado.usuario.uid,
        resolvidaEm: serverTimestamp(),
      });
      const denuncia = estado.dados.denuncias.find((item) => item.id === denunciaId);
      if (denuncia) {
        denuncia.status = "resolvida";
        denuncia.motivoModeracao = motivo;
        denuncia.resolvidaPor = estado.usuario.uid;
        denuncia.resolvidaEm = new Date();
      }
    }

    renderizarTudo();
    await registrarLog(
      "vaga_removida",
      "vaga",
      vagaId,
      `Vaga do clube ${nomeClube} removida: ${motivo}`,
    );
    toast("Vaga removida com sucesso.");
  } catch (erro) {
    console.error("Erro ao remover vaga:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível remover a vaga. Confira as permissões do Firestore.", "erro");
  }
}

async function descartarDenuncia(denunciaId, clube, botao) {
  if (!estado.podeModerar) return toast("Sua conta possui somente acesso de leitura.", "erro");
  const motivo = await solicitarMotivo({
    titulo: "Descartar denúncia",
    mensagem: `Explique por que a denúncia relacionada a “${clube}” não exige remoção de conteúdo.`,
    confirmar: "Descartar denúncia",
  });
  if (!motivo) return;
  botao.disabled = true;
  try {
    await updateDoc(doc(db, "denuncias", denunciaId), {
      status: "descartada",
      motivoModeracao: motivo,
      descartadaPor: estado.usuario.uid,
      descartadaEm: serverTimestamp(),
    });
    const denuncia = estado.dados.denuncias.find((item) => item.id === denunciaId);
    if (denuncia) Object.assign(denuncia, {
      status: "descartada",
      motivoModeracao: motivo,
      descartadaPor: estado.usuario.uid,
      descartadaEm: new Date(),
    });
    renderizarTudo();
    await registrarLog("denuncia_descartada", "denuncia", denunciaId, `${clube}: ${motivo}`);
    toast("Denúncia descartada e registrada no histórico.");
  } catch (erro) {
    console.error("Erro ao descartar denúncia:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível descartar a denúncia.", "erro");
  }
}

async function arquivarDenuncia(denunciaId, botao) {
  const confirmado = await confirmModal({
    titulo: "Arquivar denúncia",
    mensagem: "A denúncia sairá das listas ativas, mas continuará disponível no filtro Arquivadas.",
    textoConfirmar: "Arquivar",
  });
  if (!confirmado) return;
  botao.disabled = true;
  try {
    await updateDoc(doc(db, "denuncias", denunciaId), {
      arquivada: true,
      arquivadaPor: estado.usuario.uid,
      arquivadaEm: serverTimestamp(),
    });
    const denuncia = estado.dados.denuncias.find((item) => item.id === denunciaId);
    if (denuncia) Object.assign(denuncia, { arquivada: true, arquivadaPor: estado.usuario.uid, arquivadaEm: new Date() });
    renderizarTudo();
    await registrarLog("denuncia_arquivada", "denuncia", denunciaId, "Denúncia movida para o arquivo");
    toast("Denúncia arquivada.");
  } catch (erro) {
    console.error("Erro ao arquivar denúncia:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível arquivar a denúncia.", "erro");
  }
}

async function restaurarDenuncia(denunciaId, botao) {
  botao.disabled = true;
  try {
    await updateDoc(doc(db, "denuncias", denunciaId), {
      arquivada: false,
      restauradaPor: estado.usuario.uid,
      restauradaEm: serverTimestamp(),
    });
    const denuncia = estado.dados.denuncias.find((item) => item.id === denunciaId);
    if (denuncia) Object.assign(denuncia, { arquivada: false, restauradaPor: estado.usuario.uid, restauradaEm: new Date() });
    renderizarTudo();
    await registrarLog("denuncia_restaurada", "denuncia", denunciaId, "Denúncia restaurada do arquivo");
    toast("Denúncia restaurada.");
  } catch (erro) {
    console.error("Erro ao restaurar denúncia:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível restaurar a denúncia.", "erro");
  }
}

async function excluirDenuncia(denunciaId, clube, botao) {
  const confirmado = await confirmModal({
    titulo: "Excluir denúncia definitivamente",
    mensagem: `Excluir a denúncia relacionada a “${clube}”? O registro de atividade administrativa será preservado.`,
    textoConfirmar: "Excluir definitivamente",
    destrutivo: true,
  });
  if (!confirmado) return;
  botao.disabled = true;
  try {
    await deleteDoc(doc(db, "denuncias", denunciaId));
    estado.dados.denuncias = estado.dados.denuncias.filter((item) => item.id !== denunciaId);
    renderizarTudo();
    await registrarLog("denuncia_excluida", "denuncia", denunciaId, `Denúncia relacionada a ${clube} excluída`);
    toast("Denúncia excluída definitivamente.");
  } catch (erro) {
    console.error("Erro ao excluir denúncia:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível excluir a denúncia.", "erro");
  }
}

async function excluirAvaliacao(avaliacaoId, nome, botao) {
  if (!estado.podeModerar) {
    toast("Sua conta possui somente acesso de leitura.", "erro");
    return;
  }
  const confirmado = await confirmModal({
    titulo: "Excluir avaliação",
    mensagem: `Remover definitivamente a avaliação do perfil “${nome}”? A nota deixará de contar na reputação.`,
    textoConfirmar: "Excluir avaliação",
    destrutivo: true,
  });
  if (!confirmado) return;
  botao.disabled = true;
  try {
    await deleteDoc(doc(db, "avaliacoes", avaliacaoId));
    estado.dados.avaliacoes = estado.dados.avaliacoes.filter((item) => item.id !== avaliacaoId);
    renderizarTudo();
    await registrarLog("avaliacao_excluida", "avaliacao", avaliacaoId, `Avaliação do perfil ${nome} excluída`);
    toast("Avaliação excluída da reputação.");
  } catch (erro) {
    console.error("Erro ao excluir avaliação:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível excluir a avaliação.", "erro");
  }
}

async function alterarSuspensaoJogador(jogadorId, nome, suspender, botao) {
  const motivo = await solicitarMotivo({
    titulo: suspender ? "Suspender jogador" : "Reativar jogador",
    mensagem: suspender
      ? `Informe por que “${nome}” será impedido de aparecer no mercado.`
      : `Informe por que o acesso de “${nome}” será reativado.`,
    confirmar: suspender ? "Suspender" : "Reativar",
    destrutivo: suspender,
  });
  if (!motivo) return;
  botao.disabled = true;
  try {
    const dados = suspender
      ? {
          suspenso: true,
          procurandoClube: false,
          suspensoPor: estado.usuario.uid,
          suspensoEm: serverTimestamp(),
          motivoSuspensao: motivo,
        }
      : {
          suspenso: false,
          motivoSuspensao: null,
          reativadoPor: estado.usuario.uid,
          reativadoEm: serverTimestamp(),
        };
    await updateDoc(doc(db, "jogadores", jogadorId), dados);
    const jogador = estado.dados.jogadores.find((item) => item.id === jogadorId);
    if (jogador) Object.assign(jogador, dados, suspender ? { suspensoEm: new Date() } : { reativadoEm: new Date() });
    renderizarTudo();
    await registrarLog(
      suspender ? "jogador_suspenso" : "jogador_reativado",
      "jogador",
      jogadorId,
      `${nome}: ${motivo}`,
    );
    toast(suspender ? "Jogador suspenso." : "Jogador reativado.");
  } catch (erro) {
    console.error("Erro ao alterar suspensão do jogador:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível atualizar o jogador.", "erro");
  }
}

async function alternarVerificacaoClube(clubeId, nome, verificado, botao) {
  const proximoValor = !verificado;
  const motivo = await solicitarMotivo({
    titulo: proximoValor ? "Verificar clube" : "Remover verificação",
    mensagem: `Registre o motivo desta decisão sobre “${nome}”.`,
    confirmar: proximoValor ? "Verificar" : "Remover selo",
  });
  if (!motivo) return;
  botao.disabled = true;
  try {
    await updateDoc(doc(db, "clubes", clubeId), {
      verificado: proximoValor,
      verificacaoAtualizadaPor: estado.usuario.uid,
      verificacaoAtualizadaEm: serverTimestamp(),
      motivoVerificacao: motivo,
    });
    const clube = estado.dados.clubes.find((item) => item.id === clubeId);
    if (clube) Object.assign(clube, { verificado: proximoValor, motivoVerificacao: motivo, verificacaoAtualizadaEm: new Date() });
    renderizarTudo();
    await registrarLog(
      proximoValor ? "clube_verificado" : "verificacao_clube_removida",
      "clube",
      clubeId,
      `${nome}: ${motivo}`,
    );
    toast(proximoValor ? "Clube verificado." : "Selo de verificação removido.");
  } catch (erro) {
    console.error("Erro ao alterar verificação do clube:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível atualizar a verificação.", "erro");
  }
}

async function alterarBloqueioClube(clubeId, nome, bloquear, botao) {
  const motivo = await solicitarMotivo({
    titulo: bloquear ? "Bloquear clube" : "Desbloquear clube",
    mensagem: bloquear
      ? `O clube “${nome}” deixará de aparecer nas áreas públicas e não poderá publicar vagas.`
      : `O clube “${nome}” voltará a aparecer e publicar vagas.`,
    confirmar: bloquear ? "Bloquear clube" : "Desbloquear clube",
    destrutivo: bloquear,
  });
  if (!motivo) return;
  botao.disabled = true;
  try {
    const dados = bloquear
      ? {
          suspenso: true,
          suspensoPor: estado.usuario.uid,
          suspensoEm: serverTimestamp(),
          motivoSuspensao: motivo,
        }
      : {
          suspenso: false,
          motivoSuspensao: null,
          desbloqueadoPor: estado.usuario.uid,
          desbloqueadoEm: serverTimestamp(),
        };
    await updateDoc(doc(db, "clubes", clubeId), dados);
    const clube = estado.dados.clubes.find((item) => item.id === clubeId);
    if (clube) Object.assign(clube, dados, bloquear ? { suspensoEm: new Date() } : { desbloqueadoEm: new Date() });
    renderizarTudo();
    await registrarLog(
      bloquear ? "clube_bloqueado" : "clube_desbloqueado",
      "clube",
      clubeId,
      `${nome}: ${motivo}`,
    );
    toast(bloquear ? "Clube bloqueado." : "Clube desbloqueado.");
  } catch (erro) {
    console.error("Erro ao alterar bloqueio do clube:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível atualizar o clube.", "erro");
  }
}

async function excluirRegistroInvalido(colecaoEstado, registroId, tipo, botao) {
  const colecaoFirestore = colecaoEstado === "convites" ? "convitesClube" : "candidaturas";
  const confirmado = await confirmModal({
    titulo: "Excluir registro inválido",
    mensagem: `Excluir ${tipo.toLowerCase()} ${registroId}? Esta ação é indicada apenas para registros antigos quebrados.`,
    textoConfirmar: "Excluir registro",
    destrutivo: true,
  });
  if (!confirmado) return;
  botao.disabled = true;
  try {
    await deleteDoc(doc(db, colecaoFirestore, registroId));
    estado.dados[colecaoEstado] = estado.dados[colecaoEstado].filter((item) => item.id !== registroId);
    renderizarTudo();
    await registrarLog("registro_invalido_excluido", colecaoFirestore, registroId, `${tipo} inválida removida`);
    toast("Registro inválido excluído.");
  } catch (erro) {
    console.error("Erro ao excluir registro inválido:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível excluir o registro inválido.", "erro");
  }
}

async function limparRegistrosInvalidos(botao) {
  const invalidos = registrosInvalidos();
  if (!invalidos.length) return toast("Nenhum registro inválido foi encontrado.");
  const confirmado = await confirmModal({
    titulo: "Limpar todos os registros inválidos",
    mensagem: `Excluir ${invalidos.length} registro(s) antigo(s) que não possuem os identificadores necessários?`,
    textoConfirmar: "Limpar registros",
    destrutivo: true,
  });
  if (!confirmado) return;
  botao.disabled = true;
  try {
    await Promise.all(invalidos.map((item) => deleteDoc(doc(
      db,
      item.colecao === "convites" ? "convitesClube" : "candidaturas",
      item.id,
    ))));
    const idsCandidaturas = new Set(invalidos.filter((item) => item.colecao === "candidaturas").map((item) => item.id));
    const idsConvites = new Set(invalidos.filter((item) => item.colecao === "convites").map((item) => item.id));
    estado.dados.candidaturas = estado.dados.candidaturas.filter((item) => !idsCandidaturas.has(item.id));
    estado.dados.convites = estado.dados.convites.filter((item) => !idsConvites.has(item.id));
    renderizarTudo();
    await registrarLog(
      "registro_invalido_excluido",
      "manutencao",
      "lote",
      `${invalidos.length} registro(s) inválido(s) removido(s)`,
    );
    toast(`${invalidos.length} registro(s) inválido(s) removido(s).`);
  } catch (erro) {
    console.error("Erro ao limpar registros inválidos:", erro);
    botao.disabled = false;
    toast("A limpeza não foi concluída. Atualize os dados antes de tentar novamente.", "erro");
  }
}

async function protegerEmailsPublicos(botao) {
  const jogadoresComEmail = estado.dados.jogadores.filter((jogador) => (
    typeof jogador.email === "string" && jogador.email.includes("@")
  ));
  if (!jogadoresComEmail.length) return toast("Todos os e-mails já estão protegidos.");

  const confirmado = await confirmModal({
    titulo: "Proteger e-mails dos usuários",
    mensagem: `Mover ${jogadoresComEmail.length} e-mail(s) dos perfis públicos para a área privada? Foto, overall e level não serão alterados.`,
    textoConfirmar: "Proteger e-mails",
  });
  if (!confirmado) return;

  botao.disabled = true;
  botao.textContent = "Protegendo...";
  try {
    for (let inicio = 0; inicio < jogadoresComEmail.length; inicio += 200) {
      const lote = jogadoresComEmail.slice(inicio, inicio + 200);
      const batch = writeBatch(db);
      lote.forEach((jogador) => {
        batch.set(doc(db, "jogadoresPrivados", jogador.id), {
          email: jogador.email.trim().toLowerCase(),
          atualizadoEm: serverTimestamp(),
        }, { merge: true });
        batch.update(doc(db, "jogadores", jogador.id), { email: deleteField() });
      });
      await batch.commit();
    }

    jogadoresComEmail.forEach((jogador) => {
      const existente = estado.dados.privados.find((item) => item.id === jogador.id);
      if (existente) existente.email = jogador.email.trim().toLowerCase();
      else estado.dados.privados.push({ id: jogador.id, email: jogador.email.trim().toLowerCase() });
      delete jogador.email;
    });
    renderizarTudo();
    await registrarLog(
      "emails_publicos_protegidos",
      "manutencao",
      "jogadoresPrivados",
      `${jogadoresComEmail.length} e-mail(s) movido(s) para documentos privados`,
    );
    toast(`${jogadoresComEmail.length} e-mail(s) protegido(s) com sucesso.`);
  } catch (erro) {
    console.error("Erro ao proteger e-mails públicos:", erro);
    botao.disabled = false;
    botao.textContent = "Proteger e-mails agora";
    toast("Não foi possível proteger os e-mails. Publique as novas regras e tente novamente.", "erro");
  }
}

function configurarEventos() {
  document.querySelectorAll("[data-admin-painel]").forEach((botao) => {
    botao.addEventListener("click", () => abrirPainel(botao.dataset.adminPainel));
  });

  document.querySelectorAll("[data-abrir-painel]").forEach((botao) => {
    botao.addEventListener("click", () => abrirPainel(botao.dataset.abrirPainel));
  });

  porId("admin-busca-usuarios")?.addEventListener("input", renderizarUsuarios);
  porId("admin-filtro-usuarios")?.addEventListener("change", renderizarUsuarios);
  porId("admin-busca-clubes")?.addEventListener("input", renderizarClubes);
  porId("admin-busca-vagas")?.addEventListener("input", renderizarVagas);
  porId("admin-busca-avaliacoes")?.addEventListener("input", renderizarAvaliacoes);
  porId("admin-filtro-denuncias")?.addEventListener("change", renderizarDenuncias);
  porId("admin-atualizar")?.addEventListener("click", carregarDados);
  porId("admin-limpar-invalidos")?.addEventListener("click", (evento) => limparRegistrosInvalidos(evento.currentTarget));
  porId("admin-proteger-emails")?.addEventListener("click", (evento) => protegerEmailsPublicos(evento.currentTarget));
  porId("admin-form-torneio")?.addEventListener("submit", salvarTorneio);
  porId("admin-cancelar-edicao-torneio")?.addEventListener("click", limparFormularioTorneio);
  porId("admin-torneio-modal-fechar")?.addEventListener("click", fecharModalTorneio);
  porId("admin-torneio-modal")?.addEventListener("click", (evento) => {
    if (evento.target === evento.currentTarget) fecharModalTorneio();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !porId("admin-torneio-modal")?.hidden) fecharModalTorneio();
  });

  document.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-admin-acao]");
    if (!(botao instanceof HTMLButtonElement)) return;
    const acao = botao.dataset.adminAcao;
    if (acao === "analisar-denuncia") marcarDenunciaAnalisada(botao.dataset.denunciaId, botao);
    if (acao === "descartar-denuncia") descartarDenuncia(botao.dataset.denunciaId, botao.dataset.clube || "Clube", botao);
    if (acao === "arquivar-denuncia") arquivarDenuncia(botao.dataset.denunciaId, botao);
    if (acao === "restaurar-denuncia") restaurarDenuncia(botao.dataset.denunciaId, botao);
    if (acao === "excluir-denuncia") excluirDenuncia(botao.dataset.denunciaId, botao.dataset.clube || "Clube", botao);
    if (acao === "excluir-avaliacao") excluirAvaliacao(botao.dataset.avaliacaoId, botao.dataset.nome || "perfil", botao);
    if (acao === "remover-vaga") {
      removerVaga(botao.dataset.vagaId, botao.dataset.clube || "este clube", botao.dataset.denunciaId || "", botao);
    }
    if (acao === "suspender-jogador" || acao === "reativar-jogador") {
      alterarSuspensaoJogador(botao.dataset.jogadorId, botao.dataset.nome || "Jogador", acao === "suspender-jogador", botao);
    }
    if (acao === "alternar-verificacao-clube") {
      alternarVerificacaoClube(
        botao.dataset.clubeId,
        botao.dataset.nome || "Clube",
        botao.dataset.verificado === "true",
        botao,
      );
    }
    if (acao === "bloquear-clube" || acao === "desbloquear-clube") {
      alterarBloqueioClube(botao.dataset.clubeId, botao.dataset.nome || "Clube", acao === "bloquear-clube", botao);
    }
    if (acao === "excluir-registro-invalido") {
      excluirRegistroInvalido(botao.dataset.colecao, botao.dataset.registroId, botao.dataset.tipo || "Registro", botao);
    }
    if (acao === "gerenciar-torneio") abrirGerenciarTorneio(botao.dataset.torneioId);
    if (acao === "editar-torneio") editarTorneio(botao.dataset.torneioId);
    if (acao === "excluir-torneio") {
      excluirTorneio(botao.dataset.torneioId, botao.dataset.nome || "Torneio", botao);
    }
    if (acao === "status-inscricao-torneio") {
      alterarStatusInscricaoTorneio(
        botao.dataset.torneioId,
        botao.dataset.inscricaoId,
        botao.dataset.status,
        botao,
      );
    }
    if (acao === "iniciar-torneio") iniciarTorneio(botao.dataset.torneioId, botao);
    if (acao === "salvar-resultado") salvarResultado(botao.dataset.torneioId, botao.dataset.partidaId, botao);
  });
}

configurarEventos();

onAuthStateChanged(auth, async (usuario) => {
  estado.carregamento += 1;
  estado.usuario = null;
  estado.config = {};
  estado.podeModerar = false;
  porId("admin-app").hidden = true;

  if (!usuario) {
    mostrarAcesso(
      "Entre para continuar",
      "O painel administrativo está disponível somente para contas autorizadas.",
      true,
    );
    return;
  }

  mostrarCarregamentoAcesso();
  try {
    let adminSnap;
    try {
      // A permissão administrativa precisa vir atualizada do Firebase.
      // Isso evita que uma configuração antiga salva no navegador mantenha
      // o painel em modo de leitura depois de moderarConteudo ser habilitado.
      adminSnap = await getDocFromServer(doc(db, "admins", usuario.uid));
    } catch (erroServidor) {
      console.warn("Não foi possível validar o administrador direto no servidor:", erroServidor);
      adminSnap = await getDoc(doc(db, "admins", usuario.uid));
    }
    if (auth.currentUser?.uid !== usuario.uid) return;

    if (!adminSnap.exists() || adminSnap.data().ativo !== true) {
      mostrarAcesso(
        "Acesso não autorizado",
        "Sua conta está conectada, mas não possui permissão para abrir esta área.",
      );
      return;
    }

    estado.usuario = usuario;
    estado.config = adminSnap.data();
    estado.podeModerar = estado.config.permissoes?.moderarConteudo === true;

    porId("admin-estado-acesso").hidden = true;
    porId("admin-app").hidden = false;
    porId("admin-aviso-permissao").hidden = estado.podeModerar;
    porId("admin-nome").textContent = estado.config.nome
      || usuario.displayName
      || usuario.email
      || "Administrador";

    await carregarDados();
  } catch (erro) {
    console.error("Erro ao validar acesso administrativo:", erro);
    mostrarAcesso(
      "Não foi possível validar o acesso",
      "Confira sua conexão e as regras da coleção de administradores no Firebase.",
    );
  }
});

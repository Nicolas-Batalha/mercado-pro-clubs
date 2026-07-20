import { auth, db } from "./firebase-config.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { confirmModal } from "./confirm-modal.js";

const STATUS_VALIDOS = ["informada", "pendente", "confirmada", "contestada"];
const TIPOS_VALIDOS = ["torneio", "liga", "amistoso", "treino"];
const CAMPOS_STATS = [
  { chave: "posse", id: "stats-posse", max: 100, sufixo: "%" },
  { chave: "finalizacoes", id: "stats-finalizacoes", max: 999 },
  { chave: "chutesGol", id: "stats-chutes-gol", max: 999 },
  { chave: "passes", id: "stats-passes", max: 9999 },
  { chave: "desarmes", id: "stats-desarmes", max: 999 },
  { chave: "defesas", id: "stats-defesas", max: 999 },
  { chave: "escanteios", id: "stats-escanteios", max: 99 },
  { chave: "faltas", id: "stats-faltas", max: 99 },
  { chave: "amarelos", id: "stats-amarelos", max: 99 },
  { chave: "vermelhos", id: "stats-vermelhos", max: 99 },
];

const estado = {
  uid: "",
  clube: {},
  elenco: [],
  partidas: [],
  confirmacoes: [],
  clubes: [],
  provaImagem: "",
  eventosLigados: false,
  getClube: () => ({}),
  getElenco: () => [],
};

function escHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[caractere]));
}

function imagemSegura(src, fallback = "../IMG/user-icon.svg") {
  const valor = String(src || "").trim();
  if (!valor) return fallback;
  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(valor)) return valor;
  if (/^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(valor)) return valor;
  if (/^(?:\.\.\/|\.\/)[a-z0-9_./ -]+$/i.test(valor)) return valor;
  return fallback;
}

function mostrarToast(mensagem, tipo = "sucesso") {
  document.getElementById("toast-mercado-stats")?.remove();
  const toast = document.createElement("div");
  toast.id = "toast-mercado-stats";
  toast.textContent = mensagem;
  toast.className = `mercado-stats-toast ${tipo}`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visivel"));
  window.setTimeout(() => {
    toast.classList.remove("visivel");
    window.setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function timestampMs(valor) {
  if (!valor) return 0;
  if (typeof valor?.toMillis === "function") return valor.toMillis();
  if (valor instanceof Date) return valor.getTime();
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
}

function dataPartidaMs(partida) {
  return timestampMs(partida?.dataPartida) || timestampMs(partida?.criadoEm);
}

function formatarDataPartida(partida, incluirHora = false) {
  const ms = dataPartidaMs(partida);
  if (!ms) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", incluirHora
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" }).format(new Date(ms));
}

function statusPartida(partida) {
  const status = String(partida?.status || "informada").toLowerCase();
  return STATUS_VALIDOS.includes(status) ? status : "informada";
}

function rotuloStatus(status) {
  return {
    informada: "Informado pelo clube",
    pendente: "Aguardando adversário",
    confirmada: "Resultado verificado",
    contestada: "Resultado contestado",
  }[status] || "Informado pelo clube";
}

function resultadoPartida(partida) {
  const pro = Number(partida?.placarClube) || 0;
  const contra = Number(partida?.placarAdversario) || 0;
  if (pro > contra) return "vitoria";
  if (pro < contra) return "derrota";
  return "empate";
}

function letraResultado(resultado) {
  return resultado === "vitoria" ? "V" : resultado === "derrota" ? "D" : "E";
}

function setTexto(id, valor) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = String(valor);
}

function ordenarPartidas(partidas) {
  return [...partidas].sort((a, b) => dataPartidaMs(b) - dataPartidaMs(a));
}

function atualizarContexto({ uid, clube, elenco } = {}) {
  if (uid) estado.uid = uid;
  if (clube) estado.clube = clube;
  if (Array.isArray(elenco)) estado.elenco = elenco;
  const clubeAtual = estado.getClube?.();
  const elencoAtual = estado.getElenco?.();
  if (clubeAtual && typeof clubeAtual === "object") estado.clube = clubeAtual;
  if (Array.isArray(elencoAtual)) estado.elenco = elencoAtual;
}

function renderizarResumo() {
  const partidas = estado.partidas.filter((partida) => statusPartida(partida) !== "contestada");
  const resultados = partidas.map(resultadoPartida);
  const vitorias = resultados.filter((item) => item === "vitoria").length;
  const empates = resultados.filter((item) => item === "empate").length;
  const derrotas = resultados.filter((item) => item === "derrota").length;
  const golsPro = partidas.reduce((total, partida) => total + (Number(partida.placarClube) || 0), 0);
  const golsContra = partidas.reduce((total, partida) => total + (Number(partida.placarAdversario) || 0), 0);
  const aproveitamento = partidas.length ? Math.round(((vitorias * 3 + empates) / (partidas.length * 3)) * 100) : 0;
  const verificados = partidas.filter((partida) => statusPartida(partida) === "confirmada").length;

  setTexto("mercado-stat-jogos", partidas.length);
  setTexto("mercado-stat-verificados", `${verificados} resultado${verificados === 1 ? "" : "s"} verificado${verificados === 1 ? "" : "s"}`);
  setTexto("mercado-stat-vitorias", vitorias);
  setTexto("mercado-stat-empates", empates);
  setTexto("mercado-stat-derrotas", derrotas);
  setTexto("mercado-stat-aproveitamento", `${aproveitamento}%`);
  setTexto("mercado-stat-gols-pro", golsPro);
  setTexto("mercado-stat-media-gols", `média ${partidas.length ? (golsPro / partidas.length).toFixed(1).replace(".", ",") : "0,0"}`);
  setTexto("mercado-stat-gols-contra", golsContra);
  setTexto("mercado-stat-saldo", golsPro - golsContra > 0 ? `+${golsPro - golsContra}` : golsPro - golsContra);

  const recentes = ordenarPartidas(partidas).slice(0, 5);
  const resultadosRecentes = recentes.map(resultadoPartida);
  const vitoriasRecentes = resultadosRecentes.filter((item) => item === "vitoria").length;
  const empatesRecentes = resultadosRecentes.filter((item) => item === "empate").length;
  const derrotasRecentes = resultadosRecentes.filter((item) => item === "derrota").length;
  const forma = document.getElementById("mercado-stats-forma");
  if (forma) {
    forma.innerHTML = recentes.length
      ? recentes.map((partida) => {
          const resultado = resultadoPartida(partida);
          return `<span class="${resultado}" title="${escHtml(partida.clubeNome || "Seu clube")} ${Number(partida.placarClube) || 0} x ${Number(partida.placarAdversario) || 0} ${escHtml(partida.adversarioNome || "Adversário")}">${letraResultado(resultado)}</span>`;
        }).join("")
      : "";
  }
  setTexto("mercado-stats-forma-texto", recentes.length
    ? `Últimos ${recentes.length} jogo${recentes.length === 1 ? "" : "s"}: ${vitoriasRecentes} vitória${vitoriasRecentes === 1 ? "" : "s"}, ${empatesRecentes} empate${empatesRecentes === 1 ? "" : "s"} e ${derrotasRecentes} derrota${derrotasRecentes === 1 ? "" : "s"}.`
    : "Registre partidas para acompanhar a sequência.");
}

function mediaCampo(partidas, chave) {
  const comCampo = partidas.filter((partida) => Array.isArray(partida.camposEstatisticas) && partida.camposEstatisticas.includes(chave));
  if (!comCampo.length) return null;
  return comCampo.reduce((total, partida) => total + (Number(partida.estatisticas?.[chave]) || 0), 0) / comCampo.length;
}

function renderizarMedias() {
  const partidas = estado.partidas.filter((partida) => statusPartida(partida) !== "contestada");
  const campos = [
    ["posse", "mercado-media-posse", "%"],
    ["finalizacoes", "mercado-media-finalizacoes", ""],
    ["chutesGol", "mercado-media-chutes-gol", ""],
    ["passes", "mercado-media-passes", ""],
    ["desarmes", "mercado-media-desarmes", ""],
    ["defesas", "mercado-media-defesas", ""],
  ];
  campos.forEach(([chave, id, sufixo]) => {
    const media = mediaCampo(partidas, chave);
    setTexto(id, media === null ? "—" : `${media.toFixed(1).replace(".", ",")}${sufixo}`);
  });
}

function renderizarRankingJogadores() {
  const tabela = document.getElementById("mercado-stats-jogadores");
  if (!tabela) return;
  const roster = new Map(estado.elenco.map((jogador) => [jogador.uid, jogador]));
  const ranking = new Map();

  estado.partidas
    .filter((partida) => statusPartida(partida) !== "contestada")
    .forEach((partida) => {
      (Array.isArray(partida.jogadores) ? partida.jogadores : []).forEach((jogador) => {
        const uid = String(jogador.uid || "");
        if (!uid) return;
        const atual = ranking.get(uid) || {
          uid,
          nome: jogador.nome || roster.get(uid)?.nickname || "Jogador",
          posicao: jogador.posicao || roster.get(uid)?.posicao || "—",
          jogos: 0,
          gols: 0,
          assistencias: 0,
          defesas: 0,
          notaTotal: 0,
          notas: 0,
          mvp: 0,
        };
        atual.jogos += 1;
        atual.gols += Number(jogador.gols) || 0;
        atual.assistencias += Number(jogador.assistencias) || 0;
        atual.defesas += Number(jogador.defesas) || 0;
        if (Number(jogador.nota) > 0) {
          atual.notaTotal += Number(jogador.nota);
          atual.notas += 1;
        }
        if (jogador.mvp === true) atual.mvp += 1;
        ranking.set(uid, atual);
      });
    });

  const ordenado = [...ranking.values()].sort((a, b) =>
    b.mvp - a.mvp || b.gols - a.gols || b.assistencias - a.assistencias || b.jogos - a.jogos);
  setTexto("mercado-stats-jogadores-total", `${ordenado.length} jogador${ordenado.length === 1 ? "" : "es"} com dados`);
  tabela.innerHTML = ordenado.length
    ? ordenado.map((jogador) => {
        const perfil = roster.get(jogador.uid) || {};
        return `<tr>
          <td><a class="mercado-stats-jogador" href="./meu-perfil.html?uid=${encodeURIComponent(jogador.uid)}"><img src="${escHtml(imagemSegura(perfil.fotoURL))}" alt=""><span><strong>${escHtml(jogador.nome)}</strong><small>${escHtml(jogador.posicao || "—")}</small></span></a></td>
          <td>${jogador.jogos}</td><td>${jogador.gols}</td><td>${jogador.assistencias}</td><td>${jogador.defesas}</td>
          <td>${jogador.notas ? (jogador.notaTotal / jogador.notas).toFixed(1).replace(".", ",") : "—"}</td><td>${jogador.mvp}</td>
        </tr>`;
      }).join("")
    : '<tr><td colspan="7">Nenhuma estatística registrada.</td></tr>';
}

function resumoNumerosPartida(partida) {
  const preenchidos = Array.isArray(partida.camposEstatisticas) ? partida.camposEstatisticas : [];
  const exibidos = [
    ["posse", "Posse", "%"],
    ["finalizacoes", "Finalizações", ""],
    ["chutesGol", "No gol", ""],
    ["passes", "Passes", ""],
  ].filter(([chave]) => preenchidos.includes(chave)).slice(0, 4);
  if (!exibidos.length) return "";
  return `<div class="mercado-stats-partida-numeros">${exibidos.map(([chave, rotulo, sufixo]) => `<span><b>${Number(partida.estatisticas?.[chave]) || 0}${sufixo}</b>${rotulo}</span>`).join("")}</div>`;
}

function renderizarHistorico() {
  const lista = document.getElementById("mercado-stats-historico");
  if (!lista) return;
  const filtro = document.getElementById("mercado-stats-filtro-status")?.value || "todos";
  const partidas = ordenarPartidas(estado.partidas).filter((partida) => filtro === "todos" || statusPartida(partida) === filtro);
  lista.innerHTML = partidas.length
    ? partidas.map((partida) => {
        const status = statusPartida(partida);
        const resultado = resultadoPartida(partida);
        const prova = imagemSegura(partida.provaImagem, "");
        return `<article class="mercado-stats-partida ${status}">
          <div class="mercado-stats-partida-topo">
            <div><span>${escHtml(formatarDataPartida(partida, true))}</span><b>${escHtml(partida.competicao || partida.tipo || "Partida")}</b></div>
            <span class="mercado-stats-status ${status}">${escHtml(rotuloStatus(status))}</span>
          </div>
          <div class="mercado-stats-placar">
            <strong>${escHtml(partida.clubeNome || estado.clube.nome || "Seu clube")}</strong>
            <div><span class="${resultado}">${letraResultado(resultado)}</span><b>${Number(partida.placarClube) || 0} <i>×</i> ${Number(partida.placarAdversario) || 0}</b></div>
            <strong>${escHtml(partida.adversarioNome || "Adversário")}</strong>
          </div>
          ${resumoNumerosPartida(partida)}
          ${partida.observacao ? `<p class="mercado-stats-partida-observacao">${escHtml(partida.observacao)}</p>` : ""}
          <div class="mercado-stats-partida-acoes">
            ${prova ? `<details><summary>Ver comprovante</summary><img src="${escHtml(prova)}" alt="Comprovante da partida"></details>` : ""}
            ${status !== "confirmada" ? `<button type="button" class="perigo" data-stats-excluir="${escHtml(partida.id)}">Excluir registro</button>` : ""}
          </div>
        </article>`;
      }).join("")
    : `<div class="clube-estado-vazio">${estado.partidas.length ? "Nenhuma partida corresponde a este filtro." : "Nenhuma partida registrada. Use “Registrar partida” para começar."}</div>`;
}

function renderizarConfirmacoes() {
  const card = document.getElementById("mercado-stats-confirmacoes-card");
  const lista = document.getElementById("mercado-stats-confirmacoes");
  if (!card || !lista) return;
  const pendentes = ordenarPartidas(estado.confirmacoes.filter((partida) => statusPartida(partida) === "pendente"));
  card.hidden = pendentes.length === 0;
  setTexto("mercado-stats-confirmacoes-total", `${pendentes.length} pendente${pendentes.length === 1 ? "" : "s"}`);
  lista.innerHTML = pendentes.map((partida) => `<article class="mercado-stats-confirmacao-item">
    <div><span>${escHtml(formatarDataPartida(partida))}</span><strong>${escHtml(partida.clubeNome || "Clube adversário")}</strong><small>${Number(partida.placarClube) || 0} × ${Number(partida.placarAdversario) || 0} ${escHtml(estado.clube.nome || "Seu clube")}</small></div>
    <div><button type="button" data-stats-resposta="confirmar" data-partida-id="${escHtml(partida.id)}">Confirmar</button><button type="button" class="perigo" data-stats-resposta="contestar" data-partida-id="${escHtml(partida.id)}">Contestar</button></div>
  </article>`).join("");
}

function renderizarTudo() {
  renderizarResumo();
  renderizarMedias();
  renderizarRankingJogadores();
  renderizarHistorico();
  renderizarConfirmacoes();
  setTexto("clube-estatisticas-atualizadas", `Atualizado às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`);
}

function preencherClubesAdversarios() {
  const select = document.getElementById("stats-adversario-id");
  if (!select) return;
  const clubes = estado.clubes
    .filter((clube) => clube.id !== estado.uid && String(clube.nome || "").trim())
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  select.innerHTML = '<option value="">Não está cadastrado</option>' + clubes
    .map((clube) => `<option value="${escHtml(clube.id)}">${escHtml(clube.nome)}</option>`).join("");
}

function renderizarJogadoresFormulario() {
  const container = document.getElementById("mercado-stats-jogadores-form");
  if (!container) return;
  const jogadores = [...estado.elenco].sort((a, b) => String(a.nickname || "").localeCompare(String(b.nickname || ""), "pt-BR"));
  container.innerHTML = jogadores.length
    ? jogadores.map((jogador) => `<article class="mercado-stats-jogador-form" data-stats-jogador="${escHtml(jogador.uid)}">
        <label class="mercado-stats-participou"><input type="checkbox" data-stats-campo="participou"><img src="${escHtml(imagemSegura(jogador.fotoURL))}" alt=""><span><strong>${escHtml(jogador.nickname || "Jogador")}</strong><small>${escHtml(jogador.posicao || "Posição não informada")}</small></span></label>
        <label><span>Gols</span><input type="number" min="0" max="99" value="0" data-stats-campo="gols" disabled></label>
        <label><span>Assist.</span><input type="number" min="0" max="99" value="0" data-stats-campo="assistencias" disabled></label>
        <label><span>Defesas</span><input type="number" min="0" max="99" value="0" data-stats-campo="defesas" disabled></label>
        <label><span>Nota</span><input type="number" min="0" max="10" step="0.1" placeholder="0–10" data-stats-campo="nota" disabled></label>
        <label class="mercado-stats-mvp"><input type="radio" name="stats-mvp" value="${escHtml(jogador.uid)}" disabled><span>MVP</span></label>
      </article>`).join("")
    : '<div class="clube-estado-vazio">Adicione jogadores ao elenco antes de registrar o desempenho individual.</div>';
}

function limparProva() {
  estado.provaImagem = "";
  const input = document.getElementById("stats-prova");
  const preview = document.getElementById("mercado-stats-prova-preview");
  if (input) input.value = "";
  if (preview) {
    preview.hidden = true;
    const imagem = preview.querySelector("img");
    if (imagem) imagem.removeAttribute("src");
  }
}

function dataLocalInput(data = new Date()) {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function abrirModal() {
  atualizarContexto();
  const modal = document.getElementById("mercado-stats-modal");
  const formulario = document.getElementById("mercado-stats-form");
  if (!modal || !formulario) return;
  formulario.reset();
  limparProva();
  const adversarioNome = document.getElementById("stats-adversario-nome");
  if (adversarioNome) adversarioNome.readOnly = false;
  preencherClubesAdversarios();
  renderizarJogadoresFormulario();
  const data = document.getElementById("stats-data");
  if (data) data.value = dataLocalInput();
  setTexto("stats-placar-clube-nome", estado.clube.nome || "Seu clube");
  setTexto("stats-placar-adversario-nome", "Adversário");
  const feedback = document.getElementById("mercado-stats-form-feedback");
  if (feedback) feedback.textContent = "";
  modal.hidden = false;
  document.body.classList.add("mercado-stats-modal-aberto");
  window.setTimeout(() => data?.focus(), 50);
}

function fecharModal() {
  const modal = document.getElementById("mercado-stats-modal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("mercado-stats-modal-aberto");
  limparProva();
}

function comprimirImagem(arquivo, maxLado = 1200, qualidade = 0.72) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.onload = (evento) => {
      const imagem = new Image();
      imagem.onerror = () => reject(new Error("Imagem inválida."));
      imagem.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(imagem.width, imagem.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(imagem.width * escala));
        canvas.height = Math.max(1, Math.round(imagem.height * escala));
        const contexto = canvas.getContext("2d");
        if (!contexto) return reject(new Error("Não foi possível processar a imagem."));
        contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      imagem.src = evento.target.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

async function prepararProva(arquivo) {
  if (!arquivo) return;
  if (!/^image\/(?:png|jpeg|webp)$/i.test(arquivo.type)) throw new Error("Use uma imagem PNG, JPG ou WebP.");
  if (arquivo.size > 2 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 2MB.");
  const comprimida = await comprimirImagem(arquivo);
  if (comprimida.length > 650_000) throw new Error("A imagem ainda ficou muito grande. Tente uma captura menor.");
  estado.provaImagem = comprimida;
  const preview = document.getElementById("mercado-stats-prova-preview");
  if (preview) {
    preview.hidden = false;
    const imagem = preview.querySelector("img");
    if (imagem) imagem.src = comprimida;
  }
}

function coletarEstatisticasClube() {
  const estatisticas = {};
  const camposEstatisticas = [];
  CAMPOS_STATS.forEach(({ chave, id, max }) => {
    const campo = document.getElementById(id);
    const texto = String(campo?.value ?? "").trim();
    const numero = texto === "" ? 0 : Number(texto);
    if (!Number.isInteger(numero) || numero < 0 || numero > max) throw new Error(`Confira o campo ${campo?.closest("label")?.querySelector("span")?.textContent || chave}.`);
    estatisticas[chave] = numero;
    if (texto !== "") camposEstatisticas.push(chave);
  });
  return { estatisticas, camposEstatisticas };
}

function coletarJogadores() {
  const roster = new Map(estado.elenco.map((jogador) => [jogador.uid, jogador]));
  const jogadores = [];
  document.querySelectorAll("[data-stats-jogador]").forEach((linha) => {
    if (!linha.querySelector('[data-stats-campo="participou"]')?.checked) return;
    const uid = String(linha.dataset.statsJogador || "");
    const perfil = roster.get(uid) || {};
    const inteiro = (campo) => {
      const numero = Number(linha.querySelector(`[data-stats-campo="${campo}"]`)?.value || 0);
      if (!Number.isInteger(numero) || numero < 0 || numero > 99) throw new Error(`Confira os números de ${perfil.nickname || "um jogador"}.`);
      return numero;
    };
    const notaTexto = String(linha.querySelector('[data-stats-campo="nota"]')?.value || "").trim();
    const nota = notaTexto ? Number(notaTexto) : 0;
    if (!Number.isFinite(nota) || nota < 0 || nota > 10) throw new Error(`A nota de ${perfil.nickname || "um jogador"} deve ficar entre 0 e 10.`);
    jogadores.push({
      uid,
      nome: String(perfil.nickname || "Jogador").slice(0, 80),
      posicao: String(perfil.posicao || "").slice(0, 30),
      gols: inteiro("gols"),
      assistencias: inteiro("assistencias"),
      defesas: inteiro("defesas"),
      nota: Math.round(nota * 10) / 10,
      mvp: linha.querySelector('input[name="stats-mvp"]')?.checked === true,
    });
  });
  if (jogadores.length > 30) throw new Error("Uma partida pode ter no máximo 30 jogadores registrados.");
  return jogadores;
}

async function salvarPartida(evento) {
  evento.preventDefault();
  atualizarContexto();
  const usuario = auth.currentUser;
  const feedback = document.getElementById("mercado-stats-form-feedback");
  const botao = document.getElementById("mercado-stats-salvar");
  try {
    if (!usuario || usuario.uid !== estado.uid) throw new Error("Entre novamente na sua conta para registrar a partida.");
    if (!usuario.emailVerified) throw new Error("Confirme seu e-mail antes de registrar partidas.");
    const clubeNome = String(estado.clube.nome || "").trim();
    if (!clubeNome) throw new Error("Salve primeiro o nome do seu clube na aba Geral.");
    const adversarioId = String(document.getElementById("stats-adversario-id")?.value || "");
    const adversarioCadastrado = estado.clubes.find((clube) => clube.id === adversarioId);
    const adversarioNome = String(adversarioCadastrado?.nome || document.getElementById("stats-adversario-nome")?.value || "").trim();
    if (adversarioId === estado.uid) throw new Error("Escolha outro clube como adversário.");
    if (adversarioNome.length < 2 || adversarioNome.length > 100) throw new Error("Informe o nome do clube adversário.");
    const placarClube = Number(document.getElementById("stats-placar-clube")?.value);
    const placarAdversario = Number(document.getElementById("stats-placar-adversario")?.value);
    if (![placarClube, placarAdversario].every((valor) => Number.isInteger(valor) && valor >= 0 && valor <= 99)) throw new Error("Informe um placar válido entre 0 e 99.");
    const dataTexto = document.getElementById("stats-data")?.value;
    const dataPartida = new Date(dataTexto);
    if (!dataTexto || Number.isNaN(dataPartida.getTime())) throw new Error("Informe a data da partida.");
    if (dataPartida.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new Error("A partida não pode estar mais de 24 horas no futuro.");
    const tipo = String(document.getElementById("stats-tipo")?.value || "amistoso");
    if (!TIPOS_VALIDOS.includes(tipo)) throw new Error("Escolha um tipo de partida válido.");
    const competicao = String(document.getElementById("stats-competicao")?.value || "").trim().slice(0, 100);
    const observacao = String(document.getElementById("stats-observacao")?.value || "").trim().slice(0, 300);
    const { estatisticas, camposEstatisticas } = coletarEstatisticasClube();
    const jogadores = coletarJogadores();

    if (feedback) feedback.textContent = "Salvando partida...";
    if (botao) botao.disabled = true;
    await addDoc(collection(db, "partidasClubes"), {
      clubeId: estado.uid,
      clubeNome: clubeNome.slice(0, 100),
      adversarioId,
      adversarioNome,
      competicao,
      tipo,
      dataPartida,
      placarClube,
      placarAdversario,
      estatisticas,
      camposEstatisticas,
      jogadores,
      provaImagem: estado.provaImagem,
      observacao,
      status: adversarioId ? "pendente" : "informada",
      criadoPor: estado.uid,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    fecharModal();
    mostrarToast(adversarioId ? "Partida salva. O adversário recebeu o pedido de confirmação." : "Partida registrada no Mercado Stats.");
    await carregarMercadoStats({ uid: estado.uid, clube: estado.clube, elenco: estado.elenco });
  } catch (erro) {
    console.error("Erro ao registrar partida:", erro);
    const mensagem = erro?.code === "permission-denied"
      ? "O Firebase recusou o registro. Publique as novas regras de segurança e tente de novo."
      : erro?.message || "Não foi possível salvar a partida.";
    if (feedback) feedback.textContent = mensagem;
    mostrarToast(mensagem, "erro");
  } finally {
    if (botao) botao.disabled = false;
  }
}

async function responderConfirmacao(partidaId, acao, botao) {
  const partida = estado.confirmacoes.find((item) => item.id === partidaId);
  if (!partida || !estado.uid) return;
  const confirmar = acao === "confirmar";
  const aceitou = await confirmModal({
    titulo: confirmar ? "Confirmar resultado" : "Contestar resultado",
    mensagem: confirmar
      ? `Confirma o placar informado por ${partida.clubeNome || "este clube"}: ${partida.placarClube} × ${partida.placarAdversario}?`
      : "Este resultado será marcado como contestado e não contará na campanha do clube que o informou.",
    textoConfirmar: confirmar ? "Confirmar" : "Contestar",
    destrutivo: !confirmar,
  });
  if (!aceitou) return;
  if (botao) botao.disabled = true;
  try {
    const dados = confirmar
      ? { status: "confirmada", confirmadoPor: estado.uid, confirmadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }
      : { status: "contestada", contestadoPor: estado.uid, contestadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() };
    await updateDoc(doc(db, "partidasClubes", partidaId), dados);
    mostrarToast(confirmar ? "Resultado confirmado." : "Resultado contestado.");
    await carregarMercadoStats({ uid: estado.uid, clube: estado.clube, elenco: estado.elenco });
  } catch (erro) {
    console.error("Erro ao responder confirmação:", erro);
    if (botao) botao.disabled = false;
    mostrarToast("Não foi possível responder. Verifique as regras do Firebase.", "erro");
  }
}

async function excluirPartida(partidaId, botao) {
  const partida = estado.partidas.find((item) => item.id === partidaId);
  if (!partida || statusPartida(partida) === "confirmada") return;
  const aceitou = await confirmModal({
    titulo: "Excluir partida",
    mensagem: "Excluir este registro do Mercado Stats? Esta ação não pode ser desfeita.",
    textoConfirmar: "Excluir",
    destrutivo: true,
  });
  if (!aceitou) return;
  if (botao) botao.disabled = true;
  try {
    await deleteDoc(doc(db, "partidasClubes", partidaId));
    mostrarToast("Registro da partida excluído.");
    await carregarMercadoStats({ uid: estado.uid, clube: estado.clube, elenco: estado.elenco });
  } catch (erro) {
    console.error("Erro ao excluir partida:", erro);
    if (botao) botao.disabled = false;
    mostrarToast("Não foi possível excluir este registro.", "erro");
  }
}

export function inicializarMercadoStats({ uid, getClube, getElenco } = {}) {
  if (uid) estado.uid = uid;
  if (typeof getClube === "function") estado.getClube = getClube;
  if (typeof getElenco === "function") estado.getElenco = getElenco;
  if (estado.eventosLigados) return;
  estado.eventosLigados = true;

  document.getElementById("btn-registrar-partida")?.addEventListener("click", abrirModal);
  document.getElementById("mercado-stats-fechar")?.addEventListener("click", fecharModal);
  document.getElementById("mercado-stats-cancelar")?.addEventListener("click", fecharModal);
  document.getElementById("mercado-stats-modal")?.addEventListener("click", (evento) => {
    if (evento.target.id === "mercado-stats-modal") fecharModal();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !document.getElementById("mercado-stats-modal")?.hidden) fecharModal();
  });
  document.getElementById("mercado-stats-form")?.addEventListener("submit", salvarPartida);
  document.getElementById("stats-remover-prova")?.addEventListener("click", limparProva);
  document.getElementById("stats-prova")?.addEventListener("change", async (evento) => {
    try {
      await prepararProva(evento.target.files?.[0]);
    } catch (erro) {
      limparProva();
      mostrarToast(erro.message, "erro");
    }
  });
  document.getElementById("stats-adversario-id")?.addEventListener("change", (evento) => {
    const clube = estado.clubes.find((item) => item.id === evento.target.value);
    const nome = document.getElementById("stats-adversario-nome");
    if (nome && clube) nome.value = clube.nome || "";
    if (nome && !clube) nome.value = "";
    if (nome) nome.readOnly = Boolean(clube);
    setTexto("stats-placar-adversario-nome", clube?.nome || nome?.value || "Adversário");
  });
  document.getElementById("stats-adversario-nome")?.addEventListener("input", (evento) => setTexto("stats-placar-adversario-nome", evento.target.value || "Adversário"));
  document.getElementById("mercado-stats-jogadores-form")?.addEventListener("change", (evento) => {
    if (evento.target.dataset.statsCampo !== "participou") return;
    const linha = evento.target.closest("[data-stats-jogador]");
    const ativo = evento.target.checked;
    linha?.classList.toggle("ativo", ativo);
    linha?.querySelectorAll("input:not([data-stats-campo='participou'])").forEach((input) => {
      input.disabled = !ativo;
      if (!ativo && input.type === "radio") input.checked = false;
    });
  });
  document.getElementById("mercado-stats-filtro-status")?.addEventListener("change", renderizarHistorico);
  document.getElementById("mercado-stats-historico")?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-stats-excluir]");
    if (botao) excluirPartida(botao.dataset.statsExcluir, botao);
  });
  document.getElementById("mercado-stats-confirmacoes")?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-stats-resposta]");
    if (botao) responderConfirmacao(botao.dataset.partidaId, botao.dataset.statsResposta, botao);
  });
}

export async function carregarMercadoStats({ uid, clube, elenco } = {}) {
  atualizarContexto({ uid, clube, elenco });
  const lista = document.getElementById("mercado-stats-historico");
  if (!estado.uid || !lista) return;
  lista.innerHTML = '<div class="clube-estado-vazio">Carregando partidas...</div>';
  try {
    const [propriasResultado, confirmacoesResultado, clubesResultado] = await Promise.allSettled([
      getDocs(query(collection(db, "partidasClubes"), where("clubeId", "==", estado.uid))),
      getDocs(query(collection(db, "partidasClubes"), where("adversarioId", "==", estado.uid))),
      getDocs(collection(db, "clubes")),
    ]);
    if (propriasResultado.status === "rejected") throw propriasResultado.reason;
    if (confirmacoesResultado.status === "rejected") throw confirmacoesResultado.reason;
    estado.partidas = propriasResultado.value.docs.map((item) => ({ id: item.id, ...item.data() }));
    estado.confirmacoes = confirmacoesResultado.value.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((partida) => partida.clubeId !== estado.uid);
    estado.clubes = clubesResultado.status === "fulfilled"
      ? clubesResultado.value.docs.map((item) => ({ id: item.id, ...item.data() }))
      : [];
    renderizarTudo();
  } catch (erro) {
    console.error("Erro ao carregar Mercado Stats:", erro);
    estado.partidas = [];
    estado.confirmacoes = [];
    if (lista) lista.innerHTML = '<div class="clube-estado-vazio erro">O Mercado Stats ainda não conseguiu acessar os dados. Publique as novas regras do Firebase.</div>';
    renderizarResumo();
    renderizarMedias();
    renderizarRankingJogadores();
    renderizarConfirmacoes();
  }
}

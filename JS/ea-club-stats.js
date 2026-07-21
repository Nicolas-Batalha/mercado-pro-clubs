import { db } from "./firebase-config.js";
import {
  doc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const ROTULOS_PLATAFORMA = {
  "common-gen5": "PS5, Xbox Series e PC",
  "common-gen4": "PS4 e Xbox One",
  nx: "Nintendo Switch",
};

const PLATAFORMA_DO_PERFIL = {
  "new-gen": "common-gen5",
  "nova-geracao": "common-gen5",
  "nova geração": "common-gen5",
  pc: "common-gen5",
  ps5: "common-gen5",
  "xbox-series": "common-gen5",
  "ven-gen": "common-gen4",
  "old-gen": "common-gen4",
  "velha-geracao": "common-gen4",
  "velha geração": "common-gen4",
  ps4: "common-gen4",
  "xbox-one": "common-gen4",
  switch: "nx",
  nx: "nx",
};

const estado = {
  uid: "",
  somenteLeitura: false,
  getClube: () => ({}),
  onVinculado: null,
  resultados: [],
  eventosLigados: false,
  buscaAtual: 0,
};

function elemento(id) {
  return document.getElementById(id);
}

function escHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inteiro(valor) {
  const numero = Number.parseInt(String(valor ?? "0"), 10);
  return Number.isFinite(numero) && numero >= 0 ? numero : 0;
}

function plataformaValida(valor) {
  return Object.hasOwn(ROTULOS_PLATAFORMA, valor) ? valor : "common-gen5";
}

function plataformaDoClube(clube) {
  const ea = String(clube?.eaPlatform || "").trim();
  if (Object.hasOwn(ROTULOS_PLATAFORMA, ea)) return ea;
  return PLATAFORMA_DO_PERFIL[String(clube?.plataforma || "").trim().toLowerCase()] || "common-gen5";
}

function definirFeedback(mensagem = "", tipo = "") {
  const feedback = elemento("ea-clube-feedback");
  if (!feedback) return;
  feedback.textContent = mensagem;
  feedback.className = `ea-clube-feedback${tipo ? ` ${tipo}` : ""}`;
}

function definirCarregando(carregando) {
  const buscar = elemento("ea-clube-buscar");
  const atualizar = elemento("ea-clube-atualizar");
  if (buscar) {
    buscar.disabled = carregando;
    buscar.textContent = carregando ? "Buscando..." : "Buscar na EA";
  }
  if (atualizar) {
    atualizar.disabled = carregando;
    atualizar.textContent = carregando ? "Atualizando..." : "Atualizar da EA";
  }
}

function preencherNumero(id, valor, sufixo = "") {
  const campo = elemento(id);
  if (campo) campo.textContent = `${inteiro(valor)}${sufixo}`;
}

function exibirEstatisticas(clube) {
  if (!clube) return;
  const conectado = elemento("ea-clube-conectado");
  if (conectado) conectado.hidden = false;
  const status = elemento("ea-clube-status");
  if (status) {
    status.textContent = "Conectado";
    status.classList.add("conectado");
  }
  const nome = elemento("ea-clube-conectado-nome");
  if (nome) nome.textContent = clube.clubName || "Clube conectado";
  const plataforma = elemento("ea-clube-conectado-plataforma");
  if (plataforma) plataforma.textContent = ROTULOS_PLATAFORMA[clube.platform] || "Plataforma não informada";

  preencherNumero("ea-stat-jogos", clube.gamesPlayed);
  preencherNumero("ea-stat-vitorias", clube.wins);
  preencherNumero("ea-stat-empates", clube.ties);
  preencherNumero("ea-stat-derrotas", clube.losses);
  preencherNumero("ea-stat-gols", clube.goals);
  preencherNumero("ea-stat-gols-contra", clube.goalsAgainst);
  preencherNumero("ea-stat-aproveitamento", clube.aproveitamento, "%");
  const divisao = elemento("ea-stat-divisao");
  if (divisao) divisao.textContent = inteiro(clube.currentDivision) > 0 ? String(inteiro(clube.currentDivision)) : "—";
}

function resultadoHtml(clube, indice) {
  const jogos = inteiro(clube.gamesPlayed);
  const plataforma = ROTULOS_PLATAFORMA[clube.platform] || "Plataforma não informada";
  const botao = estado.somenteLeitura
    ? ""
    : `<button type="button" data-ea-conectar="${indice}">Conectar este clube</button>`;
  return `<article class="ea-clube-resultado">
    <div class="ea-clube-resultado-principal">
      <span>CLUBE ENCONTRADO</span>
      <h4>${escHtml(clube.clubName)}</h4>
      <p>${escHtml(plataforma)} · ID ${escHtml(clube.clubId)}</p>
    </div>
    <div class="ea-clube-resultado-campanha" aria-label="Resumo da campanha">
      <strong>${jogos}</strong><span>jogos</span>
      <strong>${inteiro(clube.wins)}V</strong><span>${inteiro(clube.ties)}E · ${inteiro(clube.losses)}D</span>
      <strong>${inteiro(clube.goals)}:${inteiro(clube.goalsAgainst)}</strong><span>gols</span>
    </div>
    ${botao}
  </article>`;
}

function renderizarResultados(resultados) {
  const lista = elemento("ea-clube-resultados");
  if (!lista) return;
  estado.resultados = Array.isArray(resultados) ? resultados : [];
  lista.innerHTML = estado.resultados.map(resultadoHtml).join("");
  lista.querySelectorAll("[data-ea-conectar]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const indice = Number.parseInt(botao.dataset.eaConectar || "-1", 10);
      const clube = estado.resultados[indice];
      if (clube) conectarClube(clube, botao);
    });
  });
}

async function consultarClubes(nome, plataforma, { silencioso = false } = {}) {
  const numeroBusca = ++estado.buscaAtual;
  definirCarregando(true);
  if (!silencioso) {
    definirFeedback("Procurando o clube nos dados públicos da EA...");
    renderizarResultados([]);
  }
  try {
    const parametros = new URLSearchParams({ name: nome.trim(), platform: plataformaValida(plataforma) });
    const resposta = await fetch(`/api/ea-clubs?${parametros.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    let dados = null;
    try {
      dados = await resposta.json();
    } catch {
      dados = null;
    }
    if (!resposta.ok) {
      if (resposta.status === 404 && location.hostname === "127.0.0.1") {
        throw new Error("A busca automática funciona no site publicado. No Live Server, a rota /api não é executada.");
      }
      throw new Error(dados?.erro || "Não foi possível consultar a EA agora.");
    }
    if (numeroBusca !== estado.buscaAtual) return [];
    return Array.isArray(dados?.resultados) ? dados.resultados : [];
  } finally {
    if (numeroBusca === estado.buscaAtual) definirCarregando(false);
  }
}

async function executarBusca(nome, plataforma) {
  try {
    const resultados = await consultarClubes(nome, plataforma);
    renderizarResultados(resultados);
    definirFeedback(
      resultados.length
        ? `${resultados.length} clube${resultados.length === 1 ? " encontrado" : "s encontrados"}. Confira o nome e a campanha antes de conectar.`
        : "Nenhum clube foi encontrado. Confira a grafia e a plataforma.",
      resultados.length ? "sucesso" : "aviso",
    );
  } catch (erro) {
    renderizarResultados([]);
    definirFeedback(erro?.message || "A busca está indisponível no momento.", "erro");
  }
}

async function conectarClube(clube, botao) {
  if (estado.somenteLeitura || !estado.uid || !clube?.clubId) return;
  const textoOriginal = botao?.textContent || "Conectar este clube";
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Conectando...";
  }
  try {
    const vinculacao = {
      eaClubId: String(clube.clubId),
      eaClubName: String(clube.clubName || "").slice(0, 64),
      eaPlatform: plataformaValida(clube.platform),
      eaSincronizadoEm: serverTimestamp(),
    };
    await updateDoc(doc(db, "clubes", estado.uid), vinculacao);
    estado.onVinculado?.(vinculacao);
    renderizarResultados([]);
    exibirEstatisticas({ ...clube, platform: vinculacao.eaPlatform });
    definirFeedback("Clube conectado. As estatísticas agora aparecem para todo o elenco.", "sucesso");
  } catch (erro) {
    const mensagem = erro?.code === "permission-denied"
      ? "Somente o capitão pode conectar o clube à EA. Publique também as regras atualizadas do Firestore."
      : "Não foi possível salvar a conexão com este clube.";
    definirFeedback(mensagem, "erro");
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }
}

async function atualizarClubeConectado() {
  const clubeSalvo = estado.getClube?.() || {};
  const id = String(clubeSalvo.eaClubId || "");
  const nome = String(clubeSalvo.eaClubName || clubeSalvo.nome || "").trim();
  const plataforma = plataformaDoClube(clubeSalvo);
  if (!id || nome.length < 2) {
    if (estado.somenteLeitura) {
      definirFeedback("O capitão ainda não conectou este clube aos dados da EA.", "aviso");
    }
    return;
  }

  const nomeConectado = elemento("ea-clube-conectado-nome");
  if (nomeConectado) nomeConectado.textContent = nome;
  const plataformaConectada = elemento("ea-clube-conectado-plataforma");
  if (plataformaConectada) plataformaConectada.textContent = ROTULOS_PLATAFORMA[plataforma];
  const conectado = elemento("ea-clube-conectado");
  if (conectado) conectado.hidden = false;
  const status = elemento("ea-clube-status");
  if (status) {
    status.textContent = "Conectado";
    status.classList.add("conectado");
  }

  definirFeedback("Atualizando as estatísticas do clube...");
  try {
    const resultados = await consultarClubes(nome, plataforma, { silencioso: true });
    const encontrado = resultados.find((item) => String(item.clubId) === id)
      || resultados.find((item) => String(item.clubName || "").localeCompare(nome, "pt-BR", { sensitivity: "base" }) === 0);
    if (!encontrado) {
      definirFeedback("O clube está conectado, mas a EA não devolveu as estatísticas agora. Tente atualizar mais tarde.", "aviso");
      return;
    }
    exibirEstatisticas({ ...encontrado, platform: plataforma });
    definirFeedback("Estatísticas atualizadas com os dados públicos da EA.", "sucesso");
  } catch (erro) {
    definirFeedback(erro?.message || "A EA está temporariamente indisponível.", "erro");
  }
}

function ligarEventos() {
  if (estado.eventosLigados) return;
  estado.eventosLigados = true;
  elemento("ea-clube-form")?.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const nome = String(elemento("ea-clube-nome")?.value || "").trim();
    const plataforma = plataformaValida(elemento("ea-clube-plataforma")?.value);
    if (nome.length < 2) {
      definirFeedback("Digite pelo menos 2 caracteres do nome do clube.", "erro");
      return;
    }
    executarBusca(nome, plataforma);
  });
  elemento("ea-clube-atualizar")?.addEventListener("click", atualizarClubeConectado);
}

export function inicializarEAClubStats({ uid, somenteLeitura = false, getClube, onVinculado } = {}) {
  if (!elemento("ea-clube-stats") || !uid) return;
  estado.uid = uid;
  estado.somenteLeitura = Boolean(somenteLeitura);
  estado.getClube = typeof getClube === "function" ? getClube : () => ({});
  estado.onVinculado = typeof onVinculado === "function" ? onVinculado : null;

  const clube = estado.getClube() || {};
  const formulario = elemento("ea-clube-form");
  if (formulario) formulario.hidden = estado.somenteLeitura;
  const atualizar = elemento("ea-clube-atualizar");
  if (atualizar) atualizar.hidden = estado.somenteLeitura;
  const inputNome = elemento("ea-clube-nome");
  if (inputNome && !inputNome.value) inputNome.value = clube.eaClubName || clube.nome || "";
  const inputPlataforma = elemento("ea-clube-plataforma");
  if (inputPlataforma) inputPlataforma.value = plataformaDoClube(clube);

  ligarEventos();
  atualizarClubeConectado();
}

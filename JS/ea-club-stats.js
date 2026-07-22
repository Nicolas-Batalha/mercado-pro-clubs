import { db } from "./firebase-config.js";
import {
  doc,
  serverTimestamp,
  writeBatch,
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

const PERFIL_DA_PLATAFORMA = {
  "common-gen5": "new-gen",
  "common-gen4": "ven-gen",
  nx: "switch",
};

const ROTULOS_POSICAO = {
  goalkeeper: "Goleiro",
  defender: "Defensor",
  midfielder: "Meio-campista",
  forward: "Atacante",
};

const estado = {
  uid: "",
  somenteLeitura: false,
  modoCriacao: false,
  getClube: () => ({}),
  onVinculado: null,
  onCriado: null,
  resultados: [],
  eventosLigados: false,
  requisicaoAtual: 0,
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

function decimal(valor) {
  const numero = Number.parseFloat(String(valor ?? "0").replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : 0;
}

function normalizarNome(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

function definirCarregando(carregando, texto = "Buscando...") {
  const buscar = elemento("ea-clube-buscar");
  const atualizar = elemento("ea-clube-atualizar");
  if (buscar) {
    buscar.disabled = carregando;
    buscar.textContent = carregando ? texto : "Buscar clube";
  }
  if (atualizar) {
    atualizar.disabled = carregando;
    atualizar.textContent = carregando ? "Atualizando..." : "Atualizar dados";
  }
}

function preencherNumero(id, valor, sufixo = "") {
  const campo = elemento(id);
  if (campo) campo.textContent = `${inteiro(valor)}${sufixo}`;
}

function mensagemErroLocal(resposta, dados) {
  if (resposta.status === 404 && ["127.0.0.1", "localhost"].includes(location.hostname)) {
    return "A busca automática funciona no site publicado. O Live Server não executa a rota /api.";
  }
  return dados?.erro || "Não foi possível consultar a EA agora.";
}

async function consultarApi(parametros) {
  const numeroRequisicao = ++estado.requisicaoAtual;
  const resposta = await fetch(`/api/ea-clubs?${new URLSearchParams(parametros).toString()}`, {
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
    const erro = new Error(mensagemErroLocal(resposta, dados));
    erro.status = resposta.status;
    throw erro;
  }
  if (numeroRequisicao !== estado.requisicaoAtual) return null;
  return dados;
}

function exibirIdentidade(clube) {
  elemento("painel-estatisticas")?.classList.add("ea-clube-automatico");
  const conectado = elemento("ea-clube-conectado");
  if (conectado) conectado.hidden = false;
  const status = elemento("ea-clube-status");
  if (status) {
    status.textContent = "Dados automáticos";
    status.classList.add("conectado");
  }
  const nome = elemento("ea-clube-conectado-nome");
  if (nome) nome.textContent = clube.clubName || "Clube conectado";
  const plataforma = elemento("ea-clube-conectado-plataforma");
  if (plataforma) {
    const partes = [ROTULOS_PLATAFORMA[clube.platform] || "Plataforma não informada"];
    if (clube.stadiumName) partes.push(clube.stadiumName);
    plataforma.textContent = partes.join(" · ");
  }
}

function aplicarIdentidadeAutomatica(clube) {
  const campoNome = elemento("clube");
  if (campoNome) {
    if (clube.eaClubName || clube.clubName) campoNome.value = clube.eaClubName || clube.clubName;
    campoNome.readOnly = true;
    campoNome.title = "Nome sincronizado com o clube selecionado na EA";
  }
  const campoPlataforma = elemento("plataforma");
  if (campoPlataforma) {
    const plataformaEA = plataformaValida(clube.eaPlatform || clube.platform);
    campoPlataforma.value = PERFIL_DA_PLATAFORMA[plataformaEA];
    campoPlataforma.disabled = true;
    campoPlataforma.title = "Plataforma sincronizada com a EA";
  }
  const campoDivisao = elemento("divisao");
  if (campoDivisao) {
    if (inteiro(clube.currentDivision) > 0) campoDivisao.value = String(inteiro(clube.currentDivision));
    campoDivisao.readOnly = true;
    campoDivisao.title = "A divisão é informada pelos dados do jogo";
  }
}

function renderizarForma(resultados) {
  const forma = elemento("ea-clube-forma");
  if (!forma) return;
  forma.innerHTML = Array.isArray(resultados) && resultados.length
    ? resultados.map((resultado) => {
        const valor = ["V", "E", "D"].includes(resultado) ? resultado : "—";
        const classe = valor === "V" ? "vitoria" : valor === "D" ? "derrota" : "empate";
        return `<b class="${classe}" title="${valor === "V" ? "Vitória" : valor === "D" ? "Derrota" : "Empate"}">${valor}</b>`;
      }).join("")
    : "<small>Sem partidas recentes</small>";
}

function jogadorHtml(jogador) {
  const posicao = ROTULOS_POSICAO[jogador.favoritePosition]
    || (jogador.proPos ? `Posição ${jogador.proPos}` : "Não informada");
  const nota = decimal(jogador.ratingAverage);
  return `<tr>
    <td data-label="Jogador"><strong>${escHtml(jogador.name || "Jogador")}</strong></td>
    <td data-label="Posição"><span>${escHtml(posicao)}</span></td>
    <td data-label="Jogos">${inteiro(jogador.gamesPlayed)}</td>
    <td data-label="Gols">${inteiro(jogador.goals)}</td>
    <td data-label="Assistências">${inteiro(jogador.assists)}</td>
    <td data-label="Nota"><b class="ea-nota-jogador">${nota ? nota.toFixed(1).replace(".", ",") : "—"}</b></td>
    <td data-label="MVP">${inteiro(jogador.manOfTheMatch)}</td>
  </tr>`;
}

function renderizarElenco(jogadores) {
  const lista = elemento("ea-clube-elenco");
  const total = elemento("ea-clube-elenco-total");
  const elenco = Array.isArray(jogadores) ? jogadores : [];
  if (total) total.textContent = `${elenco.length} jogador${elenco.length === 1 ? "" : "es"}`;
  if (!lista) return;
  lista.innerHTML = elenco.length
    ? elenco.map(jogadorHtml).join("")
    : '<tr><td colspan="7">A EA não retornou jogadores para este clube.</td></tr>';
}

function exibirEstatisticas({ club = {}, stats = {}, players = [], updatedAt = "", partial = false } = {}) {
  exibirIdentidade(club);
  aplicarIdentidadeAutomatica({ ...club, currentDivision: stats.currentDivision });
  preencherNumero("ea-stat-jogos", stats.gamesPlayed);
  preencherNumero("ea-stat-vitorias", stats.wins);
  preencherNumero("ea-stat-empates", stats.ties);
  preencherNumero("ea-stat-derrotas", stats.losses);
  preencherNumero("ea-stat-gols", stats.goals);
  preencherNumero("ea-stat-gols-contra", stats.goalsAgainst);
  preencherNumero("ea-stat-aproveitamento", stats.aproveitamento, "%");
  preencherNumero("ea-stat-skill", stats.skillRating);
  preencherNumero("ea-stat-promocoes", stats.promotions);
  preencherNumero("ea-stat-elenco", players.length);
  renderizarForma(stats.recentForm);
  renderizarElenco(players);

  const horario = updatedAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(updatedAt))
    : "agora";
  definirFeedback(
    partial
      ? `Dados atualizados parcialmente em ${horario}. Uma parte do serviço da EA não respondeu.`
      : `Campanha e elenco atualizados automaticamente em ${horario}.`,
    partial ? "aviso" : "sucesso",
  );
}

function resultadoHtml(clube, indice) {
  const plataforma = ROTULOS_PLATAFORMA[clube.platform] || "Plataforma não informada";
  const botao = estado.somenteLeitura
    ? ""
    : `<button type="button" data-ea-conectar="${indice}">Usar este clube</button>`;
  return `<article class="ea-clube-resultado">
    <div class="ea-clube-resultado-principal">
      <span>CLUBE ENCONTRADO</span>
      <h4>${escHtml(clube.clubName)}</h4>
      <p>${escHtml(plataforma)} · ID ${escHtml(clube.clubId)}</p>
    </div>
    <div class="ea-clube-resultado-campanha" aria-label="Resumo da campanha">
      <strong>${inteiro(clube.gamesPlayed)}</strong><span>jogos</span>
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

async function consultarClubes(nome, plataforma) {
  const dados = await consultarApi({ name: nome.trim(), platform: plataformaValida(plataforma) });
  return Array.isArray(dados?.resultados) ? dados.resultados : [];
}

async function carregarDetalhes(clubeVinculado, fallback = null) {
  const clubId = String(clubeVinculado?.eaClubId || clubeVinculado?.clubId || "");
  const plataforma = plataformaValida(clubeVinculado?.eaPlatform || clubeVinculado?.platform);
  if (!clubId) return;
  definirCarregando(true, "Atualizando...");
  definirFeedback("Carregando campanha e jogadores pela fonte de dados conectada...");
  try {
    const nome = String(clubeVinculado?.eaClubName || clubeVinculado?.clubName || "").trim();
    const parametros = { clubId, platform: plataforma };
    if (nome.length >= 2) parametros.name = nome;
    const dados = await consultarApi(parametros);
    if (!dados) return;
    exibirEstatisticas({
      club: {
        ...dados.club,
        clubName: dados.club?.clubName || clubeVinculado?.eaClubName || clubeVinculado?.clubName,
        platform: plataforma,
      },
      stats: dados.stats || fallback || {},
      players: dados.players || [],
      updatedAt: dados.updatedAt,
      partial: Boolean(dados.partial),
    });
  } catch (erro) {
    if (fallback) {
      exibirEstatisticas({
        club: {
          clubId,
          clubName: clubeVinculado?.eaClubName || clubeVinculado?.clubName,
          platform: plataforma,
        },
        stats: fallback,
        players: [],
        partial: true,
      });
    }
    definirFeedback(erro?.message || "A EA está temporariamente indisponível.", "erro");
  } finally {
    definirCarregando(false);
  }
}

async function executarBusca(nome, plataforma, { conectarExato = false } = {}) {
  definirCarregando(true);
  definirFeedback("Procurando o clube na fonte de dados conectada...");
  const continuarManual = elemento("ea-clube-continuar-manual");
  if (continuarManual) continuarManual.hidden = !estado.modoCriacao;
  renderizarResultados([]);
  try {
    const resultados = await consultarClubes(nome, plataforma);
    const exatos = resultados.filter((clube) => normalizarNome(clube.clubName) === normalizarNome(nome));
    if (conectarExato && exatos.length === 1 && !estado.somenteLeitura) {
      definirFeedback(`Clube ${exatos[0].clubName} encontrado. Conectando campanha e elenco...`, "sucesso");
      await conectarClube(exatos[0]);
      return;
    }
    renderizarResultados(resultados);
    definirFeedback(
      resultados.length
        ? `${resultados.length} clube${resultados.length === 1 ? " encontrado" : "s encontrados"}. Escolha o clube correto.`
        : "Nenhum clube foi encontrado. Confira a grafia e a plataforma.",
      resultados.length ? "sucesso" : "aviso",
    );
  } catch (erro) {
    renderizarResultados([]);
    const permiteContinuar = estado.modoCriacao && [502, 503, 504].includes(erro?.status);
    if (continuarManual) continuarManual.hidden = !estado.modoCriacao && !permiteContinuar;
    definirFeedback(
      permiteContinuar
        ? "A consulta autom\u00e1tica est\u00e1 indispon\u00edvel agora. Voc\u00ea pode continuar e conectar os dados depois."
        : (erro?.message || "A busca está indisponível no momento."),
      permiteContinuar ? "aviso" : "erro",
    );
  } finally {
    definirCarregando(false);
  }
}

async function criarClubeManual() {
  if (!estado.modoCriacao || !estado.uid) return;
  const nome = String(elemento("ea-clube-nome")?.value || "").trim().replace(/\s+/g, " ").slice(0, 64);
  const plataformaEA = plataformaValida(elemento("ea-clube-plataforma")?.value);
  if (nome.length < 2) {
    definirFeedback("Digite pelo menos 2 caracteres do nome do clube.", "erro");
    return;
  }
  const botao = elemento("ea-clube-criar-manual");
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Criando clube...";
  }
  try {
    const vinculacao = {
      nome,
      plataforma: PERFIL_DA_PLATAFORMA[plataformaEA],
    };
    const lote = writeBatch(db);
    lote.set(doc(db, "clubes", estado.uid), {
      ...vinculacao,
      capitaoUid: estado.uid,
    });
    lote.set(doc(db, "jogadores", estado.uid), {
      ehCapitao: true,
      clube: nome,
      clubeAtualId: estado.uid,
      clubeAtualNome: nome,
    }, { merge: true });
    await lote.commit();
    estado.onVinculado?.(vinculacao);
    estado.modoCriacao = false;
    definirFeedback("Clube criado! Agora complete o perfil e convide seus jogadores.", "sucesso");
    estado.onCriado?.(vinculacao);
  } catch (erro) {
    definirFeedback(
      erro?.code === "permission-denied"
        ? "Não foi possível criar o clube. Confirme seu e-mail e publique as regras atualizadas do Firestore."
        : "Não foi possível criar o clube agora.",
      "erro",
    );
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = "Criar meu clube";
    }
  }
}

async function conectarClube(clube, botao) {
  if (estado.somenteLeitura || !estado.uid || !clube?.clubId) return;
  const textoOriginal = botao?.textContent || "Usar este clube";
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
      nome: String(clube.clubName || "").slice(0, 64),
      plataforma: PERFIL_DA_PLATAFORMA[plataformaValida(clube.platform)],
    };
    if (inteiro(clube.currentDivision) > 0) vinculacao.divisao = String(inteiro(clube.currentDivision));
    const lote = writeBatch(db);
    const clubeRef = doc(db, "clubes", estado.uid);
    if (estado.modoCriacao) {
      lote.set(clubeRef, {
        ...vinculacao,
        capitaoUid: estado.uid,
      });
      lote.set(doc(db, "jogadores", estado.uid), {
        ehCapitao: true,
        clube: vinculacao.nome,
        clubeAtualId: estado.uid,
        clubeAtualNome: vinculacao.nome,
      }, { merge: true });
    } else {
      lote.update(clubeRef, vinculacao);
    }
    await lote.commit();
    estado.onVinculado?.(vinculacao);
    aplicarIdentidadeAutomatica({ ...clube, ...vinculacao });
    renderizarResultados([]);
    const formulario = elemento("ea-clube-form");
    if (formulario) formulario.hidden = true;
    exibirIdentidade({
      clubId: vinculacao.eaClubId,
      clubName: vinculacao.eaClubName,
      platform: vinculacao.eaPlatform,
    });
    await carregarDetalhes(vinculacao, clube);
    if (estado.modoCriacao) {
      estado.modoCriacao = false;
      estado.onCriado?.(vinculacao);
    }
  } catch (erro) {
    const mensagem = erro?.code === "permission-denied" && estado.modoCriacao
      ? "Não foi possível criar o clube. Confirme seu e-mail e publique as regras atualizadas do Firestore."
      : erro?.code === "permission-denied"
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
  if (!id) {
    definirFeedback("Conecte o clube primeiro para carregar os dados automáticos.", "aviso");
    return;
  }
  await carregarDetalhes(clubeSalvo);
}

function mostrarTrocaDeClube() {
  if (estado.somenteLeitura) return;
  const clube = estado.getClube?.() || {};
  const formulario = elemento("ea-clube-form");
  if (formulario) formulario.hidden = false;
  const nome = elemento("ea-clube-nome");
  if (nome) {
    nome.value = clube.eaClubName || clube.nome || "";
    nome.focus();
  }
  const plataforma = elemento("ea-clube-plataforma");
  if (plataforma) plataforma.value = plataformaDoClube(clube);
  renderizarResultados([]);
  definirFeedback("Busque e selecione outro clube. A conexão atual só será trocada depois da confirmação.", "aviso");
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
  elemento("ea-clube-trocar")?.addEventListener("click", mostrarTrocaDeClube);
  elemento("ea-clube-criar-manual")?.addEventListener("click", criarClubeManual);
}

export function inicializarEAClubStats({
  uid,
  somenteLeitura = false,
  modoCriacao = false,
  getClube,
  onVinculado,
  onCriado,
} = {}) {
  if (!elemento("ea-clube-stats") || !uid) return;
  estado.uid = uid;
  estado.somenteLeitura = Boolean(somenteLeitura);
  estado.modoCriacao = Boolean(modoCriacao);
  estado.getClube = typeof getClube === "function" ? getClube : () => ({});
  estado.onVinculado = typeof onVinculado === "function" ? onVinculado : null;
  estado.onCriado = typeof onCriado === "function" ? onCriado : null;

  const clube = estado.getClube() || {};
  const conectado = Boolean(clube.eaClubId);
  const primeiroAcesso = elemento("ea-clube-primeiro-acesso");
  if (primeiroAcesso) primeiroAcesso.hidden = !estado.modoCriacao;
  const formulario = elemento("ea-clube-form");
  if (formulario) formulario.hidden = estado.somenteLeitura || conectado;
  const continuarManual = elemento("ea-clube-continuar-manual");
  if (continuarManual) continuarManual.hidden = !estado.modoCriacao;
  const atualizar = elemento("ea-clube-atualizar");
  if (atualizar) atualizar.hidden = estado.somenteLeitura;
  const trocar = elemento("ea-clube-trocar");
  if (trocar) trocar.hidden = estado.somenteLeitura;
  const inputNome = elemento("ea-clube-nome");
  if (inputNome) inputNome.value = clube.eaClubName || clube.nome || "";
  const inputPlataforma = elemento("ea-clube-plataforma");
  if (inputPlataforma) inputPlataforma.value = plataformaDoClube(clube);

  ligarEventos();
  if (conectado) {
    aplicarIdentidadeAutomatica(clube);
    exibirIdentidade({
      clubId: clube.eaClubId,
      clubName: clube.eaClubName || clube.nome,
      platform: plataformaDoClube(clube),
    });
    carregarDetalhes(clube);
  } else if (estado.somenteLeitura) {
    definirFeedback("O capitão ainda não conectou este clube aos dados da EA.", "aviso");
  } else if (String(clube.nome || "").trim().length >= 2) {
    definirFeedback("Clube criado. A conexão com dados automáticos é opcional.", "sucesso");
  }
}

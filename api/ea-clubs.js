const EA_BASE_URL = "https://proclubs.ea.com/api/fc/";
const PROVIDER_URL = String(process.env.CLUBS_DATA_PROVIDER_URL || "").trim();
const PROVIDER_API_KEY = String(process.env.CLUBS_DATA_PROVIDER_API_KEY || "").trim();
const PROVIDER_AUTH_HEADER = String(process.env.CLUBS_DATA_PROVIDER_AUTH_HEADER || "Authorization").trim();
const PROVIDER_NAME = String(process.env.CLUBS_DATA_PROVIDER_NAME || "Fonte autorizada de dados").trim();
const EA_DATA_ACCESS_AUTHORIZED = String(process.env.EA_DATA_ACCESS_AUTHORIZED || "").toLowerCase() === "true";
const ROTAS = {
  busca: "allTimeLeaderboard/search",
  estatisticas: "clubs/overallStats",
  jogadores: "members/career/stats",
  informacoes: "clubs/info",
};
const PLATAFORMAS = new Set(["common-gen5", "common-gen4", "nx"]);
const JANELA_LIMITE_MS = 60_000;
const MAXIMO_POR_JANELA = 20;
const acessos = new Map();

function erroDaFonte(mensagem, codigo = "FONTE_INDISPONIVEL", status = 503) {
  const erro = new Error(mensagem);
  erro.codigoFonte = codigo;
  erro.statusFonte = status;
  return erro;
}

function configuracaoDoProvedor() {
  if (!PROVIDER_URL) return null;
  let url;
  try {
    url = new URL(PROVIDER_URL);
  } catch {
    throw erroDaFonte("A URL da fonte de dados e invalida.", "FONTE_MAL_CONFIGURADA", 500);
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw erroDaFonte("A fonte de dados precisa usar HTTPS.", "FONTE_MAL_CONFIGURADA", 500);
  }
  if (url.username || url.password || url.hash) {
    throw erroDaFonte("A URL da fonte de dados contem informacoes nao permitidas.", "FONTE_MAL_CONFIGURADA", 500);
  }
  if (!/^[A-Za-z0-9-]{1,64}$/.test(PROVIDER_AUTH_HEADER)) {
    throw erroDaFonte("O cabecalho de autenticacao da fonte e invalido.", "FONTE_MAL_CONFIGURADA", 500);
  }
  return { url, nome: textoSeguro(PROVIDER_NAME, 80) || "Fonte autorizada de dados" };
}

function fonteAtual() {
  const provedor = configuracaoDoProvedor();
  if (provedor) return provedor.nome;
  return EA_DATA_ACCESS_AUTHORIZED ? "EA SPORTS FC Clubs" : "Nao configurada";
}

function enviar(res, status, dados) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(dados));
}

function corrigirCodificacao(valor) {
  const texto = String(valor ?? "");
  if (!/[ÃÂ]/.test(texto)) return texto;
  try {
    const corrigido = Buffer.from(texto, "latin1").toString("utf8");
    return corrigido.includes("�") ? texto : corrigido;
  } catch {
    return texto;
  }
}

function textoSeguro(valor, maximo = 100) {
  return corrigirCodificacao(valor)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maximo);
}

function numeroSeguro(valor, maximo = 9_999_999) {
  const numero = Number.parseInt(String(valor ?? "0"), 10);
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Math.min(numero, maximo);
}

function decimalSeguro(valor, maximo = 10) {
  const numero = Number.parseFloat(String(valor ?? "0").replace(",", "."));
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Math.min(numero, maximo);
}

function ipDaRequisicao(req) {
  const encaminhado = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return encaminhado || req.socket?.remoteAddress || "desconhecido";
}

function excedeuLimite(req) {
  const agora = Date.now();
  const ip = ipDaRequisicao(req);
  const atual = acessos.get(ip);
  if (!atual || agora - atual.inicio >= JANELA_LIMITE_MS) {
    acessos.set(ip, { inicio: agora, total: 1 });
    return false;
  }
  atual.total += 1;
  if (acessos.size > 2_000) {
    for (const [chave, registro] of acessos) {
      if (agora - registro.inicio >= JANELA_LIMITE_MS) acessos.delete(chave);
    }
  }
  return atual.total > MAXIMO_POR_JANELA;
}

async function consultarRota(rota, parametros) {
  const url = new URL(ROTAS[rota], EA_BASE_URL);
  Object.entries(parametros).forEach(([chave, valor]) => url.searchParams.set(chave, valor));
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 10_000);
  try {
    const resposta = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/112.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
      },
      signal: controlador.signal,
    });
    if (!resposta.ok) {
      const erro = new Error(`EA respondeu com ${resposta.status}`);
      erro.statusEA = resposta.status;
      throw erro;
    }
    return resposta.json();
  } finally {
    clearTimeout(limite);
  }
}

async function consultarProvedor(acao, parametros) {
  const provedor = configuracaoDoProvedor();
  if (!provedor) {
    throw erroDaFonte(
      "A busca automatica ainda nao possui uma fonte de dados autorizada.",
      "FONTE_NAO_CONFIGURADA",
      503,
    );
  }
  const url = new URL(provedor.url);
  url.searchParams.set("action", acao);
  Object.entries(parametros).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== null && String(valor).length) {
      url.searchParams.set(chave, String(valor));
    }
  });

  const headers = { Accept: "application/json" };
  if (PROVIDER_API_KEY) {
    headers[PROVIDER_AUTH_HEADER] = PROVIDER_AUTH_HEADER.toLowerCase() === "authorization"
      ? `Bearer ${PROVIDER_API_KEY}`
      : PROVIDER_API_KEY;
  }

  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 10_000);
  try {
    const resposta = await fetch(url, { method: "GET", headers, signal: controlador.signal });
    if (!resposta.ok) {
      throw erroDaFonte(
        `A fonte de dados respondeu com ${resposta.status}.`,
        "FONTE_INDISPONIVEL",
        resposta.status >= 500 || resposta.status === 429 ? 503 : 502,
      );
    }
    const corpo = await resposta.text();
    if (corpo.length > 2_000_000) {
      throw erroDaFonte("A resposta da fonte de dados excedeu o limite permitido.", "RESPOSTA_INVALIDA", 502);
    }
    try {
      return JSON.parse(corpo);
    } catch {
      throw erroDaFonte("A fonte de dados retornou uma resposta invalida.", "RESPOSTA_INVALIDA", 502);
    }
  } finally {
    clearTimeout(limite);
  }
}

function campanhaBase(item, plataformaConsultada) {
  const jogos = numeroSeguro(item?.gamesPlayed);
  const vitorias = numeroSeguro(item?.wins);
  const empates = numeroSeguro(item?.ties);
  const derrotas = numeroSeguro(item?.losses);
  const gols = numeroSeguro(item?.goals);
  const golsContra = numeroSeguro(item?.goalsAgainst);
  const pontos = numeroSeguro(item?.points, jogos * 3) || (vitorias * 3 + empates);
  const aproveitamento = jogos > 0 ? Math.round((pontos / (jogos * 3)) * 100) : 0;
  return {
    platform: PLATAFORMAS.has(item?.platform) ? item.platform : plataformaConsultada,
    gamesPlayed: jogos,
    wins: vitorias,
    ties: empates,
    losses: derrotas,
    goals: gols,
    goalsAgainst: golsContra,
    goalDifference: gols - golsContra,
    points: pontos,
    winRate: jogos > 0 ? Math.round((vitorias / jogos) * 100) : 0,
    aproveitamento,
  };
}

function normalizarClubeBusca(item, plataformaConsultada) {
  return {
    clubId: textoSeguro(item?.clubId || item?.club_id || item?.id, 20),
    clubName: textoSeguro(item?.clubName || item?.club_name || item?.name || item?.clubInfo?.name, 64),
    ...campanhaBase(item, plataformaConsultada),
    cleanSheets: numeroSeguro(item?.cleanSheets),
    currentDivision: numeroSeguro(item?.currentDivision, 99),
    skillRating: numeroSeguro(item?.skillRating),
    reputationTier: numeroSeguro(item?.reputationtier, 99),
  };
}

function normalizarEstatisticas(item, plataforma, clubeDaBusca = null) {
  const campanha = campanhaBase(item || {}, plataforma);
  const formaRecente = Array.from({ length: 10 }, (_, indice) => String(item?.[`lastMatch${indice}`] ?? "-1"))
    .filter((resultado) => ["0", "1", "2"].includes(resultado))
    .map((resultado) => ({ "0": "E", "1": "V", "2": "D" })[resultado]);
  return {
    ...campanha,
    gamesPlayedPlayoff: numeroSeguro(item?.gamesPlayedPlayoff),
    promotions: numeroSeguro(item?.promotions),
    relegations: numeroSeguro(item?.relegations),
    skillRating: numeroSeguro(item?.skillRating),
    reputationTier: numeroSeguro(item?.reputationtier, 99),
    leagueAppearances: numeroSeguro(item?.leagueAppearances),
    bestDivision: numeroSeguro(item?.bestDivision, 99),
    currentDivision: numeroSeguro(clubeDaBusca?.currentDivision, 99),
    winStreak: numeroSeguro(item?.wstreak),
    unbeatenStreak: numeroSeguro(item?.unbeatenstreak),
    recentForm: formaRecente,
  };
}

function normalizarJogador(jogador) {
  return {
    name: textoSeguro(jogador?.name || jogador?.playerName || jogador?.player_name, 64),
    proPos: textoSeguro(jogador?.proPos, 8),
    favoritePosition: textoSeguro(jogador?.favoritePosition, 24).toLowerCase(),
    gamesPlayed: numeroSeguro(jogador?.gamesPlayed, 99_999),
    goals: numeroSeguro(jogador?.goals, 99_999),
    assists: numeroSeguro(jogador?.assists, 99_999),
    manOfTheMatch: numeroSeguro(jogador?.manOfTheMatch, 99_999),
    ratingAverage: Number(decimalSeguro(jogador?.ratingAve ?? jogador?.ratingAverage ?? jogador?.rating_average).toFixed(1)),
  };
}

function normalizarDetalhesDoProvedor(dados, clubId, plataforma, nome = "") {
  const clubeBruto = dados?.club || dados?.clube || {};
  const estatisticasBrutas = dados?.stats || dados?.estatisticas || {};
  const jogadoresBrutos = Array.isArray(dados?.players)
    ? dados.players
    : (Array.isArray(dados?.jogadores) ? dados.jogadores : []);
  const jogadores = jogadoresBrutos
    .map(normalizarJogador)
    .filter((jogador) => jogador.name)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 50);
  const posicoes = dados?.positionCount || dados?.posicoes || {};
  return {
    club: {
      clubId,
      clubName: textoSeguro(clubeBruto?.clubName || clubeBruto?.name || nome, 64),
      platform: PLATAFORMAS.has(clubeBruto?.platform) ? clubeBruto.platform : plataforma,
      stadiumName: textoSeguro(clubeBruto?.stadiumName || clubeBruto?.stadium_name, 80),
    },
    stats: normalizarEstatisticas(estatisticasBrutas, plataforma, estatisticasBrutas),
    players: jogadores,
    positionCount: {
      goalkeeper: numeroSeguro(posicoes?.goalkeeper, 50),
      defender: numeroSeguro(posicoes?.defender, 50),
      midfielder: numeroSeguro(posicoes?.midfielder, 50),
      forward: numeroSeguro(posicoes?.forward, 50),
    },
    partial: Boolean(dados?.partial),
  };
}

async function consultarBusca(nome, plataforma) {
  if (configuracaoDoProvedor()) {
    const dados = await consultarProvedor("search", { name: nome, platform: plataforma });
    const lista = Array.isArray(dados?.resultados)
      ? dados.resultados
      : (Array.isArray(dados?.results) ? dados.results : (Array.isArray(dados) ? dados : []));
    return lista
      .map((item) => normalizarClubeBusca(item, plataforma))
      .filter((clube) => /^\d{1,20}$/.test(clube.clubId) && clube.clubName)
      .slice(0, 12);
  }
  if (!EA_DATA_ACCESS_AUTHORIZED) {
    throw erroDaFonte(
      "A busca automatica ainda nao possui uma fonte de dados autorizada.",
      "FONTE_NAO_CONFIGURADA",
      503,
    );
  }

  const dados = await consultarRota("busca", { platform: plataforma, clubName: nome });
  return (Array.isArray(dados) ? dados : [])
    .map((item) => normalizarClubeBusca(item, plataforma))
    .filter((clube) => /^\d{1,20}$/.test(clube.clubId) && clube.clubName)
    .slice(0, 12);
}

async function consultarDetalhes(clubId, plataforma, nome = "") {
  if (configuracaoDoProvedor()) {
    const dados = await consultarProvedor("details", { clubId, platform: plataforma, name: nome });
    return normalizarDetalhesDoProvedor(dados, clubId, plataforma, nome);
  }
  if (!EA_DATA_ACCESS_AUTHORIZED) {
    throw erroDaFonte(
      "A busca automatica ainda nao possui uma fonte de dados autorizada.",
      "FONTE_NAO_CONFIGURADA",
      503,
    );
  }

  const consultas = await Promise.allSettled([
    consultarRota("estatisticas", { platform: plataforma, clubIds: clubId }),
    consultarRota("jogadores", { platform: plataforma, clubId }),
    consultarRota("informacoes", { platform: plataforma, clubIds: clubId }),
    nome.length >= 2
      ? consultarRota("busca", { platform: plataforma, clubName: nome })
      : Promise.resolve([]),
  ]);
  const [estatisticasResposta, jogadoresResposta, informacoesResposta, buscaResposta] = consultas;
  if (consultas.slice(0, 3).every((consulta) => consulta.status === "rejected")) {
    throw estatisticasResposta.reason;
  }

  const estatisticasBrutas = estatisticasResposta.status === "fulfilled"
    ? (Array.isArray(estatisticasResposta.value) ? estatisticasResposta.value[0] : null)
    : null;
  const jogadoresBrutos = jogadoresResposta.status === "fulfilled"
    ? (Array.isArray(jogadoresResposta.value?.members) ? jogadoresResposta.value.members : [])
    : [];
  const informacoesBrutas = informacoesResposta.status === "fulfilled"
    ? informacoesResposta.value?.[clubId]
    : null;
  const clubeDaBusca = buscaResposta.status === "fulfilled" && Array.isArray(buscaResposta.value)
    ? buscaResposta.value.find((item) => String(item?.clubId || "") === clubId)
    : null;
  const jogadores = jogadoresBrutos
    .map(normalizarJogador)
    .filter((jogador) => jogador.name)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 50);

  return {
    club: {
      clubId,
      clubName: textoSeguro(informacoesBrutas?.name, 64),
      platform: plataforma,
      stadiumName: textoSeguro(informacoesBrutas?.customKit?.stadName, 80),
    },
    stats: normalizarEstatisticas(estatisticasBrutas, plataforma, clubeDaBusca),
    players: jogadores,
    positionCount: {
      goalkeeper: numeroSeguro(jogadoresResposta.status === "fulfilled" ? jogadoresResposta.value?.positionCount?.goalkeeper : 0, 50),
      defender: numeroSeguro(jogadoresResposta.status === "fulfilled" ? jogadoresResposta.value?.positionCount?.defender : 0, 50),
      midfielder: numeroSeguro(jogadoresResposta.status === "fulfilled" ? jogadoresResposta.value?.positionCount?.midfielder : 0, 50),
      forward: numeroSeguro(jogadoresResposta.status === "fulfilled" ? jogadoresResposta.value?.positionCount?.forward : 0, 50),
    },
    partial: consultas.slice(0, 3).some((consulta) => consulta.status === "rejected"),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    enviar(res, 405, { erro: "Método não permitido." });
    return;
  }
  if (excedeuLimite(req)) {
    enviar(res, 429, { erro: "Muitas consultas seguidas. Aguarde um minuto e tente novamente." });
    return;
  }

  const nome = textoSeguro(req.query?.name, 32).replace(/\s+/g, " ");
  const clubId = textoSeguro(req.query?.clubId, 20);
  const plataforma = textoSeguro(req.query?.platform, 20);
  if (!PLATAFORMAS.has(plataforma)) {
    enviar(res, 400, { erro: "Escolha uma plataforma válida." });
    return;
  }
  if (!clubId && nome.length < 2) {
    enviar(res, 400, { erro: "Digite pelo menos 2 caracteres do nome do clube." });
    return;
  }
  if (clubId && !/^\d{1,20}$/.test(clubId)) {
    enviar(res, 400, { erro: "O identificador do clube é inválido." });
    return;
  }

  try {
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    if (clubId) {
      const detalhes = await consultarDetalhes(clubId, plataforma, nome);
      enviar(res, 200, {
        ...detalhes,
        source: fonteAtual(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const resultados = await consultarBusca(nome, plataforma);
    enviar(res, 200, {
      resultados,
      consulta: { nome, plataforma },
      fonte: fonteAtual(),
      atualizadoEm: new Date().toISOString(),
    });
  } catch (erro) {
    console.error("Falha na consulta pública de clubes da EA:", erro?.message || erro);
    if (erro?.codigoFonte === "FONTE_NAO_CONFIGURADA") {
      res.setHeader("Cache-Control", "no-store");
      enviar(res, 503, {
        erro: "A busca automatica ainda nao esta configurada. Continue com o nome do clube e conecte os dados depois.",
      });
      return;
    }
    const indisponivel = erro?.name === "AbortError"
      || [403, 429, 500, 502, 503, 504].includes(erro?.statusEA)
      || [429, 500, 502, 503, 504].includes(erro?.statusFonte);
    res.setHeader("Cache-Control", "no-store");
    enviar(res, indisponivel ? 503 : 502, {
      erro: indisponivel
        ? "Os dados da EA estão temporariamente indisponíveis. Tente novamente em alguns minutos."
        : "Não foi possível consultar o clube agora.",
    });
  }
};

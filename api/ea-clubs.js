const EA_BASE_URL = "https://proclubs.ea.com/api/fc/";
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
    clubId: textoSeguro(item?.clubId, 20),
    clubName: textoSeguro(item?.clubName || item?.clubInfo?.name, 64),
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
    name: textoSeguro(jogador?.name, 64),
    proPos: textoSeguro(jogador?.proPos, 8),
    favoritePosition: textoSeguro(jogador?.favoritePosition, 24).toLowerCase(),
    gamesPlayed: numeroSeguro(jogador?.gamesPlayed, 99_999),
    goals: numeroSeguro(jogador?.goals, 99_999),
    assists: numeroSeguro(jogador?.assists, 99_999),
    manOfTheMatch: numeroSeguro(jogador?.manOfTheMatch, 99_999),
    ratingAverage: Number(decimalSeguro(jogador?.ratingAve).toFixed(1)),
  };
}

async function consultarBusca(nome, plataforma) {
  const dados = await consultarRota("busca", { platform: plataforma, clubName: nome });
  return (Array.isArray(dados) ? dados : [])
    .map((item) => normalizarClubeBusca(item, plataforma))
    .filter((clube) => /^\d{1,20}$/.test(clube.clubId) && clube.clubName)
    .slice(0, 12);
}

async function consultarDetalhes(clubId, plataforma, nome = "") {
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
        source: "EA SPORTS FC Clubs",
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const resultados = await consultarBusca(nome, plataforma);
    enviar(res, 200, {
      resultados,
      consulta: { nome, plataforma },
      fonte: "EA SPORTS FC Clubs",
      atualizadoEm: new Date().toISOString(),
    });
  } catch (erro) {
    console.error("Falha na consulta pública de clubes da EA:", erro?.message || erro);
    const indisponivel = erro?.name === "AbortError" || [403, 429, 500, 502, 503, 504].includes(erro?.statusEA);
    res.setHeader("Cache-Control", "no-store");
    enviar(res, indisponivel ? 503 : 502, {
      erro: indisponivel
        ? "Os dados da EA estão temporariamente indisponíveis. Tente novamente em alguns minutos."
        : "Não foi possível consultar o clube agora.",
    });
  }
};

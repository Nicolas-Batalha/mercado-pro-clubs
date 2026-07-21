const EA_SEARCH_URL = "https://proclubs.ea.com/api/fc/allTimeLeaderboard/search";
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

function textoSeguro(valor, maximo = 100) {
  return String(valor ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximo);
}

function numeroSeguro(valor, maximo = 9_999_999) {
  const numero = Number.parseInt(String(valor ?? "0"), 10);
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

function normalizarClube(item, plataformaConsultada) {
  const jogos = numeroSeguro(item?.gamesPlayed);
  const vitorias = numeroSeguro(item?.wins);
  const empates = numeroSeguro(item?.ties);
  const derrotas = numeroSeguro(item?.losses);
  const gols = numeroSeguro(item?.goals);
  const golsContra = numeroSeguro(item?.goalsAgainst);
  const pontos = numeroSeguro(item?.points);
  const aproveitamento = jogos > 0
    ? Math.round(((vitorias * 3 + empates) / (jogos * 3)) * 100)
    : 0;

  return {
    clubId: textoSeguro(item?.clubId, 20),
    clubName: textoSeguro(item?.clubName || item?.clubInfo?.name, 64),
    platform: PLATAFORMAS.has(item?.platform) ? item.platform : plataformaConsultada,
    gamesPlayed: jogos,
    wins: vitorias,
    ties: empates,
    losses: derrotas,
    goals: gols,
    goalsAgainst: golsContra,
    goalDifference: gols - golsContra,
    cleanSheets: numeroSeguro(item?.cleanSheets),
    points: pontos,
    currentDivision: numeroSeguro(item?.currentDivision, 99),
    skillRating: numeroSeguro(item?.skillRating),
    reputationTier: numeroSeguro(item?.reputationtier, 99),
    winRate: jogos > 0 ? Math.round((vitorias / jogos) * 100) : 0,
    aproveitamento,
  };
}

async function consultarEA(nome, plataforma) {
  const url = new URL(EA_SEARCH_URL);
  url.searchParams.set("platform", plataforma);
  url.searchParams.set("clubName", nome);

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
    const dados = await resposta.json();
    return (Array.isArray(dados) ? dados : [])
      .map((item) => normalizarClube(item, plataforma))
      .filter((clube) => /^\d{1,20}$/.test(clube.clubId) && clube.clubName)
      .slice(0, 12);
  } finally {
    clearTimeout(limite);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    enviar(res, 405, { erro: "Método não permitido." });
    return;
  }
  if (excedeuLimite(req)) {
    enviar(res, 429, { erro: "Muitas buscas seguidas. Aguarde um minuto e tente novamente." });
    return;
  }

  const nome = textoSeguro(req.query?.name, 32).replace(/\s+/g, " ");
  const plataforma = textoSeguro(req.query?.platform, 20);
  if (nome.length < 2) {
    enviar(res, 400, { erro: "Digite pelo menos 2 caracteres do nome do clube." });
    return;
  }
  if (!PLATAFORMAS.has(plataforma)) {
    enviar(res, 400, { erro: "Escolha uma plataforma válida." });
    return;
  }

  try {
    const resultados = await consultarEA(nome, plataforma);
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    enviar(res, 200, {
      resultados,
      consulta: { nome, plataforma },
      fonte: "EA SPORTS FC Clubs",
      atualizadoEm: new Date().toISOString(),
    });
  } catch (erro) {
    console.error("Falha na consulta pública de clubes da EA:", erro?.message || erro);
    const indisponivel = erro?.name === "AbortError" || [403, 429, 500, 502, 503, 504].includes(erro?.statusEA);
    enviar(res, indisponivel ? 503 : 502, {
      erro: indisponivel
        ? "A busca da EA está temporariamente indisponível. Tente novamente em alguns minutos."
        : "Não foi possível consultar os clubes agora.",
    });
  }
};

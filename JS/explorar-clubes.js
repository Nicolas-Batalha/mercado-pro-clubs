import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const TEMPO_ATIVO_VAGA_MS = 30 * 24 * 60 * 60 * 1000;

const ROTULOS = {
  ps5: "PlayStation 5",
  ps4: "PlayStation 4",
  xboxS: "Xbox Series X/S",
  "xbox-Series": "Xbox Series X/S",
  xboxO: "Xbox One",
  "xbox-One": "Xbox One",
  pc: "PC",
  switch: "Nintendo Switch",
  switch1: "Nintendo Switch",
  switch2: "Nintendo Switch 2",
  crossplay: "Crossplay",
  misto: "Misto",
  "new-gen": "Nova geração",
  "new gen": "Nova geração",
  newgen: "Nova geração",
  "nova-geracao": "Nova geração",
  "ven-gen": "Antiga geração",
  "ven gen": "Antiga geração",
  "old-gen": "Antiga geração",
  "old gen": "Antiga geração",
  oldgen: "Antiga geração",
  "antiga-geracao": "Antiga geração",
  "america do sul": "América do Sul",
  eafc26: "EA FC 26",
  eafc25: "EA FC 25",
  eafc24: "EA FC 24",
  eafc23: "EA FC 23",
  competitivo: "Competitivo",
  casual: "Casual",
  norte: "Norte",
  nordeste: "Nordeste",
  "centro-oeste": "Centro-Oeste",
  sudeste: "Sudeste",
  sul: "Sul",
  exterior: "Exterior",
  ata: "Ataque",
  atacante: "Atacante",
  ponta: "Ponta",
  mei: "Meio-campo",
  mc: "Meio-campo",
  meia: "Meia",
  vol: "Volante",
  zag: "Zagueiro",
  zagueiro: "Zagueiro",
  ld: "Lateral direito",
  le: "Lateral esquerdo",
  gk: "Goleiro",
  gol: "Goleiro",
};

let clubesCarregados = [];

function escHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function uidValido(valor) {
  const uid = normalizar(valor);
  return Boolean(uid) && !["undefined", "null", "—"].includes(uid);
}

function rotulo(valor) {
  const texto = String(valor || "").trim();
  return ROTULOS[texto] || ROTULOS[normalizar(texto)] || texto;
}

function imagemSegura(valor) {
  const src = String(valor || "").trim();
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(src)) return src;
  if (/^https:\/\//i.test(src)) return src;
  return "../IMG/real madrid.svg";
}

function vagaAtiva(vaga) {
  if (["encerrada", "removida", "cancelada"].includes(normalizar(vaga.status))) return false;
  const criadoEm = vaga.criadoEm?.toMillis?.() || 0;
  return !criadoEm || Date.now() - criadoEm < TEMPO_ATIVO_VAGA_MS;
}

function preencherSelect(id, valores) {
  const select = document.getElementById(id);
  if (!select) return;
  const unicosPorRotulo = new Map();
  valores
    .filter(Boolean)
    .map(String)
    .forEach((valor) => {
      const chave = normalizar(rotulo(valor));
      if (!unicosPorRotulo.has(chave)) unicosPorRotulo.set(chave, valor);
    });
  const valoresUnicos = [...unicosPorRotulo.values()]
    .sort((a, b) => rotulo(a).localeCompare(rotulo(b), "pt-BR"));
  valoresUnicos.forEach((valor) => {
    const option = document.createElement("option");
    option.value = valor;
    option.textContent = rotulo(valor);
    select.appendChild(option);
  });
}

function montarClubes(clubesDocs, jogadoresDocs, vagasDocs) {
  const clubesAtivosDocs = clubesDocs.filter((clubeDoc) => clubeDoc.data().suspenso !== true);
  const clubesAtivosIds = new Set(clubesAtivosDocs.map((clubeDoc) => clubeDoc.id));
  const jogadores = jogadoresDocs
    .map((jogadorDoc) => ({ uid: jogadorDoc.id, ...jogadorDoc.data() }))
    .filter((jogador) => jogador.suspenso !== true);
  const jogadoresPorUid = new Map(jogadores.map((jogador) => [jogador.uid, jogador]));
  const vagasAtivas = vagasDocs
    .map((vagaDoc) => ({ id: vagaDoc.id, ...vagaDoc.data() }))
    .filter((vaga) => vagaAtiva(vaga) && clubesAtivosIds.has(vaga.capitaoUid));

  clubesCarregados = clubesAtivosDocs.map((clubeDoc) => {
    const dados = clubeDoc.data();
    const capitaoUid = uidValido(dados.capitaoUid) ? dados.capitaoUid : clubeDoc.id;
    const nome = dados.nome || jogadoresPorUid.get(capitaoUid)?.clube || "Clube sem nome";
    const vagas = vagasAtivas.filter((vaga) => (
      vaga.capitaoUid === capitaoUid
      || (!uidValido(vaga.capitaoUid) && normalizar(vaga.clube) === normalizar(nome))
    ));
    const elencoUids = new Set(
      jogadores.filter((jogador) => jogador.clubeAtualId === capitaoUid).map((jogador) => jogador.uid),
    );
    if (jogadoresPorUid.has(capitaoUid)) elencoUids.add(capitaoUid);
    const necessidades = Object.entries(dados.necessidades || {})
      .filter(([, ativa]) => ativa === true)
      .map(([posicao]) => posicao);
    vagas.forEach((vaga) => {
      if (vaga.posicao && normalizar(vaga.posicao) !== "psd") necessidades.push(vaga.posicao);
    });
    const posicoes = [...new Map(necessidades.filter(Boolean).map((valor) => [normalizar(rotulo(valor)), valor])).values()];
    const primeiraVaga = vagas[0] || {};
    return {
      id: clubeDoc.id,
      capitaoUid,
      nome,
      capitaoNome: jogadoresPorUid.get(capitaoUid)?.nickname || dados.capitaoNome || "Capitão não informado",
      escudoUrl: imagemSegura(dados.escudoUrl),
      descricao: dados.descricao || "Este clube ainda não adicionou uma apresentação.",
      plataforma: dados.plataforma || primeiraVaga.plataforma || "",
      regiao: dados.regiao || "",
      jogo: dados.jogo || primeiraVaga.jogo || "",
      objetivo: dados.objetivo || primeiraVaga.estilo || "",
      estiloJogo: dados.estiloJogo || primeiraVaga.estilo || "",
      divisao: dados.divisao || "",
      totalJogadores: elencoUids.size,
      totalVagas: vagas.length,
      posicoes,
    };
  }).sort((a, b) => (
    b.totalVagas - a.totalVagas
    || b.totalJogadores - a.totalJogadores
    || a.nome.localeCompare(b.nome, "pt-BR")
  ));

  document.getElementById("explorar-total-clubes").textContent = String(clubesCarregados.length);
  document.getElementById("explorar-total-vagas").textContent = String(vagasAtivas.length);
  const jogadoresEmClubes = new Set(
    jogadores.filter((jogador) => uidValido(jogador.clubeAtualId)).map((jogador) => jogador.uid),
  );
  document.getElementById("explorar-total-jogadores").textContent = String(jogadoresEmClubes.size);

  preencherSelect("explorar-filtro-plataforma", clubesCarregados.map((clube) => clube.plataforma));
  preencherSelect("explorar-filtro-regiao", clubesCarregados.map((clube) => clube.regiao));
  preencherSelect("explorar-filtro-jogo", clubesCarregados.map((clube) => clube.jogo));
  preencherSelect("explorar-filtro-objetivo", clubesCarregados.map((clube) => clube.objetivo));
  preencherSelect("explorar-filtro-posicao", clubesCarregados.flatMap((clube) => clube.posicoes));
}

function cardClube(clube) {
  const tags = [clube.plataforma, clube.jogo, clube.regiao, clube.divisao]
    .filter(Boolean)
    .map((valor) => `<span>${escHtml(rotulo(valor))}</span>`)
    .join("");
  const posicoes = clube.posicoes.length
    ? clube.posicoes.slice(0, 5).map((posicao) => `<span>${escHtml(rotulo(posicao))}</span>`).join("")
    : "<span>Sem posição anunciada</span>";
  return `
    <article class="explorar-clube-card">
      <div class="explorar-card-topo">
        <img class="explorar-card-escudo" src="${escHtml(clube.escudoUrl)}"
          data-fallback="../IMG/real madrid.svg" alt="Escudo do ${escHtml(clube.nome)}" />
        <div class="explorar-card-identidade">
          <h3 title="${escHtml(clube.nome)}">${escHtml(clube.nome)}</h3>
          <p>Capitão: ${escHtml(clube.capitaoNome)}</p>
          <span data-reputacao-uid="${escHtml(clube.capitaoUid)}" data-reputacao-tipo="clube"></span>
        </div>
      </div>
      <div class="explorar-card-tags">${tags || "<span>Detalhes em atualização</span>"}</div>
      <p class="explorar-card-descricao">${escHtml(clube.descricao)}</p>
      <div class="explorar-card-numeros">
        <div><strong>${clube.totalJogadores}</strong><span>jogadores no elenco</span></div>
        <div><strong>${clube.totalVagas}</strong><span>vagas abertas</span></div>
      </div>
      <p class="explorar-card-procura">Posições procuradas</p>
      <div class="explorar-card-posicoes">${posicoes}</div>
      <a class="explorar-card-link" href="./clubes.html?uid=${encodeURIComponent(clube.capitaoUid)}">
        Ver perfil completo do clube
      </a>
    </article>`;
}

function filtrosAtivos() {
  return [
    "explorar-busca",
    "explorar-filtro-plataforma",
    "explorar-filtro-regiao",
    "explorar-filtro-jogo",
    "explorar-filtro-objetivo",
    "explorar-filtro-posicao",
  ].some((id) => Boolean(document.getElementById(id)?.value));
}

function aplicarFiltros() {
  const grid = document.getElementById("explorar-grid");
  const contagem = document.getElementById("explorar-contagem");
  const busca = normalizar(document.getElementById("explorar-busca")?.value);
  const plataforma = normalizar(document.getElementById("explorar-filtro-plataforma")?.value);
  const regiao = normalizar(document.getElementById("explorar-filtro-regiao")?.value);
  const jogo = normalizar(document.getElementById("explorar-filtro-jogo")?.value);
  const objetivo = normalizar(document.getElementById("explorar-filtro-objetivo")?.value);
  const posicao = normalizar(document.getElementById("explorar-filtro-posicao")?.value);

  const filtrados = clubesCarregados.filter((clube) => {
    if (plataforma && normalizar(clube.plataforma) !== plataforma) return false;
    if (regiao && normalizar(clube.regiao) !== regiao) return false;
    if (jogo && normalizar(clube.jogo) !== jogo) return false;
    if (objetivo && normalizar(clube.objetivo) !== objetivo) return false;
    if (posicao && !clube.posicoes.some((valor) => normalizar(valor) === posicao)) return false;
    if (!busca) return true;
    return normalizar([
      clube.nome,
      clube.capitaoNome,
      clube.descricao,
      clube.plataforma,
      clube.regiao,
      clube.jogo,
      clube.objetivo,
      clube.estiloJogo,
      clube.divisao,
      ...clube.posicoes,
    ].join(" ")).includes(busca);
  });

  document.getElementById("explorar-limpar").hidden = !filtrosAtivos();
  contagem.textContent = filtrados.length === clubesCarregados.length
    ? `${filtrados.length} clube(s) cadastrado(s)`
    : `${filtrados.length} de ${clubesCarregados.length} clube(s)`;
  grid.setAttribute("aria-busy", "false");
  if (!filtrados.length) {
    grid.innerHTML = `<div class="explorar-estado">
      <strong>Nenhum clube encontrado.</strong>
      <p>Limpe os filtros ou tente uma busca diferente.</p>
    </div>`;
    return;
  }
  grid.innerHTML = filtrados.map(cardClube).join("");
  grid.querySelectorAll(".explorar-card-escudo").forEach((imagem) => {
    imagem.addEventListener("error", () => {
      imagem.src = imagem.dataset.fallback;
    }, { once: true });
  });
}

async function carregarClubes() {
  const grid = document.getElementById("explorar-grid");
  try {
    const [clubesSnap, jogadoresSnap, vagasSnap] = await Promise.all([
      getDocs(collection(db, "clubes")),
      getDocs(collection(db, "jogadores")),
      getDocs(collection(db, "vagas")),
    ]);
    montarClubes(clubesSnap.docs, jogadoresSnap.docs, vagasSnap.docs);
    aplicarFiltros();
  } catch (err) {
    console.error("Erro ao carregar diretório de clubes:", err);
    document.getElementById("explorar-contagem").textContent = "Não foi possível carregar os clubes";
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = `<div class="explorar-estado">
      <strong>Não foi possível carregar os clubes.</strong>
      <p>Atualize a página e tente novamente em alguns instantes.</p>
    </div>`;
  }
}

[
  "explorar-filtro-plataforma",
  "explorar-filtro-regiao",
  "explorar-filtro-jogo",
  "explorar-filtro-objetivo",
  "explorar-filtro-posicao",
].forEach((id) => document.getElementById(id)?.addEventListener("change", aplicarFiltros));

let atrasoBusca = null;
document.getElementById("explorar-busca")?.addEventListener("input", () => {
  clearTimeout(atrasoBusca);
  atrasoBusca = setTimeout(aplicarFiltros, 140);
});

document.getElementById("explorar-limpar")?.addEventListener("click", () => {
  [
    "explorar-busca",
    "explorar-filtro-plataforma",
    "explorar-filtro-regiao",
    "explorar-filtro-jogo",
    "explorar-filtro-objetivo",
    "explorar-filtro-posicao",
  ].forEach((id) => {
    const campo = document.getElementById(id);
    if (campo) campo.value = "";
  });
  aplicarFiltros();
});

carregarClubes();

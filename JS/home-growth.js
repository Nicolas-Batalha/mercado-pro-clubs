// Dados reais e destaque dinâmico da página inicial.
import { db } from "./firebase-config.js";
import {
  collection,
  getCountFromServer,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timestampParaMs(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  const data = new Date(valor).getTime();
  return Number.isFinite(data) ? data : 0;
}

function formatarData(valor) {
  const ms = timestampParaMs(valor);
  if (!ms) return "Data a definir";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(ms));
}

function statusTorneio(torneio) {
  const status = normalizar(torneio.status).replaceAll(" ", "_");
  if (["andamento", "em_andamento", "iniciado"].includes(status)) return "andamento";
  if (["finalizado", "encerrado", "concluido"].includes(status)) return "finalizado";
  if (["cancelado", "cancelada"].includes(status)) return "cancelado";
  return "aberto";
}

async function carregarMetricas() {
  const painel = document.getElementById("inicio-metricas");
  try {
    const [jogadores, clubes, vagasSnapshot, torneios] = await Promise.all([
      getCountFromServer(collection(db, "jogadores")).then((resultado) => resultado.data().count),
      getCountFromServer(collection(db, "clubes")).then((resultado) => resultado.data().count),
      getDocs(collection(db, "vagas")),
      getCountFromServer(collection(db, "torneios")).then((resultado) => resultado.data().count),
    ]);
    const limiteVagaAtiva = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const vagas = vagasSnapshot.docs.filter((registro) => {
      const criadoEm = timestampParaMs(registro.data().criadoEm);
      return !criadoEm || criadoEm >= limiteVagaAtiva;
    }).length;
    const contagens = [jogadores, clubes, vagas, torneios];
    const ids = ["home-total-jogadores", "home-total-clubes", "home-total-vagas", "home-total-torneios"];
    ids.forEach((id, indice) => {
      const elemento = document.getElementById(id);
      if (elemento) elemento.textContent = new Intl.NumberFormat("pt-BR").format(contagens[indice]);
    });
  } catch (erro) {
    console.debug("Métricas da comunidade indisponíveis:", erro?.code || erro?.message);
  } finally {
    painel?.setAttribute("aria-busy", "false");
  }
}

function escolherDestaque(torneios) {
  const agora = Date.now();
  const prioridade = { aberto: 0, andamento: 1, finalizado: 2, cancelado: 3 };
  return torneios
    .filter((torneio) => statusTorneio(torneio) !== "cancelado")
    .sort((a, b) => {
      const statusA = statusTorneio(a);
      const statusB = statusTorneio(b);
      if (prioridade[statusA] !== prioridade[statusB]) return prioridade[statusA] - prioridade[statusB];
      const dataA = timestampParaMs(a.inscricoesAte) || timestampParaMs(a.dataInicio) || agora;
      const dataB = timestampParaMs(b.inscricoesAte) || timestampParaMs(b.dataInicio) || agora;
      const futuraA = dataA >= agora ? 0 : 1;
      const futuraB = dataB >= agora ? 0 : 1;
      return futuraA - futuraB || Math.abs(dataA - agora) - Math.abs(dataB - agora);
    })[0] || null;
}

async function carregarDestaque() {
  const secao = document.getElementById("inicio-torneio-destaque");
  const titulo = document.getElementById("inicio-torneio-titulo");
  const descricao = document.getElementById("inicio-torneio-descricao");
  const meta = document.getElementById("inicio-torneio-meta");
  const link = document.getElementById("inicio-torneio-link");
  const compartilhar = document.getElementById("inicio-torneio-compartilhar");
  if (!secao || !titulo || !descricao || !meta || !link || !compartilhar) return;

  try {
    const snapshot = await getDocs(collection(db, "torneios"));
    const torneios = snapshot.docs.map((registro) => ({ id: registro.id, ...registro.data() }));
    const torneio = escolherDestaque(torneios);
    if (!torneio) {
      titulo.textContent = "Seu clube pode ser o próximo campeão";
      descricao.textContent = "Acompanhe a área de torneios e prepare seu elenco para as próximas inscrições.";
      meta.innerHTML = '<span>Calendário competitivo</span><span>Resultados organizados</span>';
      return;
    }

    const inscricoes = await getDocs(collection(db, "torneios", torneio.id, "inscricoes"));
    const confirmados = inscricoes.docs.filter((registro) => normalizar(registro.data().status) === "aprovada").length;
    const status = statusTorneio(torneio);
    const rotuloStatus = status === "aberto" ? "Inscrições abertas" : status === "andamento" ? "Em andamento" : "Finalizado";
    const urlRelativa = `./HTML/torneio.html?torneio=${encodeURIComponent(torneio.id)}`;
    const urlPublica = `https://www.mercadoproclubs.com/HTML/torneio.html?torneio=${encodeURIComponent(torneio.id)}`;

    titulo.textContent = String(torneio.nome || "Torneio de Pro Clubs");
    descricao.textContent = String(torneio.descricao || "Uma competição para os clubes da comunidade Mercado Pro Clubs.");
    meta.innerHTML = `
      <span>${escaparHtml(rotuloStatus)}</span>
      <span>${escaparHtml(String(torneio.jogo || "EA FC"))}</span>
      <span>${escaparHtml(String(torneio.plataforma || "Crossplay"))}</span>
      <span>${confirmados} clube${confirmados === 1 ? "" : "s"} confirmado${confirmados === 1 ? "" : "s"}</span>
      <span>${status === "aberto" ? `Até ${escaparHtml(formatarData(torneio.inscricoesAte))}` : `Início ${escaparHtml(formatarData(torneio.dataInicio))}`}</span>`;
    link.href = urlRelativa;
    link.textContent = status === "aberto" ? "VER E INSCREVER MEU CLUBE" : "ACOMPANHAR TORNEIO";
    compartilhar.hidden = false;
    compartilhar.dataset.compartilharUrl = urlPublica;
    compartilhar.dataset.compartilharTitulo = String(torneio.nome || "Torneio de Pro Clubs");
    compartilhar.dataset.compartilharTexto = `Confira o torneio ${torneio.nome || "de Pro Clubs"} no Mercado Pro Clubs.`;
  } catch (erro) {
    console.debug("Destaque de torneio indisponível:", erro?.code || erro?.message);
    titulo.textContent = "Entre em campo e dispute o topo";
    descricao.textContent = "Veja campeonatos, inscreva seu clube e acompanhe confrontos e resultados.";
    meta.innerHTML = '<span>Torneios da comunidade</span><span>Inscrições pelo site</span>';
  } finally {
    secao.setAttribute("aria-busy", "false");
  }
}

carregarMetricas();
carregarDestaque();

// Orientação da página inicial conforme o estado real da conta no Firestore.
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const painel = document.getElementById("inicio-proximo-passo");
const titulo = document.getElementById("inicio-proximo-titulo");
const descricao = document.getElementById("inicio-proximo-descricao");
const link = document.getElementById("inicio-proximo-link");
const caminhoJogador = document.getElementById("caminho-jogador-link");
const caminhoCapitao = document.getElementById("caminho-capitao-link");

function texto(valor) {
  return String(valor || "").trim();
}

function perfilCompleto(perfil) {
  return Boolean(
    texto(perfil.nickname) &&
    texto(perfil.eaId) &&
    texto(perfil.posicao) &&
    texto(perfil.plataforma)
  );
}

function clubeCompleto(clube) {
  const necessidades = clube?.necessidades && typeof clube.necessidades === "object"
    ? Object.values(clube.necessidades).some(Boolean)
    : false;
  return Boolean(
    texto(clube?.nome) &&
    texto(clube?.plataforma) &&
    texto(clube?.jogo) &&
    texto(clube?.regiao) &&
    texto(clube?.objetivo) &&
    texto(clube?.estiloJogo) &&
    texto(clube?.horarioTreino) &&
    texto(clube?.descricao).length >= 30 &&
    Array.isArray(clube?.diasTreino) && clube.diasTreino.length > 0 &&
    necessidades &&
    Boolean(texto(clube?.discord) || texto(clube?.whatsapp) || texto(clube?.instagram))
  );
}

function documentos(resultado) {
  if (resultado.status !== "fulfilled") return [];
  return resultado.value.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function possuiPendente(lista) {
  return lista.some((item) => texto(item.status).toLowerCase() === "pendente");
}

function marcarJornada(etapaAtual) {
  document.querySelectorAll("[data-jornada-etapa]").forEach((elemento) => {
    const etapa = Number(elemento.dataset.jornadaEtapa);
    elemento.classList.toggle("concluida", etapa < etapaAtual);
    elemento.classList.toggle("atual", etapa === etapaAtual);
  });
}

function mostrarProximoPasso({ saudacao, tituloTexto, descricaoTexto, href, botao, etapa }) {
  if (!painel || !titulo || !descricao || !link) return;
  titulo.textContent = saudacao ? `${saudacao}, ${tituloTexto}` : tituloTexto;
  descricao.textContent = descricaoTexto;
  link.href = href;
  link.textContent = botao;
  marcarJornada(etapa);
  painel.hidden = false;
}

async function montarOrientacao(usuario) {
  if (!usuario) {
    if (painel) painel.hidden = true;
    if (caminhoJogador) caminhoJogador.href = "./HTML/cadastrar-se.html#cadastro";
    if (caminhoCapitao) caminhoCapitao.href = "./HTML/cadastrar-se.html#cadastro";
    return;
  }

  const uid = usuario.uid;
  const [perfilSnap, clubeSnap] = await Promise.all([
    getDoc(doc(db, "jogadores", uid)),
    getDoc(doc(db, "clubes", uid)),
  ]);
  if (auth.currentUser?.uid !== uid) return;

  const perfil = perfilSnap.exists() ? perfilSnap.data() : {};
  const clube = clubeSnap.exists() ? clubeSnap.data() : null;
  const ehCapitao = Boolean(clube || perfil.ehCapitao);
  const nome = texto(perfil.nickname || usuario.displayName).split(" ")[0];
  const saudacao = nome ? `Olá, ${nome}` : "";

  if (caminhoJogador) {
    caminhoJogador.href = perfilCompleto(perfil)
      ? "./HTML/mercado.html"
      : "./HTML/meu-perfil.html";
    caminhoJogador.textContent = perfilCompleto(perfil)
      ? "VER VAGAS PARA MIM"
      : "COMPLETAR MEU PERFIL";
  }
  if (caminhoCapitao) {
    caminhoCapitao.href = "./HTML/clubes.html";
    caminhoCapitao.textContent = ehCapitao ? "ABRIR MEU CLUBE" : "CRIAR MEU CLUBE";
  }

  const consultas = await Promise.allSettled([
    getDocs(query(collection(db, "candidaturas"), where("jogadorUid", "==", uid))),
    getDocs(query(collection(db, "candidaturas"), where("capitaoUid", "==", uid))),
    getDocs(query(collection(db, "convitesClube"), where("jogadorUid", "==", uid))),
    getDocs(query(collection(db, "vagas"), where("capitaoUid", "==", uid))),
  ]);
  if (auth.currentUser?.uid !== uid) return;

  const candidaturasJogador = documentos(consultas[0]);
  const candidaturasCapitao = documentos(consultas[1]);
  const convites = documentos(consultas[2]);
  const vagas = documentos(consultas[3]);
  const temNegociacaoPendente = [candidaturasJogador, candidaturasCapitao, convites].some(possuiPendente);

  if (!perfilSnap.exists() || !perfilCompleto(perfil)) {
    mostrarProximoPasso({
      saudacao,
      tituloTexto: "complete seu perfil de jogador",
      descricaoTexto: "Informe seu nickname, ID EA, posição e plataforma para aparecer corretamente nas buscas.",
      href: "./HTML/meu-perfil.html",
      botao: "COMPLETAR PERFIL",
      etapa: 1,
    });
    return;
  }

  if (temNegociacaoPendente) {
    mostrarProximoPasso({
      saudacao,
      tituloTexto: "você tem negociações esperando",
      descricaoTexto: "Veja propostas e convites pendentes em uma tela única e responda sem perder nenhuma oportunidade.",
      href: "./HTML/negociacoes.html",
      botao: "VER NEGOCIAÇÕES",
      etapa: 3,
    });
    return;
  }

  if (ehCapitao) {
    if (!clube) {
      mostrarProximoPasso({
        saudacao,
        tituloTexto: "configure seu clube",
        descricaoTexto: "Cadastre a identidade e as informações básicas do clube antes de buscar jogadores.",
        href: "./HTML/clubes.html",
        botao: "CONFIGURAR CLUBE",
        etapa: 2,
      });
      return;
    }

    if (!clubeCompleto(clube)) {
      mostrarProximoPasso({
        saudacao,
        tituloTexto: "complete os detalhes do clube",
        descricaoTexto: "Um clube completo transmite confiança e ajuda os jogadores a decidir se combinam com o elenco.",
        href: "./HTML/clubes.html",
        botao: "COMPLETAR CLUBE",
        etapa: 2,
      });
      return;
    }

    if (!vagas.length) {
      mostrarProximoPasso({
        saudacao,
        tituloTexto: "publique a primeira vaga do clube",
        descricaoTexto: "Diga qual posição procura e receba candidaturas de jogadores interessados.",
        href: "./HTML/mercado.html#publicar-vaga",
        botao: "PUBLICAR VAGA",
        etapa: 2,
      });
      return;
    }

    mostrarProximoPasso({
      saudacao,
      tituloTexto: "encontre jogadores para seu elenco",
      descricaoTexto: "Veja quem ativou a busca por clube e envie um convite diretamente pelo perfil do atleta.",
      href: "./HTML/mercado.html?aba=jogadores",
      botao: "VER JOGADORES",
      etapa: 2,
    });
    return;
  }

  if (perfil.clubeAtualId) {
    mostrarProximoPasso({
      saudacao,
      tituloTexto: "acompanhe seu clube atual",
      descricaoTexto: "Veja o elenco, os detalhes e as informações públicas do clube ao qual você está vinculado.",
      href: `./HTML/clubes.html?uid=${encodeURIComponent(perfil.clubeAtualId)}`,
      botao: "VER MEU CLUBE",
      etapa: 4,
    });
    return;
  }

  if (perfil.procurandoClube) {
    mostrarProximoPasso({
      saudacao,
      tituloTexto: "veja vagas compatíveis com você",
      descricaoTexto: "Compare oportunidades por posição e plataforma e candidate-se ao clube que mais combina com seu estilo.",
      href: "./HTML/mercado.html",
      botao: "VER VAGAS",
      etapa: 2,
    });
    return;
  }

  mostrarProximoPasso({
    saudacao,
    tituloTexto: "ative sua busca por clube",
    descricaoTexto: "Marque que está procurando clube para ficar visível aos capitães no mercado de jogadores.",
    href: "./HTML/meu-perfil.html",
    botao: "ATIVAR BUSCA",
    etapa: 1,
  });
}

onAuthStateChanged(auth, (usuario) => {
  montarOrientacao(usuario).catch((erro) => {
    console.warn("Não foi possível montar a orientação inicial:", erro?.message || erro);
    if (painel) painel.hidden = true;
  });
});

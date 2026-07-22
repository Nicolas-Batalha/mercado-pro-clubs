import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const estado = {
  carregando: null,
  avaliacoes: [],
  erro: false,
};

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timestampMs(valor) {
  return valor?.toMillis?.() || valor?.getTime?.() || 0;
}

function notaValida(valor) {
  const nota = Number(valor);
  return Number.isInteger(nota) && nota >= 1 && nota <= 5;
}

function resumoDoAlvo(uid) {
  const avaliacoes = estado.avaliacoes.filter((item) => item.alvoUid === uid && notaValida(item.nota));
  const total = avaliacoes.length;
  const media = total
    ? avaliacoes.reduce((soma, item) => soma + Number(item.nota), 0) / total
    : 0;
  const negociacoes = new Set(avaliacoes.map((item) => `${item.negociacaoTipo}|${item.negociacaoId}`));
  const comentarios = avaliacoes
    .filter((item) => String(item.comentario || "").trim())
    .sort((a, b) => timestampMs(b.criadoEm) - timestampMs(a.criadoEm))
    .slice(0, 3);
  return { total, media, negociacoes: negociacoes.size, comentarios };
}

function seloReputacao({ total, media }, tipo) {
  const entidade = tipo === "clube" ? "Clube" : "Jogador";
  if (total >= 8 && media >= 4.7) return `${entidade} de elite`;
  if (total >= 3 && media >= 4.2) return `${entidade} confiável`;
  if (total >= 1) return "Reputação em formação";
  return "Sem avaliações";
}

function renderizarInline(elemento, resumo, tipo) {
  const assinatura = `inline|${elemento.dataset.reputacaoUid}|${resumo.total}|${resumo.media.toFixed(2)}`;
  if (elemento.dataset.reputacaoRender === assinatura) return;
  elemento.dataset.reputacaoRender = assinatura;
  elemento.classList.add("reputacao-inline");
  if (!resumo.total) {
    elemento.replaceChildren(); elemento.hidden = true;
    elemento.setAttribute("aria-label", `${tipo === "clube" ? "Clube" : "Jogador"} ainda sem avaliações`);
    return;
  }
  elemento.hidden = false;
  elemento.innerHTML = `<span class="reputacao-estrela" aria-hidden="true">★</span>
    <strong>${resumo.media.toFixed(1)}</strong><small>(${resumo.total})</small>`;
  elemento.setAttribute("aria-label", `Nota ${resumo.media.toFixed(1)} de 5 em ${resumo.total} avaliações verificadas`);
}

function renderizarCompleto(elemento, resumo, tipo) {
  const assinatura = `completo|${elemento.dataset.reputacaoUid}|${resumo.total}|${resumo.media.toFixed(2)}|${resumo.comentarios.length}`;
  if (elemento.dataset.reputacaoRender === assinatura) return;
  elemento.dataset.reputacaoRender = assinatura;
  const rotulo = tipo === "clube" ? "do clube" : "do jogador";
  const selo = seloReputacao(resumo, tipo);
  const comentarios = resumo.comentarios.length
    ? `<div class="reputacao-comentarios">
        <h3>Comentários recentes</h3>
        ${resumo.comentarios.map((item) => `<blockquote>
          <div><span aria-hidden="true">★</span><strong>${Number(item.nota).toFixed(1)}</strong><small>Avaliação verificada</small></div>
          <p>${escaparHtml(item.comentario)}</p>
        </blockquote>`).join("")}
      </div>`
    : "";

  elemento.classList.add("reputacao-widget-completo");
  elemento.innerHTML = `
    <div class="reputacao-cabecalho">
      <div>
        <span class="reputacao-kicker">REPUTAÇÃO VERIFICADA</span>
        <h2>Confiança ${rotulo}</h2>
        <p>Somente negociações aceitas podem gerar avaliações.</p>
      </div>
      <span class="reputacao-selo${resumo.total >= 3 && resumo.media >= 4.2 ? " destaque" : ""}">${escaparHtml(selo)}</span>
    </div>
    <div class="reputacao-numeros">
      <article><strong>${resumo.total ? resumo.media.toFixed(1) : "—"}</strong><span>nota média</span></article>
      <article><strong>${resumo.total}</strong><span>avaliações</span></article>
      <article><strong>${resumo.negociacoes}</strong><span>negociações avaliadas</span></article>
    </div>
    ${comentarios}`;
}

function renderizarElemento(elemento) {
  const uid = String(elemento.dataset.reputacaoUid || "").trim();
  if (!uid) return;
  if (estado.erro) {
    elemento.textContent = "Reputação indisponível";
    return;
  }
  const resumo = resumoDoAlvo(uid);
  const tipo = elemento.dataset.reputacaoTipo === "clube" ? "clube" : "jogador";
  if (elemento.dataset.reputacaoVariante === "completo") renderizarCompleto(elemento, resumo, tipo);
  else renderizarInline(elemento, resumo, tipo);
}

function atualizar() {
  document.querySelectorAll("[data-reputacao-uid]").forEach(renderizarElemento);
}

async function carregar(forcar = false) {
  if (estado.carregando && !forcar) return estado.carregando;
  estado.carregando = (async () => {
    try {
      const snap = await getDocs(collection(db, "avaliacoes"));
      estado.avaliacoes = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      estado.erro = false;
    } catch (erro) {
      console.error("Erro ao carregar reputação:", erro);
      estado.erro = true;
    }
    atualizar();
  })();
  await estado.carregando;
  estado.carregando = null;
}

const observador = new MutationObserver(() => atualizar());
observador.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["data-reputacao-uid"],
});

window.mercadoReputacao = {
  atualizar,
  recarregar: () => carregar(true),
};

carregar();

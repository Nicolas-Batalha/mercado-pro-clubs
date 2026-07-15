// =========================================================================
// MERCADO PRO CLUBS — admin.js
// Painel privado para consulta e moderação do conteúdo da plataforma.
// A interface verifica admins/{uid}; as regras do Firestore são a proteção real.
// =========================================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { confirmModal } from "./confirm-modal.js";

const NOMES_COLECOES = {
  jogadores: "jogadores",
  clubes: "clubes",
  vagas: "vagas",
  denuncias: "denuncias",
  convites: "convitesClube",
  logs: "logsAdmin",
};

const ROTULOS_POSICAO = {
  gk: "Goleiro",
  zag: "Zagueiro",
  lat: "Lateral",
  vol: "Volante",
  mei: "Meia",
  ponta: "Ponta",
  ata: "Atacante",
  psd: "Qualquer posição",
};

const ROTULOS_PLATAFORMA = {
  ps5: "PlayStation 5",
  ps4: "PlayStation 4",
  xbox: "Xbox",
  xbox_series: "Xbox Series",
  pc: "PC",
  crossplay: "Crossplay",
};

const estado = {
  usuario: null,
  config: {},
  podeModerar: false,
  carregamento: 0,
  dados: {
    jogadores: [],
    clubes: [],
    vagas: [],
    denuncias: [],
    convites: [],
    logs: [],
  },
};

const porId = (id) => document.getElementById(id);

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function texto(valor, fallback = "Não informado") {
  const resultado = String(valor ?? "").trim();
  return resultado || fallback;
}

function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function timestampParaMs(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  if (valor instanceof Date) return valor.getTime();
  const convertido = new Date(valor).getTime();
  return Number.isFinite(convertido) ? convertido : 0;
}

function dataDoRegistro(registro) {
  return timestampParaMs(
    registro?.criadoEm || registro?.atualizadoEm || registro?.analisadaEm || registro?.resolvidaEm,
  );
}

function formatarData(valor, incluirHora = true) {
  const ms = timestampParaMs(valor);
  if (!ms) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(incluirHora ? { timeStyle: "short" } : {}),
  }).format(new Date(ms));
}

function ordenarRecentes(lista) {
  return [...lista].sort((a, b) => dataDoRegistro(b) - dataDoRegistro(a));
}

function rotuloPosicao(valor) {
  return ROTULOS_POSICAO[normalizar(valor)] || texto(valor);
}

function rotuloPlataforma(valor) {
  const chave = normalizar(valor).replaceAll(" ", "_").replaceAll("-", "_");
  return ROTULOS_PLATAFORMA[chave] || texto(valor);
}

function statusDenuncia(denuncia) {
  const status = normalizar(denuncia?.status || "pendente");
  if (["analisada", "analisado"].includes(status)) return "analisada";
  if (["resolvida", "resolvido"].includes(status)) return "resolvida";
  return "pendente";
}

function estaPendente(denuncia) {
  return statusDenuncia(denuncia) === "pendente";
}

function toast(mensagem, tipo = "sucesso") {
  document.querySelector(".admin-toast")?.remove();
  const aviso = document.createElement("div");
  aviso.className = `admin-toast${tipo === "erro" ? " erro" : ""}`;
  aviso.setAttribute("role", tipo === "erro" ? "alert" : "status");
  aviso.setAttribute("aria-live", "polite");
  aviso.textContent = mensagem;
  document.body.appendChild(aviso);
  window.setTimeout(() => aviso.remove(), 4200);
}

function mostrarAcesso(titulo, mensagem, mostrarLogin = false) {
  const container = porId("admin-estado-acesso");
  if (!container) return;
  container.hidden = false;
  container.replaceChildren();

  const h1 = document.createElement("h1");
  h1.textContent = titulo;
  const p = document.createElement("p");
  p.textContent = mensagem;
  container.append(h1, p);

  if (mostrarLogin) {
    const link = document.createElement("a");
    link.href = "./cadastrar-se.html#login";
    link.textContent = "Entrar na minha conta";
    container.appendChild(link);
  }
}

function mostrarCarregamentoAcesso() {
  const container = porId("admin-estado-acesso");
  if (!container) return;
  container.hidden = false;
  container.innerHTML = `
    <div class="admin-carregando" aria-hidden="true"></div>
    <h1>Verificando acesso</h1>
    <p>Aguarde enquanto confirmamos sua permissão administrativa.</p>`;
}

async function carregarColecao(chave) {
  try {
    const snap = await getDocs(collection(db, NOMES_COLECOES[chave]));
    return { chave, itens: snap.docs.map((item) => ({ id: item.id, ...item.data() })) };
  } catch (erro) {
    console.error(`Erro ao carregar ${NOMES_COLECOES[chave]}:`, erro);
    return { chave, itens: [], erro };
  }
}

async function carregarDados() {
  const requisicao = ++estado.carregamento;
  const botao = porId("admin-atualizar");
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Atualizando...";
  }

  const resultados = await Promise.all(
    Object.keys(NOMES_COLECOES).map((chave) => carregarColecao(chave)),
  );

  if (requisicao !== estado.carregamento || !estado.usuario) return;

  resultados.forEach(({ chave, itens }) => {
    estado.dados[chave] = ordenarRecentes(itens);
  });

  renderizarTudo();
  const falhas = resultados.filter((resultado) => resultado.erro);
  if (falhas.length) {
    const nomes = falhas.map(({ chave }) => NOMES_COLECOES[chave]).join(", ");
    toast(`Sem permissão para carregar: ${nomes}. Confira as regras do Firestore.`, "erro");
  }

  if (botao) {
    botao.disabled = false;
    botao.textContent = "Atualizar dados";
  }
}

function preencherMetrica(id, valor) {
  const elemento = porId(id);
  if (elemento) elemento.textContent = String(valor);
}

function renderizarMetricas() {
  const pendentes = estado.dados.denuncias.filter(estaPendente);
  const convitesPendentes = estado.dados.convites.filter(
    (convite) => normalizar(convite.status || "pendente") === "pendente",
  );

  preencherMetrica("admin-total-jogadores", estado.dados.jogadores.length);
  preencherMetrica(
    "admin-total-disponiveis",
    estado.dados.jogadores.filter((jogador) => jogador.procurandoClube === true).length,
  );
  preencherMetrica("admin-total-clubes", estado.dados.clubes.length);
  preencherMetrica("admin-total-vagas", estado.dados.vagas.length);
  preencherMetrica("admin-total-denuncias", pendentes.length);
  preencherMetrica("admin-total-convites", convitesPendentes.length);

  const contadorNav = porId("admin-nav-denuncias");
  if (contadorNav) {
    contadorNav.textContent = String(pendentes.length);
    contadorNav.hidden = pendentes.length === 0;
  }

  const atualizacao = porId("admin-ultima-atualizacao");
  if (atualizacao) atualizacao.textContent = `Atualizado em ${formatarData(new Date())}`;
}

function renderizarResumos() {
  const denunciasEl = porId("admin-resumo-denuncias");
  const vagasEl = porId("admin-resumo-vagas");

  if (denunciasEl) {
    const ultimas = estado.dados.denuncias.filter(estaPendente).slice(0, 5);
    denunciasEl.innerHTML = ultimas.length
      ? ultimas.map((denuncia) => `
          <div class="admin-resumo-item">
            <strong>${escaparHtml(texto(denuncia.clube, "Vaga denunciada"))}</strong>
            <span>Aguardando análise</span>
            <time>${escaparHtml(formatarData(denuncia.criadoEm))}</time>
          </div>`).join("")
      : '<div class="admin-vazio">Nenhuma denúncia pendente.</div>';
  }

  if (vagasEl) {
    const ultimas = estado.dados.vagas.slice(0, 5);
    vagasEl.innerHTML = ultimas.length
      ? ultimas.map((vaga) => `
          <div class="admin-resumo-item">
            <strong>${escaparHtml(texto(vaga.clube, "Clube sem nome"))}</strong>
            <span>${escaparHtml(rotuloPosicao(vaga.posicao))}</span>
            <time>${escaparHtml(formatarData(vaga.criadoEm))}</time>
          </div>`).join("")
      : '<div class="admin-vazio">Nenhuma vaga publicada.</div>';
  }
}

function statusJogador(jogador) {
  if (jogador.suspenso === true) return { texto: "Suspenso", classe: "vermelho" };
  if (jogador.procurandoClube === true) return { texto: "Procurando clube", classe: "verde" };
  if (jogador.ehCapitao === true) return { texto: "Capitão", classe: "amarelo" };
  return { texto: "Cadastrado", classe: "" };
}

function renderizarUsuarios() {
  const corpo = porId("admin-lista-usuarios");
  if (!corpo) return;
  const busca = normalizar(porId("admin-busca-usuarios")?.value);
  const filtro = porId("admin-filtro-usuarios")?.value || "todos";

  const filtrados = estado.dados.jogadores.filter((jogador) => {
    const correspondeBusca = !busca || normalizar([
      jogador.nickname,
      jogador.email,
      jogador.eaId,
      jogador.idEA,
      jogador.clubeAtualNome,
    ].filter(Boolean).join(" ")).includes(busca);

    const correspondeFiltro = filtro === "todos"
      || (filtro === "disponiveis" && jogador.procurandoClube === true)
      || (filtro === "capitaes" && jogador.ehCapitao === true)
      || (filtro === "suspensos" && jogador.suspenso === true);
    return correspondeBusca && correspondeFiltro;
  });

  const contagem = porId("admin-contagem-usuarios");
  if (contagem) contagem.textContent = `${filtrados.length} de ${estado.dados.jogadores.length}`;

  corpo.innerHTML = filtrados.length
    ? filtrados.map((jogador) => {
        const status = statusJogador(jogador);
        const clube = jogador.clubeAtualNome || jogador.clube;
        return `
          <tr>
            <td><div class="admin-entidade"><strong>${escaparHtml(texto(jogador.nickname, "Jogador"))}</strong><small>${escaparHtml(texto(jogador.email, jogador.id))}</small></div></td>
            <td>${escaparHtml(rotuloPosicao(jogador.posicao))}</td>
            <td>${escaparHtml(rotuloPlataforma(jogador.plataforma))}</td>
            <td>${escaparHtml(texto(clube, "Sem clube"))}</td>
            <td><span class="admin-badge ${status.classe}">${escaparHtml(status.texto)}</span></td>
            <td><a class="admin-btn-link" href="./meu-perfil.html?uid=${encodeURIComponent(jogador.id)}">Ver perfil</a></td>
          </tr>`;
      }).join("")
    : '<tr><td class="admin-vazio" colspan="6">Nenhum usuário encontrado.</td></tr>';
}

function obterJogador(uid) {
  return estado.dados.jogadores.find((jogador) => jogador.id === uid);
}

function renderizarClubes() {
  const corpo = porId("admin-lista-clubes");
  if (!corpo) return;
  const busca = normalizar(porId("admin-busca-clubes")?.value);
  const filtrados = estado.dados.clubes.filter((clube) => {
    const capitao = obterJogador(clube.capitaoUid || clube.id);
    return !busca || normalizar([
      clube.nome,
      clube.regiao,
      clube.plataforma,
      clube.estiloJogo,
      clube.capitaoIdEA,
      capitao?.nickname,
    ].filter(Boolean).join(" ")).includes(busca);
  });

  const contagem = porId("admin-contagem-clubes");
  if (contagem) contagem.textContent = `${filtrados.length} de ${estado.dados.clubes.length}`;

  corpo.innerHTML = filtrados.length
    ? filtrados.map((clube) => {
        const uidCapitao = clube.capitaoUid || clube.id;
        const capitao = obterJogador(uidCapitao);
        return `
          <tr>
            <td><div class="admin-entidade"><strong>${escaparHtml(texto(clube.nome, "Clube sem nome"))}</strong><small>${escaparHtml(texto(clube.divisao, "Divisão não informada"))}</small></div></td>
            <td>${escaparHtml(texto(capitao?.nickname || clube.capitaoNome || clube.capitaoIdEA, "Não informado"))}</td>
            <td>${escaparHtml(rotuloPlataforma(clube.plataforma))}</td>
            <td>${escaparHtml(texto(clube.regiao))}</td>
            <td>${escaparHtml(texto(clube.estiloJogo))}</td>
            <td><a class="admin-btn-link" href="./clubes.html?uid=${encodeURIComponent(uidCapitao)}">Ver clube</a></td>
          </tr>`;
      }).join("")
    : '<tr><td class="admin-vazio" colspan="6">Nenhum clube encontrado.</td></tr>';
}

function botoesModeracaoVaga(vaga, denunciaId = "") {
  if (!estado.podeModerar) return "";
  return `
    <button type="button" class="admin-btn-perigo" data-admin-acao="remover-vaga"
      data-vaga-id="${escaparHtml(vaga.id)}" data-clube="${escaparHtml(texto(vaga.clube, "este clube"))}"
      ${denunciaId ? `data-denuncia-id="${escaparHtml(denunciaId)}"` : ""}>Remover vaga</button>`;
}

function renderizarVagas() {
  const lista = porId("admin-lista-vagas");
  if (!lista) return;
  const busca = normalizar(porId("admin-busca-vagas")?.value);
  const filtradas = estado.dados.vagas.filter((vaga) => !busca || normalizar([
    vaga.clube,
    vaga.capitaoNome,
    vaga.descricao,
    vaga.plataforma,
    vaga.posicao,
    vaga.jogo,
  ].filter(Boolean).join(" ")).includes(busca));

  const contagem = porId("admin-contagem-vagas");
  if (contagem) contagem.textContent = `${filtradas.length} de ${estado.dados.vagas.length}`;

  lista.innerHTML = filtradas.length
    ? filtradas.map((vaga) => `
        <article class="admin-registro">
          <div class="admin-registro-topo">
            <h3>${escaparHtml(texto(vaga.clube, "Clube sem nome"))}</h3>
            <span class="admin-badge verde">Publicada</span>
          </div>
          <div class="admin-registro-meta">
            <span class="admin-badge">${escaparHtml(rotuloPosicao(vaga.posicao))}</span>
            <span class="admin-badge">${escaparHtml(rotuloPlataforma(vaga.plataforma))}</span>
            <span class="admin-badge">${escaparHtml(texto(vaga.jogo, "Jogo não informado"))}</span>
          </div>
          <p>${escaparHtml(texto(vaga.descricao, "Sem descrição."))}</p>
          <div class="admin-registro-meta">
            <span>Capitão: ${escaparHtml(texto(vaga.capitaoNome))}</span>
            <span>• ${escaparHtml(formatarData(vaga.criadoEm))}</span>
          </div>
          <div class="admin-registro-acoes">
            <a class="admin-btn-link" href="./mercado.html?vaga=${encodeURIComponent(vaga.id)}">Abrir anúncio</a>
            ${botoesModeracaoVaga(vaga)}
          </div>
        </article>`).join("")
    : '<div class="admin-vazio">Nenhuma vaga encontrada.</div>';
}

function rotuloStatusDenuncia(denuncia) {
  const status = statusDenuncia(denuncia);
  if (status === "analisada") return { texto: "Analisada", classe: "verde" };
  if (status === "resolvida") return { texto: "Resolvida", classe: "verde" };
  return { texto: "Aguardando análise", classe: "amarelo" };
}

function renderizarDenuncias() {
  const lista = porId("admin-lista-denuncias");
  if (!lista) return;
  const filtro = porId("admin-filtro-denuncias")?.value || "pendentes";
  const filtradas = estado.dados.denuncias.filter((denuncia) => {
    if (filtro === "pendentes") return estaPendente(denuncia);
    if (filtro === "analisadas") return !estaPendente(denuncia);
    return true;
  });

  const contagem = porId("admin-contagem-denuncias");
  if (contagem) contagem.textContent = `${filtradas.length} de ${estado.dados.denuncias.length}`;

  lista.innerHTML = filtradas.length
    ? filtradas.map((denuncia) => {
        const status = rotuloStatusDenuncia(denuncia);
        const vaga = estado.dados.vagas.find((item) => item.id === denuncia.vagaId);
        const denunciante = obterJogador(denuncia.denuncianteUid);
        return `
          <article class="admin-registro">
            <div class="admin-registro-topo">
              <h3>${escaparHtml(texto(denuncia.clube, "Vaga denunciada"))}</h3>
              <span class="admin-badge ${status.classe}">${status.texto}</span>
            </div>
            <div class="admin-registro-meta">
              <span class="admin-badge">Denúncia de ${escaparHtml(texto(denunciante?.nickname, "usuário da comunidade"))}</span>
              <span class="admin-badge">${escaparHtml(formatarData(denuncia.criadoEm))}</span>
            </div>
            <p>Conteúdo denunciado para revisão da equipe administrativa.</p>
            <div class="admin-registro-acoes">
              ${denuncia.vagaId ? `<a class="admin-btn-link" href="./mercado.html?vaga=${encodeURIComponent(denuncia.vagaId)}">Abrir anúncio</a>` : ""}
              ${estado.podeModerar && estaPendente(denuncia) ? `
                <button type="button" class="admin-btn-secundario" data-admin-acao="analisar-denuncia"
                  data-denuncia-id="${escaparHtml(denuncia.id)}">Marcar como analisada</button>` : ""}
              ${vaga ? botoesModeracaoVaga(vaga, denuncia.id) : ""}
            </div>
          </article>`;
      }).join("")
    : '<div class="admin-vazio">Nenhuma denúncia neste filtro.</div>';
}

function rotuloAcao(acao) {
  const rotulos = {
    denuncia_analisada: "Denúncia marcada como analisada",
    vaga_removida: "Vaga removida pela moderação",
  };
  return rotulos[acao] || texto(acao, "Ação administrativa").replaceAll("_", " ");
}

function renderizarAtividade() {
  const lista = porId("admin-lista-atividade");
  if (!lista) return;
  const logs = estado.dados.logs.slice(0, 50);
  lista.innerHTML = logs.length
    ? logs.map((log) => `
        <article class="admin-timeline-item">
          <span class="admin-timeline-ponto" aria-hidden="true"></span>
          <div class="admin-timeline-conteudo">
            <strong>${escaparHtml(rotuloAcao(log.acao))}</strong>
            <span>${escaparHtml(texto(log.detalhes, `${texto(log.alvoTipo, "item")} ${texto(log.alvoId, "")}`))} • por ${escaparHtml(texto(log.adminNome || log.adminEmail, "administrador"))}</span>
          </div>
          <time>${escaparHtml(formatarData(log.criadoEm))}</time>
        </article>`).join("")
    : '<div class="admin-vazio">Nenhuma ação administrativa registrada ainda.</div>';
}

function renderizarTudo() {
  renderizarMetricas();
  renderizarResumos();
  renderizarUsuarios();
  renderizarClubes();
  renderizarVagas();
  renderizarDenuncias();
  renderizarAtividade();
}

function abrirPainel(nome) {
  document.querySelectorAll(".admin-painel").forEach((painel) => {
    const ativo = painel.id === `admin-painel-${nome}`;
    painel.hidden = !ativo;
    painel.classList.toggle("ativo", ativo);
  });

  document.querySelectorAll("[data-admin-painel]").forEach((botao) => {
    const ativo = botao.dataset.adminPainel === nome;
    botao.classList.toggle("ativo", ativo);
    if (ativo) botao.setAttribute("aria-current", "page");
    else botao.removeAttribute("aria-current");
  });
}

async function registrarLog(acao, alvoTipo, alvoId, detalhes) {
  const dados = {
    acao,
    alvoTipo,
    alvoId,
    detalhes,
    adminUid: estado.usuario.uid,
    adminEmail: estado.usuario.email || "",
    adminNome: estado.config.nome || estado.usuario.displayName || "",
    criadoEm: serverTimestamp(),
  };

  try {
    const referencia = await addDoc(collection(db, "logsAdmin"), dados);
    estado.dados.logs.unshift({ ...dados, id: referencia.id, criadoEm: new Date() });
    renderizarAtividade();
  } catch (erro) {
    console.warn("A ação foi concluída, mas o log administrativo não foi salvo:", erro);
    toast("A ação foi concluída, mas o histórico não pôde ser salvo.", "erro");
  }
}

async function marcarDenunciaAnalisada(denunciaId, botao) {
  if (!estado.podeModerar) {
    toast("Sua conta possui somente acesso de leitura.", "erro");
    return;
  }

  botao.disabled = true;
  try {
    await updateDoc(doc(db, "denuncias", denunciaId), {
      status: "analisada",
      analisadaPor: estado.usuario.uid,
      analisadaEm: serverTimestamp(),
    });
    const denuncia = estado.dados.denuncias.find((item) => item.id === denunciaId);
    if (denuncia) {
      denuncia.status = "analisada";
      denuncia.analisadaPor = estado.usuario.uid;
      denuncia.analisadaEm = new Date();
    }
    renderizarTudo();
    await registrarLog(
      "denuncia_analisada",
      "denuncia",
      denunciaId,
      `Denúncia do clube ${texto(denuncia?.clube, "não informado")} analisada`,
    );
    toast("Denúncia marcada como analisada.");
  } catch (erro) {
    console.error("Erro ao analisar denúncia:", erro);
    botao.disabled = false;
    toast("Não foi possível atualizar a denúncia. Confira as permissões.", "erro");
  }
}

async function removerVaga(vagaId, nomeClube, denunciaId, botao) {
  if (!estado.podeModerar) {
    toast("Sua conta possui somente acesso de leitura.", "erro");
    return;
  }

  const confirmado = await confirmModal({
    titulo: "Remover vaga",
    mensagem: `Remover a vaga do clube “${nomeClube}”? Essa ação não pode ser desfeita.`,
    textoConfirmar: "Remover vaga",
    destrutivo: true,
  });
  if (!confirmado) return;

  botao.disabled = true;
  try {
    await deleteDoc(doc(db, "vagas", vagaId));
    estado.dados.vagas = estado.dados.vagas.filter((vaga) => vaga.id !== vagaId);

    if (denunciaId) {
      await updateDoc(doc(db, "denuncias", denunciaId), {
        status: "resolvida",
        resolvidaPor: estado.usuario.uid,
        resolvidaEm: serverTimestamp(),
      });
      const denuncia = estado.dados.denuncias.find((item) => item.id === denunciaId);
      if (denuncia) {
        denuncia.status = "resolvida";
        denuncia.resolvidaPor = estado.usuario.uid;
        denuncia.resolvidaEm = new Date();
      }
    }

    renderizarTudo();
    await registrarLog(
      "vaga_removida",
      "vaga",
      vagaId,
      `Vaga do clube ${nomeClube} removida`,
    );
    toast("Vaga removida com sucesso.");
  } catch (erro) {
    console.error("Erro ao remover vaga:", erro);
    if (botao.isConnected) botao.disabled = false;
    toast("Não foi possível remover a vaga. Confira as permissões do Firestore.", "erro");
  }
}

function configurarEventos() {
  document.querySelectorAll("[data-admin-painel]").forEach((botao) => {
    botao.addEventListener("click", () => abrirPainel(botao.dataset.adminPainel));
  });

  document.querySelectorAll("[data-abrir-painel]").forEach((botao) => {
    botao.addEventListener("click", () => abrirPainel(botao.dataset.abrirPainel));
  });

  porId("admin-busca-usuarios")?.addEventListener("input", renderizarUsuarios);
  porId("admin-filtro-usuarios")?.addEventListener("change", renderizarUsuarios);
  porId("admin-busca-clubes")?.addEventListener("input", renderizarClubes);
  porId("admin-busca-vagas")?.addEventListener("input", renderizarVagas);
  porId("admin-filtro-denuncias")?.addEventListener("change", renderizarDenuncias);
  porId("admin-atualizar")?.addEventListener("click", carregarDados);

  document.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-admin-acao]");
    if (!(botao instanceof HTMLButtonElement)) return;

    if (botao.dataset.adminAcao === "analisar-denuncia") {
      marcarDenunciaAnalisada(botao.dataset.denunciaId, botao);
    }

    if (botao.dataset.adminAcao === "remover-vaga") {
      removerVaga(
        botao.dataset.vagaId,
        botao.dataset.clube || "este clube",
        botao.dataset.denunciaId || "",
        botao,
      );
    }
  });
}

configurarEventos();

onAuthStateChanged(auth, async (usuario) => {
  estado.carregamento += 1;
  estado.usuario = null;
  estado.config = {};
  estado.podeModerar = false;
  porId("admin-app").hidden = true;

  if (!usuario) {
    mostrarAcesso(
      "Entre para continuar",
      "O painel administrativo está disponível somente para contas autorizadas.",
      true,
    );
    return;
  }

  mostrarCarregamentoAcesso();
  try {
    const adminSnap = await getDoc(doc(db, "admins", usuario.uid));
    if (auth.currentUser?.uid !== usuario.uid) return;

    if (!adminSnap.exists() || adminSnap.data().ativo !== true) {
      mostrarAcesso(
        "Acesso não autorizado",
        "Sua conta está conectada, mas não possui permissão para abrir esta área.",
      );
      return;
    }

    estado.usuario = usuario;
    estado.config = adminSnap.data();
    estado.podeModerar = estado.config.permissoes?.moderarConteudo === true;

    porId("admin-estado-acesso").hidden = true;
    porId("admin-app").hidden = false;
    porId("admin-aviso-permissao").hidden = estado.podeModerar;
    porId("admin-nome").textContent = estado.config.nome
      || usuario.displayName
      || usuario.email
      || "Administrador";

    await carregarDados();
  } catch (erro) {
    console.error("Erro ao validar acesso administrativo:", erro);
    mostrarAcesso(
      "Não foi possível validar o acesso",
      "Confira sua conexão e as regras da coleção de administradores no Firebase.",
    );
  }
});

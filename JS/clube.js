// =========================================================================
// MERCADO PRO CLUBS — clube.js
// Liga a lógica de dados (Firestore) ao layout de clubes.html / clube.css
// Elenco: NÃO é uma lista salva dentro do clube. Cada jogador guarda em
// jogadores/{uid}.clubeAtualId o capitaoUid do clube em que está — o elenco
// é sempre uma CONSULTA (where clubeAtualId == capitaoUid).
// =========================================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp,
  collection, query, where, getDocs, onSnapshot, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { confirmModal } from "./confirm-modal.js";

function toast(msg, tipo = "sucesso") {
  document.getElementById("toast-clube")?.remove();
  const el = Object.assign(document.createElement("div"), { id: "toast-clube", textContent: msg });
  Object.assign(el.style, {
    position: "fixed", bottom: "24px", right: "24px",
    background: tipo === "sucesso" ? "#22C55E" : "#d32f2f",
    color: tipo === "sucesso" ? "#0a0a0a" : "#fff",
    fontWeight: "bold", padding: "14px 22px", borderRadius: "8px",
    fontFamily: "inherit", fontSize: "0.9rem",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: "9999",
    opacity: "0", transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = "1"));
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3000);
}

function comprimirImagem(arquivo, maxLargura = 500, qualidade = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const escala = Math.min(1, maxLargura / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.max(1, Math.round(img.width  * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Não foi possível processar a imagem.")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(arquivo);
  });
}

async function buscarElenco(capitaoUid) {
  const [snap, capitaoSnap] = await Promise.all([
    getDocs(query(collection(db, "jogadores"), where("clubeAtualId", "==", capitaoUid))),
    getDoc(doc(db, "jogadores", capitaoUid)),
  ]);
  const jogadores = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  if (capitaoSnap.exists() && !jogadores.some(j => j.uid === capitaoUid)) {
    jogadores.unshift({ uid: capitaoSnap.id, ...capitaoSnap.data() });
  }
  return jogadores;
}

// =========================================================================
// ELENCO — tabela real (sem dados fake), busca de jogadores livres e convites
// =========================================================================
let elencoAtual = [];

function linhaElenco(jogador, capitaoUid, podeEditar) {
  const ehCapitaoLinha = jogador.uid === capitaoUid;
  const avatar = imagemSegura(jogador.fotoURL, "../IMG/user-icon.svg");
  const posicao = (jogador.posicao || "—").toString();
  return `
    <tr data-uid="${escHtml(jogador.uid)}">
      <td class="col-jogador">
        <a href="./meu-perfil.html?uid=${encodeURIComponent(jogador.uid)}" class="col-jogador-link" title="Ver perfil">
          <img src="${escHtml(avatar)}" alt="" class="jogador-avatar">
          <div class="jogador-info">
            <span class="jogador-nome">${escHtml(jogador.nickname || "Jogador")}${ehCapitaoLinha ? ' <span class="tag-capitao">Capitão</span>' : ""}</span>
            ${jogador.eaId ? `<span class="jogador-idea">ID EA: ${escHtml(jogador.eaId)}</span>` : ""}
          </div>
        </a>
      </td>
      <td><span class="tag-posicao">${escHtml(posicao === "—" ? posicao : posicao.toUpperCase())}</span></td>
      <td class="col-ger">${escHtml(jogador.overall ?? "—")}</td>
      <td class="col-acoes">
        ${podeEditar && !ehCapitaoLinha
          ? `<button type="button" class="btn-remover-jogador" data-uid="${escHtml(jogador.uid)}" data-nome="${escHtml(jogador.nickname || "jogador")}">Remover</button>`
          : `<span class="acao-vazia">—</span>`}
      </td>
    </tr>`;
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function aplicarFiltrosElenco(capitaoUid, podeEditar) {
  const termo = (document.getElementById("elenco-busca")?.value || "").toLowerCase().trim();
  const posFiltro = document.getElementById("elenco-filtro-posicao")?.value || "todas";

  const filtrado = elencoAtual.filter(j => {
    const bateNome = !termo || (j.nickname || "").toLowerCase().includes(termo);
    const batePos = posFiltro === "todas" || (j.posicao || "").toLowerCase() === posFiltro;
    return bateNome && batePos;
  });

  const tbody = document.getElementById("elenco-tbody");
  const mostrando = document.getElementById("elenco-mostrando");
  if (!tbody) return;

  if (!elencoAtual.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="elenco-vazio">Esse elenco ainda não tem jogadores.${podeEditar ? ' Clique em "Convidar Jogador" pra começar.' : ""}</td></tr>`;
    if (mostrando) mostrando.textContent = "Mostrando 0 jogadores";
    return;
  }
  if (!filtrado.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="elenco-vazio">Nenhum jogador encontrado com esse filtro.</td></tr>`;
    if (mostrando) mostrando.textContent = `Mostrando 0 de ${elencoAtual.length} jogadores`;
    return;
  }

  tbody.innerHTML = filtrado.map(j => linhaElenco(j, capitaoUid, podeEditar)).join("");
  if (mostrando) {
    mostrando.textContent = filtrado.length === elencoAtual.length
      ? `Mostrando ${elencoAtual.length} jogador${elencoAtual.length === 1 ? "" : "es"}`
      : `Mostrando ${filtrado.length} de ${elencoAtual.length} jogadores`;
  }

  if (podeEditar) {
    tbody.querySelectorAll(".btn-remover-jogador").forEach(btn =>
      btn.addEventListener("click", () => removerJogador(btn.dataset.uid, btn.dataset.nome, capitaoUid, podeEditar))
    );
  }
}

async function renderizarElenco(capitaoUid, podeEditar) {
  const tbody = document.getElementById("elenco-tbody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="elenco-vazio">Carregando elenco...</td></tr>`;
  try {
    elencoAtual = await buscarElenco(capitaoUid);
    aplicarFiltrosElenco(capitaoUid, podeEditar);
  } catch (err) {
    console.error("Erro ao carregar elenco:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="elenco-vazio" style="color:#d32f2f">Não foi possível carregar o elenco.</td></tr>`;
  }

  const busca = document.getElementById("elenco-busca");
  const filtro = document.getElementById("elenco-filtro-posicao");
  if (busca && !busca.dataset.listenerElenco) {
    busca.dataset.listenerElenco = "true";
    busca.addEventListener("input", () => aplicarFiltrosElenco(capitaoUid, podeEditar));
  }
  if (filtro && !filtro.dataset.listenerElenco) {
    filtro.dataset.listenerElenco = "true";
    filtro.addEventListener("change", () => aplicarFiltrosElenco(capitaoUid, podeEditar));
  }
}

async function removerJogador(jogadorUid, nome, capitaoUid, podeEditar) {
  const ok = await confirmModal({
    titulo: "Remover do elenco",
    mensagem: `Tem certeza que quer remover ${nome} do elenco?`,
    textoConfirmar: "Remover",
    destrutivo: true,
  });
  if (!ok) return;
  try {
    // OBS: as regras do Firestore normalmente só deixam cada jogador escrever
    // no próprio documento. Se o capitão não tiver permissão especial, essa
    // escrita vai falhar — nesse caso, a saída precisa partir do jogador
    // (o botão "Sair do clube" que ele já tem no próprio painel).
    await updateDoc(doc(db, "jogadores", jogadorUid), { clubeAtualId: null, clubeAtualNome: null });
    toast(`${nome} foi removido do elenco.`);
    renderizarElenco(capitaoUid, podeEditar);
  } catch (err) {
    toast("Não foi possível remover diretamente (permissão do Firestore). Peça pro jogador sair pelo próprio painel.", "erro");
  }
}

// ─── Buscar jogadores livres (sem clube) pra convidar ──────────────────────────
async function buscarJogadoresLivres(termo) {
  const inicio = termo.trim();
  if (!inicio) return [];
  const fim = inicio + "\uf8ff";
  const snap = await getDocs(query(
    collection(db, "jogadores"),
    where("nickname", ">=", inicio),
    where("nickname", "<=", fim),
    limit(10)
  ));
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(j => !j.clubeAtualId && j.uid !== auth.currentUser?.uid);
}

async function enviarConvite(capitaoUid, nomeClube, jogador) {
  const existeSnap = await getDocs(query(
    collection(db, "convitesClube"),
    where("capitaoUid", "==", capitaoUid),
    where("jogadorUid", "==", jogador.uid),
    where("status", "==", "pendente")
  ));
  if (!existeSnap.empty) { toast("Você já convidou esse jogador.", "erro"); return; }

  await addDoc(collection(db, "convitesClube"), {
    capitaoUid,
    clube: nomeClube || "seu clube",
    jogadorUid: jogador.uid,
    jogadorNome: jogador.nickname || "Jogador",
    status: "pendente",
    criadoEm: serverTimestamp(),
  });
  toast(`Convite enviado para ${jogador.nickname || "jogador"}!`);
}

function abrirModalConvidar(capitaoUid, nomeClube) {
  document.getElementById("modal-convidar")?.remove();

  const modal = document.createElement("div");
  modal.id = "modal-convidar";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-convidar-box">
      <div class="modal-convidar-cabecalho">
        <h3>Convidar Jogador</h3>
        <button type="button" class="modal-fechar" aria-label="fechar">&times;</button>
      </div>
      <input type="text" id="modal-busca-jogador" class="modal-busca-input" placeholder="Buscar por nickname..." autocomplete="off" />
      <div id="modal-resultados" class="modal-resultados">
        <p class="modal-dica">Digite pelo menos 2 letras pra buscar.</p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const fechar = () => modal.remove();
  modal.querySelector(".modal-fechar").addEventListener("click", fechar);
  modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });

  const input = document.getElementById("modal-busca-jogador");
  const resultadosEl = document.getElementById("modal-resultados");
  let timeoutBusca;

  input.addEventListener("input", () => {
    clearTimeout(timeoutBusca);
    const termo = input.value.trim();
    if (termo.length < 2) {
      resultadosEl.innerHTML = `<p class="modal-dica">Digite pelo menos 2 letras pra buscar.</p>`;
      return;
    }
    resultadosEl.innerHTML = `<p class="modal-dica">Buscando...</p>`;
    timeoutBusca = setTimeout(async () => {
      try {
        const jogadores = await buscarJogadoresLivres(termo);
        if (!jogadores.length) {
          resultadosEl.innerHTML = `<p class="modal-dica">Nenhum jogador livre encontrado.</p>`;
          return;
        }
        resultadosEl.innerHTML = jogadores.map(j => `
          <div class="modal-resultado-item">
            <img src="${escHtml(imagemSegura(j.fotoURL, '../IMG/user-icon.svg'))}" class="modal-resultado-avatar" alt="">
            <div class="modal-resultado-info">
              <span class="modal-resultado-nome">${escHtml(j.nickname || "Jogador")}</span>
              <span class="modal-resultado-detalhe">${escHtml(j.posicao || "—")} · OVR ${escHtml(j.overall ?? "—")}</span>
            </div>
            <button type="button" class="btn-convidar-resultado" data-uid="${j.uid}">Convidar</button>
          </div>`).join("");

        resultadosEl.querySelectorAll(".btn-convidar-resultado").forEach(btn => {
          btn.addEventListener("click", async () => {
            const jogador = jogadores.find(j => j.uid === btn.dataset.uid);
            btn.disabled = true;
            btn.textContent = "Enviando...";
            try {
              await enviarConvite(capitaoUid, nomeClube, jogador);
              btn.textContent = "Convidado ✓";
            } catch (err) {
              toast("Erro ao convidar: " + err.message, "erro");
              btn.disabled = false;
              btn.textContent = "Convidar";
            }
          });
        });
      } catch (err) {
        console.error("Erro ao buscar jogadores:", err);
        resultadosEl.innerHTML = `<p class="modal-dica" style="color:#d32f2f">Não foi possível buscar jogadores.</p>`;
      }
    }, 350);
  });

  input.focus();
}

// ─── Convites pendentes pro jogador (aceitar entra pro elenco) ────────────────
function escutarConvitesPendentes(uid) {
  const q = query(collection(db, "convitesClube"), where("jogadorUid", "==", uid), where("status", "==", "pendente"));
  onSnapshot(q, snap => {
    snap.docChanges().forEach(change => {
      if (change.type === "added") mostrarBannerConvite(change.doc.id, change.doc.data());
    });
  }, err => console.error("Erro ao acompanhar convites:", err));
}

function mostrarBannerConvite(conviteId, convite) {
  if (document.getElementById(`convite-${conviteId}`)) return;
  const banner = document.createElement("div");
  banner.id = `convite-${conviteId}`;
  banner.className = "banner-convite";
  banner.innerHTML = `
    <span>📩 <strong>${escHtml(convite.clube || "Um clube")}</strong> te convidou pro elenco!</span>
    <div class="banner-convite-acoes">
      <button type="button" class="btn-aceitar-convite">Aceitar</button>
      <button type="button" class="btn-recusar-convite">Recusar</button>
    </div>`;
  document.body.prepend(banner);

  banner.querySelector(".btn-aceitar-convite").addEventListener("click", async () => {
    try {
      const usuario = auth.currentUser;
      if (!usuario) throw new Error("Faça login novamente para aceitar o convite.");
      await setDoc(doc(db, "jogadores", usuario.uid), {
        clubeAtualId: convite.capitaoUid,
        clubeAtualNome: convite.clube,
        procurandoClube: false,
        agenteLivre: false,
      }, { merge: true });
      const chatId = `convite-clube-${conviteId}`;
      const mensagemInicial = `Convite aceito! Agora faço parte do ${convite.clube || "clube"}.`;
      await setDoc(doc(db, "chats", chatId), {
        clube: convite.clube || "Clube",
        participantes: [convite.capitaoUid, usuario.uid],
        tipo: "convite-clube",
        criadoEm: serverTimestamp(),
        ultimaMensagemTexto: mensagemInicial,
        ultimaMensagemAutorUid: usuario.uid,
        ultimaMensagemEm: serverTimestamp(),
        lidoPor: [usuario.uid],
        arquivadoPor: [],
      }, { merge: true });
      try {
        await addDoc(collection(db, "chats", chatId, "mensagens"), {
          texto: mensagemInicial,
          autorUid: usuario.uid,
          autorNome: usuario.displayName || convite.jogadorNome || "Jogador",
          enviadoEm: serverTimestamp(),
        });
      } catch (mensagemErr) {
        console.warn("Convite aceito, mas a mensagem inicial não foi criada:", mensagemErr);
      }
      await updateDoc(doc(db, "convitesClube", conviteId), {
        status: "aceito",
        chatId,
        respondidoEm: serverTimestamp(),
      });
      toast("Bem-vindo ao clube! A conversa foi criada. 🎉");
      banner.remove();
      setTimeout(() => location.reload(), 800);
    } catch (err) { toast("Erro ao aceitar convite: " + err.message, "erro"); }
  });
  banner.querySelector(".btn-recusar-convite").addEventListener("click", async () => {
    try {
      await updateDoc(doc(db, "convitesClube", conviteId), { status: "recusado" });
      banner.remove();
    } catch (err) { toast("Erro ao recusar: " + err.message, "erro"); }
  });
}

// ─── Preenche o dashboard do capitão com os dados salvos ──────────────────────
function preencherFormulario(clube, perfilAtual) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };

  set("clube", clube.nome);
  set("plataforma", clube.plataforma);
  set("divisao", clube.divisao);
  set("regiao", clube.regiao);
  set("jogo", clube.jogo);
  set("estilo-jogo", clube.estiloJogo);
  set("horario-treino", clube.horarioTreino);
  set("objetivo", clube.objetivo || "casual");
  set("descricao", clube.descricao);
  set("discord", clube.discord);
  set("whatsapp", clube.whatsapp);
  set("instagram", clube.instagram);
  set("capitao-nome", perfilAtual.nickname);
  set("capitao-idea", clube.capitaoIdEA || perfilAtual.eaId);
  set("capitao-microfone", clube.capitaoMicrofone || "sim");

  const escudo = imagemSegura(clube.escudoUrl);
  if (escudo) {
    document.getElementById("foto-perfil-preview").src = escudo;
    document.getElementById("preview-escudo").src = escudo;
  }

  document.querySelectorAll(".chip[data-dia]").forEach(chip => chip.classList.remove("active"));
  (Array.isArray(clube.diasTreino) ? clube.diasTreino : []).forEach(dia => {
    Array.from(document.querySelectorAll(".chip[data-dia]"))
      .find(chip => chip.dataset.dia === String(dia))
      ?.classList.add("active");
  });

  const necessidades = clube.necessidades || {};
  document.querySelectorAll("[data-pos-check]").forEach(chk => {
    const marcado = !!necessidades[chk.dataset.posCheck];
    chk.checked = marcado;
    chk.closest(".necessidade-item")?.classList.toggle("marcado", marcado);
  });

  atualizarPreview();
}

function atualizarPreview() {
  const texto = (id, fallback = "—") => document.getElementById(id)?.value || fallback;
  const textoSelect = (id, fallback = "—") => {
    const el = document.getElementById(id);
    return el?.value ? el.options[el.selectedIndex].text : fallback;
  };
  document.getElementById("preview-nome").textContent = texto("clube", "Seu Clube");
  document.getElementById("preview-objetivo").textContent = textoSelect("objetivo");
  document.getElementById("preview-jogo").textContent = textoSelect("jogo");
  document.getElementById("preview-plataforma").textContent = textoSelect("plataforma");
  document.getElementById("preview-divisao").textContent = texto("divisao");
  document.getElementById("preview-treinos").textContent = texto("horario-treino");
}

// ─── Liga os eventos do dashboard (upload, chips, checkboxes, preview, salvar) ─
function ligarEventosDashboard(uid) {
  // Preview ao vivo
  ["clube","divisao","horario-treino","objetivo","jogo","plataforma"].forEach(id =>
    document.getElementById(id)?.addEventListener("input", atualizarPreview)
  );
  document.querySelectorAll("select").forEach(sel => sel.addEventListener("change", atualizarPreview));

  // Upload de escudo: botão abre o input de arquivo escondido
  document.getElementById("btn-upload-escudo")?.addEventListener("click", () =>
    document.getElementById("upload-escudo").click()
  );
  document.getElementById("upload-escudo")?.addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      toast("Selecione um arquivo de imagem válido.", "erro");
      e.target.value = "";
      return;
    }
    if (arquivo.size > 2 * 1024 * 1024) {
      toast("⚠️ Imagem muito grande. Use até 2MB.", "erro");
      e.target.value = "";
      return;
    }
    try {
      const comprimida = await comprimirImagem(arquivo);
      if (comprimida.length > 850_000) throw new Error("A imagem ainda ficou muito grande.");
      document.getElementById("foto-perfil-preview").src = comprimida;
      document.getElementById("preview-escudo").src = comprimida;
      document.getElementById("upload-escudo").dataset.novaImagem = comprimida;
    } catch { toast("Erro ao processar imagem.", "erro"); }
    finally { e.target.value = ""; }
  });

  // Chips de dias da semana
  document.querySelectorAll(".chip").forEach(chip =>
    chip.addEventListener("click", () => chip.classList.toggle("active"))
  );

  // Necessidades (checkbox)
  document.querySelectorAll("[data-pos-check]").forEach(chk =>
    chk.addEventListener("change", () =>
      chk.closest(".necessidade-item")?.classList.toggle("marcado", chk.checked)
    )
  );

  // Elenco: dados reais (sem jogador fake) + botão de convidar
  renderizarElenco(uid, true);
  document.getElementById("btn-convidar-jogador")?.addEventListener("click", () => {
    const nomeClube = document.getElementById("clube")?.value.trim() || "seu clube";
    abrirModalConvidar(uid, nomeClube);
  });

  // Salvar
  document.getElementById("btn-salvar-clube")?.addEventListener("click", async () => {
    const nome = document.getElementById("clube").value.trim();
    if (!nome) { toast("O nome do clube não pode ficar vazio.", "erro"); return; }

    const diasTreino = Array.from(document.querySelectorAll(".chip.active")).map(c => c.dataset.dia);
    const necessidades = {};
    document.querySelectorAll("[data-pos-check]").forEach(chk => necessidades[chk.dataset.posCheck] = chk.checked);

    const dados = {
      nome,
      capitaoUid:       uid,
      plataforma:       document.getElementById("plataforma").value,
      divisao:          document.getElementById("divisao").value.trim(),
      regiao:           document.getElementById("regiao").value,
      jogo:             document.getElementById("jogo").value,
      estiloJogo:       document.getElementById("estilo-jogo").value.trim(),
      horarioTreino:    document.getElementById("horario-treino").value,
      diasTreino,
      objetivo:         document.getElementById("objetivo").value,
      descricao:        document.getElementById("descricao").value.trim(),
      discord:          document.getElementById("discord").value.trim(),
      whatsapp:         document.getElementById("whatsapp").value.trim(),
      instagram:        document.getElementById("instagram").value.trim(),
      capitaoIdEA:      document.getElementById("capitao-idea").value.trim(),
      capitaoMicrofone: document.getElementById("capitao-microfone").value,
      necessidades,
    };
    const novaImagem = document.getElementById("upload-escudo").dataset.novaImagem;
    if (novaImagem) dados.escudoUrl = novaImagem;

    try {
      await setDoc(doc(db, "clubes", uid), dados, { merge: true });
      await setDoc(doc(db, "jogadores", uid), {
        ehCapitao: true,
        clube: nome,
        clubeAtualId: uid,
        clubeAtualNome: nome,
      }, { merge: true });
      toast("✅ Clube atualizado!");
    } catch (err) { toast("Erro ao salvar: " + err.message, "erro"); }
  });
}

async function carregarEstatisticas(uid) {
  try {
    const elenco = await buscarElenco(uid);
    const vagasSnap = await getDocs(query(collection(db, "vagas"), where("capitaoUid", "==", uid)));
    document.getElementById("stat-jogadores").textContent = elenco.length;
    document.getElementById("stat-vagas").textContent = vagasSnap.size;
  } catch { /* silencioso */ }
}

// ─── Visão de quem não é capitão (jogador de time, ou sem clube) ───────────────
function itemElencoSimples(jogador, capitaoUid) {
  const ehCapitao = jogador.uid === capitaoUid;
  return `
    <div class="rede-item" style="justify-content:space-between">
      <span style="color:#fff">${escHtml(jogador.nickname || "Jogador")}${ehCapitao ? " 👑" : ""}</span>
      <span style="color:#8b8b8b;font-size:12px">${escHtml(jogador.posicao || "—")} · OVR ${escHtml(jogador.overall || "—")}</span>
    </div>`;
}

async function renderPainelJogador(perfilAtual) {
  const capitaoUid = perfilAtual.clubeAtualId;
  const elenco = await buscarElenco(capitaoUid);
  document.getElementById("dashboard-clube").outerHTML = `
    <div class="card" style="max-width:640px;margin:0 auto 16px">
      <h3 style="color:#22C55E">Você joga no ${escHtml(perfilAtual.clubeAtualNome || "seu clube")}</h3>
      <p style="color:#8b8b8b">Esse é o elenco atual do time.</p>
      <button type="button" id="btn-sair-clube" class="btn-salvar-clube" style="background:transparent;border:1px solid #d32f2f;color:#d32f2f;margin:10px 0 0">Sair do clube</button>
    </div>
    <div class="card" style="max-width:640px;margin:0 auto">
      <h3>Elenco (${elenco.length} jogador${elenco.length === 1 ? '' : 'es'})</h3>
      ${elenco.map(j => itemElencoSimples(j, capitaoUid)).join("")}
    </div>`;
  const btnConvidar = document.getElementById("btn-convidar-jogador");
  if (btnConvidar) btnConvidar.hidden = true;
  await renderizarElenco(capitaoUid, false);
  document.getElementById("btn-sair-clube").addEventListener("click", async () => {
    const ok = await confirmModal({
      titulo: "Sair do clube",
      mensagem: "Tem certeza que quer sair do clube? Você pode ser convidado de novo depois.",
      textoConfirmar: "Sair",
      destrutivo: true,
    });
    if (!ok) return;
    try {
      const usuario = auth.currentUser;
      if (!usuario) throw new Error("Faça login novamente para sair do clube.");
      await updateDoc(doc(db, "jogadores", usuario.uid), { clubeAtualId: null, clubeAtualNome: null });
      toast("Você saiu do clube.");
      setTimeout(() => location.reload(), 800);
    } catch (err) { toast("Erro ao sair: " + err.message, "erro"); }
  });
}

function renderCTASemClube() {
  document.getElementById("dashboard-clube").outerHTML = `
    <div class="card" style="max-width:520px;margin:60px auto;text-align:center">
      <p style="color:#fff">⚽ Você ainda não faz parte de nenhum clube.</p>
      <p style="color:#8b8b8b;font-size:13px">Publique uma vaga como capitão ou candidate-se a um time no mercado.</p>
      <a href="../HTML/mercado.html" class="btn-salvar-clube" style="display:inline-block;text-decoration:none;margin-top:14px">Ir para o mercado</a>
    </div>`;
  const btnConvidar = document.getElementById("btn-convidar-jogador");
  if (btnConvidar) btnConvidar.hidden = true;
  elencoAtual = [];
  aplicarFiltrosElenco("", false);
}

// ─── Modo visitante: alguém vendo o clube de outra pessoa (via ?uid=) ──────────
async function carregarModoVisitante(uidClube) {
  document.body.classList.add("modo-visitante");
  try {
    const clubeSnap = await getDoc(doc(db, "clubes", uidClube));
    if (!clubeSnap.exists()) {
      document.getElementById("dashboard-clube").innerHTML =
        `<p style="color:#8b8b8b;text-align:center;grid-column:1/-1;padding:60px 0">Esse clube não foi encontrado ou não existe mais.</p>`;
      return;
    }
    const clube = clubeSnap.data();
    const perfilCapitaoSnap = await getDoc(doc(db, "jogadores", uidClube));
    const perfilCapitao = perfilCapitaoSnap.exists() ? perfilCapitaoSnap.data() : {};

    preencherFormulario(clube, perfilCapitao);
    ativarModoSomenteLeitura(clube);
    await Promise.all([
      carregarEstatisticas(uidClube),
      renderizarElenco(uidClube, false),
    ]);
  } catch (err) {
    console.error("Erro ao carregar clube público:", err);
    const dashboard = document.getElementById("dashboard-clube");
    dashboard.replaceChildren();
    const mensagem = document.createElement("p");
    mensagem.style.cssText = "color:#d32f2f;text-align:center;grid-column:1/-1;padding:60px 0";
    mensagem.textContent = "Não foi possível carregar este clube. Tente novamente.";
    dashboard.appendChild(mensagem);
  }
}

function ativarModoSomenteLeitura(clube) {
  // Trava todos os campos do dashboard
  document.querySelectorAll("#dashboard-clube input, #dashboard-clube textarea, #dashboard-clube select")
    .forEach(el => (el.disabled = true));
  document.querySelectorAll(".chip").forEach(chip => (chip.disabled = true));
  const btnConvidar = document.getElementById("btn-convidar-jogador");
  if (btnConvidar) btnConvidar.hidden = true;

  // Atualiza o cabeçalho: "Meu Clube" vira o nome do clube visitado
  const titulo = document.querySelector(".text-menu h1");
  const subtitulo = document.querySelector(".text-menu p");
  if (titulo) titulo.textContent = clube.nome || "Clube";
  if (subtitulo) subtitulo.textContent = "Perfil público do clube — veja se combina com o seu perfil.";

  // Troca "Editar Perfil" por um contato direto (Discord do clube, se houver)
  const btnEditar = document.querySelector(".btn-editar-perfil");
  if (btnEditar) {
    const discord = String(clube.discord || "").trim();
    const linkContato = /^(?:https:\/\/)?(?:www\.)?discord(?:\.gg|\.com\/invite)\/[A-Za-z0-9_-]+\/?$/i.test(discord)
      ? `https://${discord.replace(/^https?:\/\//i, "")}`
      : null;
    btnEditar.outerHTML = linkContato
      ? `<a href="${linkContato}" target="_blank" rel="noopener" class="btn-editar-perfil btn-contato-clube">
           <svg viewBox="0 0 24 24" class="edit-icon"><path d="M21 11.5a8.5 8.5 0 01-8.5 8.5 8.4 8.4 0 01-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1121 11.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
           Entrar em Contato
         </a>`
      : `<span class="btn-editar-perfil btn-contato-clube" style="opacity:.5;cursor:default">Sem contato cadastrado</span>`;
  }
}

// ─── Troca de abas (Geral / Elenco / Vagas / Estatísticas / Aparência) ─────────
// Não depende de login nem do Firestore — roda assim que o script carrega.
function ligarAbas() {
  const botoes = document.querySelectorAll(".aba-item[data-tab]");
  if (!botoes.length) return;

  botoes.forEach(btn => {
    btn.addEventListener("click", () => {
      const alvo = btn.dataset.tab;

      botoes.forEach(b => b.classList.toggle("ativo", b === btn));

      document.querySelectorAll(".tab-painel[data-painel]").forEach(painel => {
        painel.hidden = painel.dataset.painel !== alvo;
      });
    });
  });
}
ligarAbas();

// Paginação do elenco: só o visual por enquanto (troca qual botão fica "ativa")
document.querySelectorAll(".pagina-num").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pagina-num").forEach(b => b.classList.remove("ativa"));
    btn.classList.add("ativa");
  });
});

// ─── Inicialização ──────────────────────────────────────────────────────────────
const uidVisitante = new URLSearchParams(window.location.search).get("uid");

if (uidVisitante) {
  // Qualquer pessoa pode ver um clube publicado, logada ou não.
  carregarModoVisitante(uidVisitante);
} else {
  onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) { window.location.href = "./cadastrar-se.html"; return; }

    escutarConvitesPendentes(usuario.uid);

    try {
      const perfilSnap = await getDoc(doc(db, "jogadores", usuario.uid));
      const perfilAtual = perfilSnap.exists() ? perfilSnap.data() : {};

      const clubeSnap = await getDoc(doc(db, "clubes", usuario.uid));
      const ehCapitao = clubeSnap.exists() || perfilAtual.ehCapitao;

      if (ehCapitao) {
        const dadosClube = clubeSnap.exists() ? clubeSnap.data() : { nome: perfilAtual.clube || "" };
        preencherFormulario(dadosClube, perfilAtual);
        ligarEventosDashboard(usuario.uid);
        await carregarEstatisticas(usuario.uid);
      } else if (perfilAtual.clubeAtualId) {
        await renderPainelJogador(perfilAtual);
      } else {
        renderCTASemClube();
      }
    } catch (err) {
      console.error("Erro ao carregar clube:", err);
      document.getElementById("dashboard-clube").innerHTML =
        `<p style="color:#d32f2f;text-align:center;grid-column:1/-1">Não foi possível carregar seu clube. Tente novamente.</p>`;
    }
  });
}

function imagemSegura(src, fallback = "") {
  const valor = String(src || "").trim();
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(valor)) return valor;
  if (/^https:\/\//i.test(valor)) return valor;
  if (/^(?:\.\.\/|\.\/|\/)[^"'<>]+$/.test(valor)) return valor;
  return fallback;
}

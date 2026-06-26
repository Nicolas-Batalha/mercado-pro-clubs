// =========================================================================
// MERCADO PRO CLUBS — times.js
// Responsabilidades:
//  1. Publicar vaga de clube no Firestore
//  2. Listar vagas com filtros + cronômetro regressivo de 1h
//  3. Auto-excluir vagas expiradas (1h após criadoEm)
//  4. Capitão pode excluir manualmente sua vaga
//  5. Jogador se candidata ao clube
//  6. Capitão recebe notificação e aceita/recusa
//  7. Se aceito → notificação para jogador + chat criado
// =========================================================================

import { auth, db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, getDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const EXPIRACAO_MS = 60 * 60 * 1000; // 1 hora em ms

// ─── Estado global ────────────────────────────────────────────────────────────
let usuarioAtual = null;
let perfilAtual  = {};
const timersAtivos = {}; // guarda setInterval por vagaId para limpar depois

// ─── Aguarda auth ─────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  usuarioAtual = user;
  if (user) {
    const snap = await getDoc(doc(db, "jogadores", user.uid));
    perfilAtual = snap.exists() ? snap.data() : {};
    escutarNotificacoes(user.uid);
  }
  await carregarVagas();
});

// =========================================================================
// 1. PUBLICAR VAGA
// =========================================================================
const formLfg = document.getElementById("form-lfg");
formLfg?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!usuarioAtual) {
    toast("Você precisa estar logado para publicar uma vaga.", "erro");
    return;
  }

  const clube      = document.getElementById("post-clube").value.trim();
  const plataforma = document.getElementById("post-plataforma").value;
  const posicao    = document.getElementById("post-posicao").value;
  const estilo     = document.getElementById("post-estilo").value;
  const jogo       = document.getElementById("post-jogo").value;
  const descricao  = document.getElementById("post-descricao").value.trim();

  try {
    const docRef = await addDoc(collection(db, "vagas"), {
      clube, plataforma, posicao, estilo, jogo, descricao,
      capitaoUid:  usuarioAtual.uid,
      capitaoNome: perfilAtual.nickname || usuarioAtual.displayName || "Capitão",
      criadoEm:    serverTimestamp(),
    });

    await setDoc(doc(db, "jogadores", usuarioAtual.uid), {
      clubeId: docRef.id, ehCapitao: true, clube
    }, { merge: true });

    toast("✅ Vaga publicada! Expira em 1 hora.");
    formLfg.reset();
    await carregarVagas();
  } catch (err) {
    toast("Erro ao publicar: " + err.message, "erro");
  }
});

// =========================================================================
// 2. LISTAR VAGAS + cronômetro + auto-exclusão
// =========================================================================
async function carregarVagas() {
  // Limpa timers anteriores
  Object.values(timersAtivos).forEach(clearInterval);
  Object.keys(timersAtivos).forEach(k => delete timersAtivos[k]);

  const feed = document.getElementById("lfg-feed");
  if (!feed) return;
  feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">Carregando vagas...</p>`;

  const plataforma = document.getElementById("filtro-plataforma")?.value || "todas";
  const posicao    = document.getElementById("filtro-posicao")?.value    || "todas";
  const jogo       = document.getElementById("filtro-jogo")?.value       || "todas";

  try {
    const q    = query(collection(db, "vagas"), orderBy("criadoEm", "desc"));
    const snap = await getDocs(q);
    const agora = Date.now();

    // Separa vagas válidas e expiradas
    const validas  = [];
    const expiradas = [];

    snap.docs.forEach(d => {
      const dados = { id: d.id, ...d.data() };
      const criadoMs = dados.criadoEm?.toMillis?.() || 0;
      if (agora - criadoMs >= EXPIRACAO_MS) {
        expiradas.push(d.ref);
      } else {
        validas.push(dados);
      }
    });

    // Exclui expiradas no Firestore silenciosamente
    expiradas.forEach(ref => deleteDoc(ref));

    // Aplica filtros
    let filtradas = validas;
    if (plataforma !== "todas") filtradas = filtradas.filter(v => v.plataforma === plataforma);
    if (posicao    !== "todas") filtradas = filtradas.filter(v => v.posicao    === posicao);
    if (jogo       !== "todas") filtradas = filtradas.filter(v => v.jogo       === jogo);

    if (!filtradas.length) {
      feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">Nenhuma vaga encontrada.</p>`;
      return;
    }

    feed.innerHTML = filtradas.map(v => cardVaga(v)).join("");

    // Botões de candidatura
    feed.querySelectorAll(".btn-candidatar").forEach(btn => {
      btn.addEventListener("click", () =>
        candidatar(btn.dataset.vagaId, btn.dataset.capitaoUid, btn.dataset.clube)
      );
    });

    // Botões de excluir (só aparece para o capitão)
    feed.querySelectorAll(".btn-excluir-vaga").forEach(btn => {
      btn.addEventListener("click", () => excluirVaga(btn.dataset.vagaId));
    });

    // Inicia cronômetros
    filtradas.forEach(v => iniciarCronometro(v));

  } catch (err) {
    feed.innerHTML = `<p style="color:#d32f2f;text-align:center">Erro ao carregar vagas.</p>`;
    console.error(err);
  }
}

// ─── Card da vaga ─────────────────────────────────────────────────────────────
function cardVaga(v) {
  const ehDono = usuarioAtual?.uid === v.capitaoUid;
  const badgeClass = {
    ps5: "badge-ps5", ps4: "badge-ps5",
    xboxS: "badge-xbox", xboxO: "badge-xbox",
    pc: "badge-pc",
    switch2: "badge-switch", switch: "badge-switch",
  };

  return `
    <div class="lfg-card" id="card-${v.id}">
      <div class="card-topo">
        <span class="badge ${badgeClass[v.plataforma] || ''}">${v.plataforma.toUpperCase()}</span>
        <span class="badge badge-posicao">${v.posicao.toUpperCase()}</span>
        <span class="badge" style="background:#1a2a1a;color:#12E06C;border:1px solid #12E06C">${v.jogo.toUpperCase()}</span>
        <!-- Cronômetro -->
        <span id="timer-${v.id}" style="
          margin-left:auto; font-size:0.75rem; font-weight:700;
          color:#e06612; background:#1a1000; border:1px solid #e06612;
          border-radius:20px; padding:3px 10px; white-space:nowrap;
        ">⏱ --:--</span>
      </div>
      <div class="card-corpo">
        <h3 class="gamertag">⚽ ${v.clube}</h3>
        <p class="descricao">${v.descricao}</p>
        <p style="font-size:0.8rem;color:#666">Capitão: ${v.capitaoNome} · ${v.estilo}</p>
      </div>
      <div class="card-rodape">
        <span class="estilo-jogo">${v.estilo}</span>
        <div style="display:flex;gap:8px;align-items:center">
          ${ehDono ? `
            <button class="btn-excluir-vaga" data-vaga-id="${v.id}"
              style="padding:7px 14px;background:transparent;color:#d32f2f;
                     border:1px solid #d32f2f;border-radius:8px;font-weight:bold;
                     cursor:pointer;font-size:0.8rem;transition:all 0.2s"
              onmouseover="this.style.background='#d32f2f';this.style.color='#fff'"
              onmouseout="this.style.background='transparent';this.style.color='#d32f2f'">
              🗑 Excluir vaga
            </button>
            <span style="color:#12E06C;font-size:0.85rem;font-weight:bold">✓ Sua vaga</span>
          ` : `
            <button class="btn-chamar btn-candidatar"
              data-vaga-id="${v.id}"
              data-capitao-uid="${v.capitaoUid}"
              data-clube="${v.clube}">
              Me candidatar
            </button>
          `}
        </div>
      </div>
    </div>`;
}

// ─── Cronômetro regressivo ────────────────────────────────────────────────────
function iniciarCronometro(v) {
  const criadoMs  = v.criadoEm?.toMillis?.() || Date.now();
  const expiraEm  = criadoMs + EXPIRACAO_MS;

  function atualizar() {
    const restante = expiraEm - Date.now();
    const el = document.getElementById(`timer-${v.id}`);

    if (!el) {
      clearInterval(timersAtivos[v.id]);
      delete timersAtivos[v.id];
      return;
    }

    if (restante <= 0) {
      clearInterval(timersAtivos[v.id]);
      delete timersAtivos[v.id];
      // Remove o card da tela e exclui do Firestore
      document.getElementById(`card-${v.id}`)?.remove();
      deleteDoc(doc(db, "vagas", v.id));
      return;
    }

    const min = String(Math.floor(restante / 60000)).padStart(2, "0");
    const seg = String(Math.floor((restante % 60000) / 1000)).padStart(2, "0");
    el.textContent = `⏱ ${min}:${seg}`;

    // Muda para vermelho nos últimos 5 minutos
    if (restante < 5 * 60 * 1000) {
      el.style.color  = "#ff4444";
      el.style.border = "1px solid #ff4444";
      el.style.background = "#1a0000";
    }
  }

  atualizar(); // chamada imediata
  timersAtivos[v.id] = setInterval(atualizar, 1000);
}

// ─── Excluir vaga manualmente ─────────────────────────────────────────────────
async function excluirVaga(vagaId) {
  const confirmar = confirm("Tem certeza que quer excluir essa vaga?");
  if (!confirmar) return;

  try {
    clearInterval(timersAtivos[vagaId]);
    delete timersAtivos[vagaId];
    await deleteDoc(doc(db, "vagas", vagaId));
    document.getElementById(`card-${vagaId}`)?.remove();
    toast("🗑 Vaga excluída.");

    // Se o feed ficou vazio, mostra mensagem
    const feed = document.getElementById("lfg-feed");
    if (feed && !feed.querySelector(".lfg-card")) {
      feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">Nenhuma vaga encontrada.</p>`;
    }
  } catch (err) {
    toast("Erro ao excluir: " + err.message, "erro");
  }
}

// Filtros disparam recarregamento
["filtro-plataforma","filtro-posicao","filtro-jogo"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", carregarVagas);
});

// =========================================================================
// 3. CANDIDATAR-SE
// =========================================================================
async function candidatar(vagaId, capitaoUid, clube) {
  if (!usuarioAtual) {
    toast("Faça login para se candidatar.", "erro");
    return;
  }
  if (usuarioAtual.uid === capitaoUid) {
    toast("Você é o capitão desse clube!", "erro");
    return;
  }

  const existQ = query(
    collection(db, "candidaturas"),
    where("jogadorUid", "==", usuarioAtual.uid),
    where("vagaId",     "==", vagaId)
  );
  const existSnap = await getDocs(existQ);
  if (!existSnap.empty) {
    toast("Você já se candidatou a esse clube.", "erro");
    return;
  }

  try {
    await addDoc(collection(db, "candidaturas"), {
      vagaId,
      clube,
      jogadorUid:  usuarioAtual.uid,
      jogadorNome: perfilAtual.nickname || usuarioAtual.displayName || "Jogador",
      jogadorFoto: perfilAtual.fotoURL  || "",
      posicao:     perfilAtual.posicao  || "—",
      overall:     perfilAtual.overall  || "—",
      capitaoUid,
      status:      "pendente",
      criadoEm:   serverTimestamp(),
    });
    toast("✅ Candidatura enviada! Aguarde o capitão.");
  } catch (err) {
    toast("Erro ao candidatar: " + err.message, "erro");
  }
}

// =========================================================================
// 4. NOTIFICAÇÕES EM TEMPO REAL
// =========================================================================
function escutarNotificacoes(uid) {
  const qCap = query(
    collection(db, "candidaturas"),
    where("capitaoUid", "==", uid),
    where("status",     "==", "pendente")
  );
  onSnapshot(qCap, (snap) => {
    atualizarBadge(snap.size);
    snap.docChanges().forEach(change => {
      if (change.type === "added") mostrarNotificacaoCapitao(change.doc);
    });
  });

  const qJog = query(
    collection(db, "candidaturas"),
    where("jogadorUid", "==", uid),
    where("status",     "==", "aceito"),
    where("jogadorViu", "==", false)
  );
  onSnapshot(qJog, (snap) => {
    const badge = document.getElementById("badge");
    if (badge && snap.size > 0) {
      const atual = parseInt(badge.textContent) || 0;
      badge.textContent = atual + snap.size;
      badge.classList.remove("hidden");
    }
    snap.docChanges().forEach(change => {
      if (change.type === "added") mostrarNotificacaoJogador(change.doc);
    });
  });
}

function atualizarBadge(count) {
  const badge = document.getElementById("badge");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function garantirPainel() {
  let painel = document.getElementById("notif-painel");
  if (painel) return painel;

  painel = document.createElement("div");
  painel.id = "notif-painel";
  painel.style.cssText = `
    position:fixed; top:80px; right:20px; width:340px; max-height:82vh;
    overflow-y:auto; background:#0F1A2C; border:1px solid #1e3a1e;
    border-radius:14px; padding:16px; z-index:9999;
    box-shadow:0 8px 32px rgba(0,0,0,0.6); display:none; flex-direction:column; gap:10px;
  `;
  painel.innerHTML = `
    <!-- Abas -->
    <div style="display:flex;gap:6px;margin-bottom:4px">
      <button id="aba-notif" style="
        flex:1;padding:8px;border:none;border-radius:8px;font-weight:700;
        font-family:'Montserrat',sans-serif;font-size:0.8rem;cursor:pointer;
        background:#12E06C;color:#050B14;">
        🔔 Notificações
      </button>
      <button id="aba-chats" style="
        flex:1;padding:8px;border:none;border-radius:8px;font-weight:700;
        font-family:'Montserrat',sans-serif;font-size:0.8rem;cursor:pointer;
        background:#1a2a1a;color:#A0AAB5;">
        💬 Meus Chats
      </button>
    </div>
    <div id="notif-lista"></div>
    <div id="chats-lista" style="display:none"></div>
  `;
  document.body.appendChild(painel);

  // Troca de abas
  painel.querySelector("#aba-notif").addEventListener("click", () => {
    document.getElementById("notif-lista").style.display = "block";
    document.getElementById("chats-lista").style.display = "none";
    painel.querySelector("#aba-notif").style.background = "#12E06C";
    painel.querySelector("#aba-notif").style.color = "#050B14";
    painel.querySelector("#aba-chats").style.background = "#1a2a1a";
    painel.querySelector("#aba-chats").style.color = "#A0AAB5";
  });

  painel.querySelector("#aba-chats").addEventListener("click", () => {
    document.getElementById("notif-lista").style.display = "none";
    document.getElementById("chats-lista").style.display = "block";
    painel.querySelector("#aba-chats").style.background = "#12E06C";
    painel.querySelector("#aba-chats").style.color = "#050B14";
    painel.querySelector("#aba-notif").style.background = "#1a2a1a";
    painel.querySelector("#aba-notif").style.color = "#A0AAB5";
    if (usuarioAtual) carregarMeusChats(usuarioAtual.uid);
  });

  // Sino abre/fecha
  document.getElementById("sino-btn")?.addEventListener("click", () => {
    painel.style.display = painel.style.display === "flex" ? "none" : "flex";
  });

  // Ícone de email abre direto na aba de chats
  document.getElementById("emailIcon")?.addEventListener("click", () => {
    painel.style.display = "flex";
    painel.querySelector("#aba-chats").click();
  });

  return painel;
}

// ─── Meus Chats ───────────────────────────────────────────────────────────────
async function carregarMeusChats(uid) {
  const lista = document.getElementById("chats-lista");
  if (!lista) return;
  lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center">Carregando chats...</p>`;

  try {
    const q    = query(collection(db, "chats"), where("participantes", "array-contains", uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center">Nenhum chat ainda.</p>`;
      return;
    }

    lista.innerHTML = snap.docs.map(d => {
      const chat = d.data();
      return `
        <a href="../HTML/chat.html?chatId=${d.id}"
          style="display:flex;align-items:center;gap:10px;
                 background:#1a2a1a;border:1px solid #1e3a1e;border-radius:10px;
                 padding:12px;margin-bottom:8px;text-decoration:none;
                 transition:border-color 0.2s"
          onmouseover="this.style.borderColor='#12E06C'"
          onmouseout="this.style.borderColor='#1e3a1e'">
          <span style="font-size:1.4rem">⚽</span>
          <div>
            <p style="margin:0;font-weight:700;color:#fff;font-size:0.9rem">${chat.clube || "Clube"}</p>
            <p style="margin:0;color:#A0AAB5;font-size:0.75rem">Clique para abrir o chat</p>
          </div>
          <span style="margin-left:auto;color:#12E06C;font-size:1rem">›</span>
        </a>`;
    }).join("");

  } catch (err) {
    lista.innerHTML = `<p style="color:#d32f2f;font-size:0.85rem;text-align:center">Erro ao carregar chats.</p>`;
    console.error(err);
  }
}

function mostrarNotificacaoCapitao(docSnap) {
  const d = docSnap.data();
  garantirPainel();
  const lista = document.getElementById("notif-lista");
  if (!lista || document.getElementById(`notif-${docSnap.id}`)) return;

  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `
    background:#1a2a1a; border:1px solid #1e3a1e; border-radius:10px;
    padding:12px; font-size:0.85rem; color:#E6EDF3; margin-bottom:8px;
  `;
  card.innerHTML = `
    <p style="margin:0 0 6px 0">
      <strong style="color:#12E06C">${d.jogadorNome}</strong> quer entrar no
      <strong>${d.clube}</strong>
    </p>
    <p style="margin:0 0 10px 0;color:#A0AAB5">Posição: ${d.posicao} · Overall: ${d.overall}</p>
    <div style="display:flex;gap:8px">
      <button data-id="${docSnap.id}" data-jogador="${d.jogadorUid}" data-clube="${d.clube}"
        class="btn-aceitar"
        style="flex:1;padding:8px;background:#12E06C;color:#050B14;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">✅ Aceitar</button>
      <button data-id="${docSnap.id}" class="btn-recusar"
        style="flex:1;padding:8px;background:#333;color:#fff;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">❌ Recusar</button>
    </div>
  `;

  card.querySelector(".btn-aceitar").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    aceitarCandidatura(btn.dataset.id, btn.dataset.jogador, btn.dataset.clube, card);
  });
  card.querySelector(".btn-recusar").addEventListener("click", (e) => {
    recusarCandidatura(e.currentTarget.dataset.id, card);
  });

  lista.prepend(card);
}

function mostrarNotificacaoJogador(docSnap) {
  const d = docSnap.data();
  garantirPainel();
  const lista = document.getElementById("notif-lista");
  if (!lista || document.getElementById(`notif-${docSnap.id}`)) return;

  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `
    background:#0a1f0a; border:1px solid #12E06C; border-radius:10px;
    padding:12px; font-size:0.85rem; color:#E6EDF3; margin-bottom:8px;
  `;
  card.innerHTML = `
    <p style="margin:0 0 10px 0">
      🎉 Você foi <strong style="color:#12E06C">aceito</strong> no clube <strong>${d.clube}</strong>!
    </p>
    <a href="../HTML/chat.html?chatId=${d.chatId}"
      style="display:block;text-align:center;padding:8px;background:#12E06C;
             color:#050B14;border-radius:8px;font-weight:bold;text-decoration:none">
      💬 Abrir chat do clube
    </a>
  `;

  updateDoc(docSnap.ref, { jogadorViu: true });
  lista.prepend(card);
}

// =========================================================================
// 5. ACEITAR / RECUSAR
// =========================================================================
async function aceitarCandidatura(candidaturaId, jogadorUid, clube, card) {
  try {
    const chatRef = await addDoc(collection(db, "chats"), {
      clube,
      participantes: [usuarioAtual.uid, jogadorUid],
      criadoEm:     serverTimestamp(),
    });

    await updateDoc(doc(db, "candidaturas", candidaturaId), {
      status: "aceito", chatId: chatRef.id, jogadorViu: false,
    });

    await setDoc(doc(db, "jogadores", jogadorUid), {
      clubeId: chatRef.id, clube
    }, { merge: true });

    card.innerHTML = `
      <p style="color:#12E06C;margin:0 0 8px 0;text-align:center">✅ Aceito! Chat criado.</p>
      <a href="../HTML/chat.html?chatId=${chatRef.id}"
        style="display:block;text-align:center;padding:8px;background:#12E06C;
               color:#050B14;border-radius:8px;font-weight:bold;text-decoration:none">
        💬 Abrir chat
      </a>`;
  } catch (err) {
    toast("Erro ao aceitar: " + err.message, "erro");
  }
}

async function recusarCandidatura(candidaturaId, card) {
  try {
    await updateDoc(doc(db, "candidaturas", candidaturaId), { status: "recusado" });
    card.style.opacity = "0.4";
    card.innerHTML = `<p style="color:#666;margin:0;text-align:center">Candidatura recusada.</p>`;
  } catch (err) {
    toast("Erro ao recusar: " + err.message, "erro");
  }
}

// =========================================================================
// UTILITÁRIO: toast
// =========================================================================
function toast(msg, tipo = "sucesso") {
  document.getElementById("toast-mercado")?.remove();
  const el = Object.assign(document.createElement("div"), {
    id: "toast-mercado", textContent: msg,
  });
  Object.assign(el.style, {
    position: "fixed", bottom: "24px", right: "24px",
    background: tipo === "sucesso" ? "#12E06C" : "#d32f2f",
    color: tipo === "sucesso" ? "#050B14" : "#fff",
    fontWeight: "bold", padding: "14px 22px", borderRadius: "8px",
    fontFamily: "'Montserrat',sans-serif", fontSize: "0.9rem",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: "9999",
    opacity: "0", transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = "1"));
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3500);
}
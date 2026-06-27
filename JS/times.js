// =========================================================================
// MERCADO PRO CLUBS — times.js
// Fluxo:
//  - 🔔 Sino → painel de notificações (candidaturas pendentes + aceites)
//  - ✉️ Email → painel de mensagens (lista de chats + chat inline)
//  - Vagas expiram em 1h, chat é permanente
// =========================================================================

import { auth, db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, getDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const EXPIRACAO_MS = 60 * 60 * 1000; // vagas: 1h

let usuarioAtual = null;
let perfilAtual  = {};
const timersAtivos = {};
let chatAbertoId   = null; // chat atualmente aberto no painel
let unsubChat      = null; // listener de mensagens ativo

// ─── Auth ─────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  usuarioAtual = user;
  if (user) {
    const snap = await getDoc(doc(db, "jogadores", user.uid));
    perfilAtual = snap.exists() ? snap.data() : {};
    escutarNotificacoes(user.uid);
    iniciarPainelMensagens();
  }
  await carregarVagas();
});

// =========================================================================
// 1. PUBLICAR VAGA
// =========================================================================
document.getElementById("form-lfg")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!usuarioAtual) { toast("Você precisa estar logado.", "erro"); return; }

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
    await setDoc(doc(db, "jogadores", usuarioAtual.uid),
      { clubeId: docRef.id, ehCapitao: true, clube }, { merge: true });
    toast("✅ Vaga publicada! Expira em 1 hora.");
    document.getElementById("form-lfg").reset();
    await carregarVagas();
  } catch (err) { toast("Erro ao publicar: " + err.message, "erro"); }
});

// =========================================================================
// 2. LISTAR VAGAS
// =========================================================================
async function carregarVagas() {
  Object.values(timersAtivos).forEach(clearInterval);
  Object.keys(timersAtivos).forEach(k => delete timersAtivos[k]);

  const feed = document.getElementById("lfg-feed");
  if (!feed) return;
  feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">Carregando vagas...</p>`;

  const filtPlat = document.getElementById("filtro-plataforma")?.value || "todas";
  const filtPos  = document.getElementById("filtro-posicao")?.value    || "todas";
  const filtJogo = document.getElementById("filtro-jogo")?.value       || "todas";

  try {
    const snap  = await getDocs(query(collection(db, "vagas"), orderBy("criadoEm", "desc")));
    const agora = Date.now();
    const validas = [];

    snap.docs.forEach(d => {
      const dados    = { id: d.id, ...d.data() };
      const criadoMs = dados.criadoEm?.toMillis?.() || 0;
      if (agora - criadoMs >= EXPIRACAO_MS) deleteDoc(d.ref);
      else validas.push(dados);
    });

    let filtradas = validas;
    if (filtPlat !== "todas") filtradas = filtradas.filter(v => v.plataforma === filtPlat);
    if (filtPos  !== "todas") filtradas = filtradas.filter(v => v.posicao    === filtPos);
    if (filtJogo !== "todas") filtradas = filtradas.filter(v => v.jogo       === filtJogo);

    if (!filtradas.length) {
      feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">Nenhuma vaga encontrada.</p>`;
      return;
    }

    feed.innerHTML = filtradas.map(v => cardVaga(v)).join("");
    feed.querySelectorAll(".btn-candidatar").forEach(btn =>
      btn.addEventListener("click", () =>
        candidatar(btn.dataset.vagaId, btn.dataset.capitaoUid, btn.dataset.clube))
    );
    feed.querySelectorAll(".btn-excluir-vaga").forEach(btn =>
      btn.addEventListener("click", () => excluirVaga(btn.dataset.vagaId))
    );
    filtradas.forEach(v => iniciarCronometro(v));

  } catch (err) {
    feed.innerHTML = `<p style="color:#d32f2f;text-align:center">Erro ao carregar vagas.</p>`;
    console.error(err);
  }
}

function cardVaga(v) {
  const ehDono = usuarioAtual?.uid === v.capitaoUid;
  const badgeClass = {
    ps5:"badge-ps5",ps4:"badge-ps5",xboxS:"badge-xbox",xboxO:"badge-xbox",
    pc:"badge-pc",switch2:"badge-switch",switch:"badge-switch",
  };
  return `
    <div class="lfg-card" id="card-${v.id}">
      <div class="card-topo">
        <span class="badge ${badgeClass[v.plataforma]||''}">${v.plataforma.toUpperCase()}</span>
        <span class="badge badge-posicao">${v.posicao.toUpperCase()}</span>
        <span class="badge" style="background:#1a2a1a;color:#12E06C;border:1px solid #12E06C">${v.jogo.toUpperCase()}</span>
        <span id="timer-${v.id}" style="margin-left:auto;font-size:0.75rem;font-weight:700;
          color:#e06612;background:#1a1000;border:1px solid #e06612;
          border-radius:20px;padding:3px 10px;white-space:nowrap">⏱ --:--</span>
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
                border:1px solid #d32f2f;border-radius:8px;font-weight:bold;cursor:pointer;font-size:0.8rem"
              onmouseover="this.style.background='#d32f2f';this.style.color='#fff'"
              onmouseout="this.style.background='transparent';this.style.color='#d32f2f'">
              🗑 Excluir vaga
            </button>
            <span style="color:#12E06C;font-size:0.85rem;font-weight:bold">✓ Sua vaga</span>
          ` : `
            <button class="btn-chamar btn-candidatar"
              data-vaga-id="${v.id}" data-capitao-uid="${v.capitaoUid}" data-clube="${v.clube}">
              Me candidatar
            </button>
          `}
        </div>
      </div>
    </div>`;
}

function iniciarCronometro(v) {
  const expiraEm = (v.criadoEm?.toMillis?.() || Date.now()) + EXPIRACAO_MS;
  function tick() {
    const restante = expiraEm - Date.now();
    const el = document.getElementById(`timer-${v.id}`);
    if (!el) { clearInterval(timersAtivos[v.id]); delete timersAtivos[v.id]; return; }
    if (restante <= 0) {
      clearInterval(timersAtivos[v.id]); delete timersAtivos[v.id];
      document.getElementById(`card-${v.id}`)?.remove();
      deleteDoc(doc(db, "vagas", v.id));
      return;
    }
    const min = String(Math.floor(restante / 60000)).padStart(2,"0");
    const seg = String(Math.floor((restante % 60000) / 1000)).padStart(2,"0");
    el.textContent = `⏱ ${min}:${seg}`;
    if (restante < 5*60*1000) {
      el.style.color="#ff4444"; el.style.borderColor="#ff4444"; el.style.background="#1a0000";
    }
  }
  tick();
  timersAtivos[v.id] = setInterval(tick, 1000);
}

async function excluirVaga(vagaId) {
  if (!confirm("Tem certeza que quer excluir essa vaga?")) return;
  try {
    clearInterval(timersAtivos[vagaId]); delete timersAtivos[vagaId];
    await deleteDoc(doc(db, "vagas", vagaId));
    document.getElementById(`card-${vagaId}`)?.remove();
    toast("🗑 Vaga excluída.");
    const feed = document.getElementById("lfg-feed");
    if (feed && !feed.querySelector(".lfg-card"))
      feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">Nenhuma vaga encontrada.</p>`;
  } catch (err) { toast("Erro ao excluir: " + err.message, "erro"); }
}

["filtro-plataforma","filtro-posicao","filtro-jogo"].forEach(id =>
  document.getElementById(id)?.addEventListener("change", carregarVagas)
);

// =========================================================================
// 3. CANDIDATAR-SE
// =========================================================================
async function candidatar(vagaId, capitaoUid, clube) {
  if (!usuarioAtual) { toast("Faça login para se candidatar.", "erro"); return; }
  if (usuarioAtual.uid === capitaoUid) { toast("Você é o capitão desse clube!", "erro"); return; }
  try {
    const existSnap = await getDocs(query(
      collection(db, "candidaturas"),
      where("jogadorUid","==",usuarioAtual.uid),
      where("vagaId","==",vagaId)
    ));
    if (!existSnap.empty) { toast("Você já se candidatou a esse clube.", "erro"); return; }
    await addDoc(collection(db, "candidaturas"), {
      vagaId, clube,
      jogadorUid:  usuarioAtual.uid,
      jogadorNome: perfilAtual.nickname || usuarioAtual.displayName || "Jogador",
      jogadorFoto: perfilAtual.fotoURL  || "",
      posicao:     perfilAtual.posicao  || "—",
      overall:     perfilAtual.overall  || "—",
      capitaoUid, status: "pendente", criadoEm: serverTimestamp(),
    });
    toast("✅ Candidatura enviada! Aguarde o capitão.");
  } catch (err) { toast("Erro ao candidatar: " + err.message, "erro"); }
}

// =========================================================================
// 4. NOTIFICAÇÕES (sino 🔔)
// =========================================================================
function escutarNotificacoes(uid) {
  // Capitão: candidaturas pendentes
  onSnapshot(
    query(collection(db,"candidaturas"), where("capitaoUid","==",uid), where("status","==","pendente")),
    (snap) => {
      atualizarBadgeSino(snap.size);
      snap.docChanges().forEach(c => { if (c.type==="added") cardNotifCapitao(c.doc); });
    }
  );
  // Jogador: aceites não vistos
  onSnapshot(
    query(collection(db,"candidaturas"),
      where("jogadorUid","==",uid), where("status","==","aceito"), where("jogadorViu","==",false)),
    (snap) => {
      if (snap.size > 0) {
        const b = document.getElementById("badge");
        if (b) { b.textContent = (parseInt(b.textContent)||0) + snap.size; b.classList.remove("hidden"); }
      }
      snap.docChanges().forEach(c => { if (c.type==="added") cardNotifJogador(c.doc); });
    },
    (err) => console.warn("Índice pendente:", err.message)
  );
}

function atualizarBadgeSino(count) {
  const b = document.getElementById("badge");
  if (!b) return;
  b.textContent = count;
  b.classList.toggle("hidden", count === 0);
}

// ── Painel do sino ────────────────────────────────────────────────────────────
function garantirPainelSino() {
  let p = document.getElementById("painel-sino");
  if (p) return p;
  p = document.createElement("div");
  p.id = "painel-sino";
  p.style.cssText = `
    position:fixed;top:80px;right:20px;width:320px;max-height:80vh;overflow-y:auto;
    background:#0F1A2C;border:1px solid #1e3a1e;border-radius:14px;padding:16px;
    z-index:9998;box-shadow:0 8px 32px rgba(0,0,0,0.6);display:none;flex-direction:column;gap:8px;
  `;
  p.innerHTML = `
    <h3 style="color:#12E06C;margin:0 0 8px 0;font-size:0.9rem">🔔 Notificações</h3>
    <div id="sino-lista"><p style="color:#A0AAB5;font-size:0.85rem;text-align:center">Sem notificações.</p></div>
  `;
  document.body.appendChild(p);

  document.getElementById("sino-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    fecharPainelMsg();
    p.style.display = p.style.display === "flex" ? "none" : "flex";
  });
  document.addEventListener("click", (e) => {
    if (!p.contains(e.target) && e.target.id !== "sino-btn") p.style.display = "none";
  });
  return p;
}

function cardNotifCapitao(docSnap) {
  const d = docSnap.data();
  garantirPainelSino();
  const lista = document.getElementById("sino-lista");
  if (!lista || document.getElementById(`notif-${docSnap.id}`)) return;
  // Remove placeholder
  lista.querySelector("p")?.remove();

  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `background:#1a2a1a;border:1px solid #1e3a1e;border-radius:10px;
    padding:12px;font-size:0.85rem;color:#E6EDF3;margin-bottom:8px`;
  card.innerHTML = `
    <p style="margin:0 0 4px 0">
      <strong style="color:#12E06C">${d.jogadorNome}</strong> quer entrar no <strong>${d.clube}</strong>
    </p>
    <p style="margin:0 0 10px 0;color:#A0AAB5;font-size:0.8rem">Posição: ${d.posicao} · Overall: ${d.overall}</p>
    <div style="display:flex;gap:8px">
      <button data-id="${docSnap.id}" data-jogador="${d.jogadorUid}" data-clube="${d.clube}" class="btn-aceitar"
        style="flex:1;padding:8px;background:#12E06C;color:#050B14;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">✅ Aceitar</button>
      <button data-id="${docSnap.id}" class="btn-recusar"
        style="flex:1;padding:8px;background:#333;color:#fff;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">❌ Recusar</button>
    </div>`;
  card.querySelector(".btn-aceitar").addEventListener("click", (e) => {
    const b = e.currentTarget;
    aceitarCandidatura(b.dataset.id, b.dataset.jogador, b.dataset.clube, card);
  });
  card.querySelector(".btn-recusar").addEventListener("click", (e) =>
    recusarCandidatura(e.currentTarget.dataset.id, card)
  );
  lista.prepend(card);
}

function cardNotifJogador(docSnap) {
  const d = docSnap.data();
  garantirPainelSino();
  const lista = document.getElementById("sino-lista");
  if (!lista || document.getElementById(`notif-${docSnap.id}`)) return;
  lista.querySelector("p")?.remove();

  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `background:#0a1f0a;border:1px solid #12E06C;border-radius:10px;
    padding:12px;font-size:0.85rem;color:#E6EDF3;margin-bottom:8px`;
  card.innerHTML = `
    <p style="margin:0 0 8px 0">
      🎉 Você foi <strong style="color:#12E06C">aceito</strong> no clube <strong>${d.clube}</strong>!
    </p>
    <button data-chat="${d.chatId}" class="btn-abrir-chat-notif"
      style="width:100%;padding:8px;background:#12E06C;color:#050B14;border:none;
             border-radius:8px;font-weight:bold;cursor:pointer">
      💬 Abrir chat do clube
    </button>`;
  card.querySelector(".btn-abrir-chat-notif").addEventListener("click", (e) => {
    abrirChat(e.currentTarget.dataset.chat);
    document.getElementById("painel-sino").style.display = "none";
  });
  updateDoc(docSnap.ref, { jogadorViu: true });
  lista.prepend(card);
}

// =========================================================================
// 5. ACEITAR / RECUSAR CANDIDATURA
// =========================================================================
async function aceitarCandidatura(candidaturaId, jogadorUid, clube, card) {
  card.style.opacity = "0.6";
  card.querySelectorAll("button").forEach(b => b.disabled = true);
  try {
    const chatRef = await addDoc(collection(db, "chats"), {
      clube, participantes: [usuarioAtual.uid, jogadorUid], criadoEm: serverTimestamp(),
    });
    await updateDoc(doc(db,"candidaturas",candidaturaId), {
      status:"aceito", chatId:chatRef.id, jogadorViu:false,
    });
    await setDoc(doc(db,"jogadores",jogadorUid), { clubeId:chatRef.id, clube }, { merge:true });

    card.style.opacity = "1";
    card.innerHTML = `
      <p style="color:#12E06C;margin:0 0 8px 0;text-align:center;font-weight:bold">✅ Jogador aceito!</p>
      <button data-chat="${chatRef.id}" class="btn-abrir-chat-notif"
        style="width:100%;padding:8px;background:#12E06C;color:#050B14;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">💬 Abrir chat com o jogador</button>`;
    card.querySelector(".btn-abrir-chat-notif").addEventListener("click", (e) => {
      document.getElementById("painel-sino").style.display = "none";
      // Abre o painel de mensagens direto no chat criado
      garantirPainelMsg();
      document.getElementById("painel-msg").style.display = "flex";
      abrirChat(e.currentTarget.dataset.chat);
    });
    // Recarrega lista de chats em background
    carregarListaChats(usuarioAtual.uid);
  } catch (err) {
    card.style.opacity = "1";
    card.querySelectorAll("button").forEach(b => b.disabled = false);
    toast("Erro ao aceitar: " + err.message, "erro");
  }
}

async function recusarCandidatura(candidaturaId, card) {
  try {
    await updateDoc(doc(db,"candidaturas",candidaturaId), { status:"recusado" });
    card.style.opacity = "0.4";
    card.innerHTML = `<p style="color:#666;margin:0;text-align:center">Candidatura recusada.</p>`;
  } catch (err) { toast("Erro ao recusar: " + err.message, "erro"); }
}

// =========================================================================
// 6. PAINEL DE MENSAGENS (ícone ✉️)
// =========================================================================
function iniciarPainelMensagens() {
  garantirPainelMsg();
  document.getElementById("emailIcon")?.addEventListener("click", (e) => {
    e.stopPropagation();
    fecharPainelSino();
    const p = document.getElementById("painel-msg");
    const aberto = p.style.display === "flex";
    p.style.display = aberto ? "none" : "flex";
    if (!aberto) carregarListaChats(usuarioAtual.uid);
  });
}

function garantirPainelMsg() {
  let p = document.getElementById("painel-msg");
  if (p) return p;
  p = document.createElement("div");
  p.id = "painel-msg";
  p.style.cssText = `
    position:fixed;top:80px;right:20px;width:360px;max-height:85vh;
    background:#0F1A2C;border:1px solid #1e3a1e;border-radius:14px;
    z-index:9998;box-shadow:0 8px 32px rgba(0,0,0,0.6);
    display:none;flex-direction:column;overflow:hidden;
  `;
  p.innerHTML = `
    <!-- Header do painel -->
    <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;
                border-bottom:1px solid #1e3a1e;flex-shrink:0">
      <button id="msg-btn-voltar" style="display:none;background:none;border:none;
        color:#12E06C;font-size:1.2rem;cursor:pointer;padding:0 4px">←</button>
      <span id="msg-titulo" style="color:#fff;font-weight:700;font-size:0.95rem">💬 Mensagens</span>
      <button id="msg-btn-fechar" style="margin-left:auto;background:none;border:none;
        color:#A0AAB5;font-size:1.1rem;cursor:pointer">✕</button>
    </div>
    <!-- Lista de chats -->
    <div id="msg-lista" style="overflow-y:auto;flex:1;padding:12px"></div>
    <!-- Área do chat ativo -->
    <div id="msg-chat" style="display:none;flex-direction:column;flex:1;overflow:hidden">
      <div id="msg-mensagens" style="flex:1;overflow-y:auto;padding:12px;display:flex;
        flex-direction:column;gap:8px"></div>
      <form id="msg-form" style="display:flex;gap:8px;padding:10px 12px;
        border-top:1px solid #1e3a1e;flex-shrink:0">
        <input id="msg-input" type="text" placeholder="Digite sua mensagem..."
          autocomplete="off" maxlength="500"
          style="flex:1;background:#1a2a1a;border:1px solid #1e3a1e;border-radius:20px;
                 padding:10px 16px;color:#fff;font-family:'Montserrat',sans-serif;
                 font-size:0.85rem;outline:none"/>
        <button type="submit"
          style="background:#12E06C;color:#050B14;border:none;border-radius:50%;
                 width:40px;height:40px;font-size:1rem;cursor:pointer;flex-shrink:0">➤</button>
      </form>
    </div>
  `;
  document.body.appendChild(p);

  document.getElementById("msg-btn-fechar").addEventListener("click", fecharPainelMsg);
  document.getElementById("msg-btn-voltar").addEventListener("click", voltarListaChats);
  document.getElementById("msg-form").addEventListener("submit", enviarMensagem);
  document.addEventListener("click", (e) => {
    if (!p.contains(e.target) && e.target.id !== "emailIcon" && !e.target.closest("#emailIcon"))
      p.style.display = "none";
  });
  return p;
}

function fecharPainelMsg() {
  const p = document.getElementById("painel-msg");
  if (p) p.style.display = "none";
}
function fecharPainelSino() {
  const p = document.getElementById("painel-sino");
  if (p) p.style.display = "none";
}

async function carregarListaChats(uid) {
  voltarListaChats();
  const lista = document.getElementById("msg-lista");
  if (!lista) return;
  lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center">Carregando...</p>`;

  try {
    const snap = await getDocs(
      query(collection(db,"chats"), where("participantes","array-contains",uid))
    );
    if (snap.empty) {
      lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center;margin-top:20px">
        Nenhuma conversa ainda.<br>Candidate-se a um clube para começar!</p>`;
      return;
    }
    lista.innerHTML = "";
    snap.docs.forEach(d => {
      const chat = d.data();
      const item = document.createElement("div");
      item.style.cssText = `display:flex;align-items:center;gap:12px;padding:12px;
        border-radius:10px;cursor:pointer;transition:border-color 0.15s;margin-bottom:6px;
        background:#1a2a1a;border:1px solid #1e3a1e;position:relative`;
      item.innerHTML = `
        <div style="width:40px;height:40px;background:#12E06C22;border-radius:50%;
          display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">⚽</div>
        <div style="flex:1;min-width:0">
          <p style="margin:0;font-weight:700;color:#fff;font-size:0.9rem;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${chat.clube || "Clube"}</p>
          <p style="margin:0;color:#A0AAB5;font-size:0.75rem">Toque para abrir</p>
        </div>
        <span class="chat-seta" style="color:#12E06C;font-size:1.1rem;margin-right:4px">›</span>
        <button class="btn-excluir-chat" data-chat-id="${d.id}"
          title="Excluir conversa"
          style="background:transparent;border:none;color:#555;font-size:1rem;
                 cursor:pointer;padding:4px;border-radius:6px;flex-shrink:0;
                 transition:color 0.2s,background 0.2s"
          onmouseover="this.style.color='#d32f2f';this.style.background='rgba(211,47,47,0.1)'"
          onmouseout="this.style.color='#555';this.style.background='transparent'">🗑</button>`;

      item.addEventListener("mouseenter", () => item.style.borderColor = "#12E06C");
      item.addEventListener("mouseleave", () => item.style.borderColor = "#1e3a1e");

      // Clique na área principal abre o chat
      item.addEventListener("click", (e) => {
        if (e.target.closest(".btn-excluir-chat")) return;
        abrirChat(d.id, chat.clube);
      });

      // Botão excluir
      item.querySelector(".btn-excluir-chat").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Excluir a conversa "${chat.clube || "Clube"}"? Isso não pode ser desfeito.`)) return;
        try {
          await deleteDoc(doc(db, "chats", d.id));
          item.remove();
          if (!lista.querySelector("div"))
            lista.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center;margin-top:20px">
              Nenhuma conversa ainda.</p>`;
          toastMercado("🗑 Conversa excluída.");
        } catch (err) { toastMercado("Erro ao excluir: " + err.message, "erro"); }
      });

      lista.appendChild(item);
    });
  } catch (err) {
    lista.innerHTML = `<p style="color:#d32f2f;font-size:0.85rem;text-align:center">Erro ao carregar.</p>`;
    console.error(err);
  }
}

function voltarListaChats() {
  if (unsubChat) { unsubChat(); unsubChat = null; }
  chatAbertoId = null;
  document.getElementById("msg-lista").style.display = "block";
  document.getElementById("msg-chat").style.display  = "none";
  document.getElementById("msg-btn-voltar").style.display = "none";
  document.getElementById("msg-titulo").textContent = "💬 Mensagens";
  document.getElementById("msg-mensagens").innerHTML = "";
  document.getElementById("msg-input").value = "";
}

async function abrirChat(chatId, clubeNome) {
  if (!usuarioAtual) return;
  chatAbertoId = chatId;

  // Verifica acesso
  try {
    const chatSnap = await getDoc(doc(db,"chats",chatId));
    if (!chatSnap.exists() || !chatSnap.data().participantes.includes(usuarioAtual.uid)) {
      toast("Sem acesso a este chat.", "erro"); return;
    }
    const nome = clubeNome || chatSnap.data().clube || "Chat";
    document.getElementById("msg-titulo").textContent = `⚽ ${nome}`;
  } catch (err) { toast("Erro ao abrir chat.", "erro"); return; }

  // Mostra área de chat, esconde lista
  document.getElementById("msg-lista").style.display = "none";
  document.getElementById("msg-chat").style.display  = "flex";
  document.getElementById("msg-btn-voltar").style.display = "block";

  // Garante que o painel esteja aberto
  document.getElementById("painel-msg").style.display = "flex";

  // Escuta mensagens em tempo real
  const msgRef = collection(db,"chats",chatId,"mensagens");
  const perfilSnap = await getDoc(doc(db,"jogadores",usuarioAtual.uid));
  const meuNome = perfilSnap.exists()
    ? (perfilSnap.data().nickname || usuarioAtual.displayName || "Jogador")
    : (usuarioAtual.displayName || "Jogador");

  unsubChat = onSnapshot(
    query(msgRef, orderBy("enviadoEm","asc")),
    (snap) => {
      const container = document.getElementById("msg-mensagens");
      if (!container) return;
      container.innerHTML = "";
      if (snap.empty) {
        container.innerHTML = `<p style="color:#A0AAB5;font-size:0.85rem;text-align:center;margin:auto">
          Nenhuma mensagem ainda. Diga olá! 👋</p>`;
        return;
      }
      snap.forEach(d => {
        const msg   = d.data();
        const minha = msg.autorUid === usuarioAtual.uid;
        const hora  = msg.enviadoEm?.toDate
          ? msg.enviadoEm.toDate().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})
          : "";
        const bolha = document.createElement("div");
        bolha.style.cssText = `
          max-width:80%;padding:9px 14px;border-radius:16px;font-size:0.85rem;
          line-height:1.4;word-break:break-word;
          align-self:${minha?"flex-end":"flex-start"};
          background:${minha?"#12E06C":"#1a2a1a"};
          color:${minha?"#050B14":"#E6EDF3"};
          border-bottom-${minha?"right":"left"}-radius:4px;
        `;
        bolha.innerHTML = `
          ${!minha?`<div style="font-size:0.7rem;font-weight:700;opacity:0.7;margin-bottom:3px">${msg.autorNome}</div>`:""}
          <div>${escHtml(msg.texto)}</div>
          <div style="font-size:0.68rem;opacity:0.5;text-align:right;margin-top:3px">${hora}</div>`;
        container.appendChild(bolha);
      });
      container.scrollTop = container.scrollHeight;
    }
  );

  // Guarda nome para o envio
  document.getElementById("msg-input").dataset.nome = meuNome;
}

async function enviarMensagem(e) {
  e.preventDefault();
  if (!chatAbertoId || !usuarioAtual) return;
  const input = document.getElementById("msg-input");
  const texto = input.value.trim();
  if (!texto) return;
  input.value = "";
  const meuNome = input.dataset.nome || usuarioAtual.displayName || "Jogador";
  try {
    await addDoc(collection(db,"chats",chatAbertoId,"mensagens"), {
      texto, autorUid: usuarioAtual.uid, autorNome: meuNome, enviadoEm: serverTimestamp(),
    });
  } catch (err) { console.error("Erro ao enviar:", err); }
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// =========================================================================
// TOAST
// =========================================================================
function toast(msg, tipo="sucesso") {
  document.getElementById("toast-mercado")?.remove();
  const el = Object.assign(document.createElement("div"),{id:"toast-mercado",textContent:msg});
  Object.assign(el.style,{
    position:"fixed",bottom:"24px",right:"24px",
    background:tipo==="sucesso"?"#12E06C":"#d32f2f",
    color:tipo==="sucesso"?"#050B14":"#fff",
    fontWeight:"bold",padding:"14px 22px",borderRadius:"8px",
    fontFamily:"'Montserrat',sans-serif",fontSize:"0.9rem",
    boxShadow:"0 4px 16px rgba(0,0,0,0.4)",zIndex:"9999",opacity:"0",transition:"opacity 0.3s",
  });
  document.body.appendChild(el);
  requestAnimationFrame(()=>(el.style.opacity="1"));
  setTimeout(()=>{el.style.opacity="0";setTimeout(()=>el.remove(),300);},3500);
}

// =========================================================================
// MERCADO PRO CLUBS — times.js
// Responsabilidades:
//  1. Publicar vaga de clube no Firestore
//  2. Listar vagas publicadas com filtros
//  3. Jogador se candidata ao clube
//  4. Capitão recebe notificação e aceita/recusa
//  5. Se aceito → notificação para jogador + chat criado
// =========================================================================
 
import { auth, db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, doc, getDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
 
// ─── Estado global ────────────────────────────────────────────────────────────
let usuarioAtual = null;
let perfilAtual  = {};
 
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
 
  const clube     = document.getElementById("post-clube").value.trim();
  const plataforma = document.getElementById("post-plataforma").value;
  const posicao   = document.getElementById("post-posicao").value;
  const estilo    = document.getElementById("post-estilo").value;
  const jogo      = document.getElementById("post-jogo").value;
  const descricao = document.getElementById("post-descricao").value.trim();
 
  try {
    const docRef = await addDoc(collection(db, "vagas"), {
      clube, plataforma, posicao, estilo, jogo, descricao,
      capitaoUid:   usuarioAtual.uid,
      capitaoNome:  perfilAtual.nickname || usuarioAtual.displayName || "Capitão",
      criadoEm:     serverTimestamp(),
    });
    // Salva clube no perfil do capitão
    await setDoc(doc(db, "jogadores", usuarioAtual.uid), {
      clubeId: docRef.id, ehCapitao: true, clube
    }, { merge: true });
 
    toast("✅ Vaga publicada com sucesso!");
    formLfg.reset();
    await carregarVagas();
  } catch (err) {
    toast("Erro ao publicar: " + err.message, "erro");
  }
});
 
// =========================================================================
// 2. LISTAR VAGAS
// =========================================================================
async function carregarVagas() {
  const feed = document.getElementById("lfg-feed");
  if (!feed) return;
  feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">Carregando vagas...</p>`;
 
  const plataforma = document.getElementById("filtro-plataforma")?.value || "todas";
  const posicao    = document.getElementById("filtro-posicao")?.value    || "todas";
  const jogo       = document.getElementById("filtro-jogo")?.value       || "todas";
 
  try {
    let q = query(collection(db, "vagas"), orderBy("criadoEm", "desc"));
    const snap = await getDocs(q);
 
    let vagas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
 
    // Filtros client-side (simples, sem índice composto)
    if (plataforma !== "todas") vagas = vagas.filter(v => v.plataforma === plataforma);
    if (posicao    !== "todas") vagas = vagas.filter(v => v.posicao    === posicao);
    if (jogo       !== "todas") vagas = vagas.filter(v => v.jogo       === jogo);
 
    if (!vagas.length) {
      feed.innerHTML = `<p style="color:#A0AAB5;text-align:center">Nenhuma vaga encontrada.</p>`;
      return;
    }
 
    feed.innerHTML = vagas.map(v => cardVaga(v)).join("");
 
    // Eventos dos botões de candidatura
    feed.querySelectorAll(".btn-candidatar").forEach(btn => {
      btn.addEventListener("click", () => candidatar(btn.dataset.vagaId, btn.dataset.capitaoUid, btn.dataset.clube));
    });
 
  } catch (err) {
    feed.innerHTML = `<p style="color:#d32f2f;text-align:center">Erro ao carregar vagas.</p>`;
    console.error(err);
  }
}
 
function cardVaga(v) {
  const ehDono = usuarioAtual?.uid === v.capitaoUid;
  const badge  = {
    ps5: "badge-ps5", ps4: "badge-ps5",
    xboxS: "badge-xbox", xboxO: "badge-xbox",
    pc: "badge-pc",
    switch2: "badge-switch", switch: "badge-switch",
  };
  return `
    <div class="lfg-card">
      <div class="card-topo">
        <span class="badge ${badge[v.plataforma] || ''}">${v.plataforma.toUpperCase()}</span>
        <span class="badge badge-posicao">${v.posicao.toUpperCase()}</span>
        <span class="badge" style="background:#1a2a1a;color:#12E06C;border:1px solid #12E06C">${v.jogo.toUpperCase()}</span>
      </div>
      <div class="card-corpo">
        <h3 class="gamertag">⚽ ${v.clube}</h3>
        <p class="descricao">${v.descricao}</p>
        <p style="font-size:0.8rem;color:#666">Capitão: ${v.capitaoNome} · ${v.estilo}</p>
      </div>
      <div class="card-rodape">
        <span class="estilo-jogo">${v.estilo}</span>
        ${ehDono
          ? `<span style="color:#12E06C;font-size:0.85rem;font-weight:bold">✓ Sua vaga</span>`
          : `<button class="btn-chamar btn-candidatar"
               data-vaga-id="${v.id}"
               data-capitao-uid="${v.capitaoUid}"
               data-clube="${v.clube}">
               Me candidatar
             </button>`
        }
      </div>
    </div>`;
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
 
  // Verifica candidatura duplicada
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
      jogadorUid:   usuarioAtual.uid,
      jogadorNome:  perfilAtual.nickname || usuarioAtual.displayName || "Jogador",
      jogadorFoto:  perfilAtual.fotoURL  || "",
      posicao:      perfilAtual.posicao  || "—",
      overall:      perfilAtual.overall  || "—",
      capitaoUid,
      status:       "pendente",
      criadoEm:     serverTimestamp(),
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
  // Capitão: escuta candidaturas pendentes direcionadas a ele
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
 
  // Jogador: escuta candidaturas próprias aceitas (não vistas)
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
 
// ─── Painel de notificações ───────────────────────────────────────────────────
function garantirPainel() {
  let painel = document.getElementById("notif-painel");
  if (painel) return painel;
 
  painel = document.createElement("div");
  painel.id = "notif-painel";
  painel.style.cssText = `
    position:fixed; top:80px; right:20px; width:320px; max-height:80vh;
    overflow-y:auto; background:#0F1A2C; border:1px solid #1e3a1e;
    border-radius:14px; padding:16px; z-index:9999;
    box-shadow:0 8px 32px rgba(0,0,0,0.6); display:none; flex-direction:column; gap:10px;
  `;
  painel.innerHTML = `<h3 style="color:#12E06C;margin:0 0 8px 0;font-size:0.95rem">🔔 Notificações</h3>
    <div id="notif-lista"></div>`;
  document.body.appendChild(painel);
 
  // Clique no sino abre/fecha o painel
  document.querySelector(".notification-icon")?.addEventListener("click", () => {
    painel.style.display = painel.style.display === "flex" ? "none" : "flex";
  });
 
  return painel;
}
 
// ─── Notificação para o CAPITÃO ───────────────────────────────────────────────
function mostrarNotificacaoCapitao(docSnap) {
  const d = docSnap.data();
  garantirPainel();
  const lista = document.getElementById("notif-lista");
  if (!lista) return;
 
  // Evita duplicar card que já existe
  if (document.getElementById(`notif-${docSnap.id}`)) return;
 
  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `
    background:#1a2a1a; border:1px solid #1e3a1e; border-radius:10px;
    padding:12px; font-size:0.85rem; color:#E6EDF3;
  `;
  card.innerHTML = `
    <p style="margin:0 0 6px 0">
      <strong style="color:#12E06C">${d.jogadorNome}</strong> quer entrar no
      <strong>${d.clube}</strong>
    </p>
    <p style="margin:0 0 10px 0;color:#A0AAB5">
      Posição: ${d.posicao} · Overall: ${d.overall}
    </p>
    <div style="display:flex;gap:8px">
      <button data-id="${docSnap.id}" data-jogador="${d.jogadorUid}" data-clube="${d.clube}"
        class="btn-aceitar"
        style="flex:1;padding:8px;background:#12E06C;color:#050B14;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">
        ✅ Aceitar
      </button>
      <button data-id="${docSnap.id}"
        class="btn-recusar"
        style="flex:1;padding:8px;background:#333;color:#fff;border:none;
               border-radius:8px;font-weight:bold;cursor:pointer">
        ❌ Recusar
      </button>
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
 
// ─── Notificação para o JOGADOR ───────────────────────────────────────────────
function mostrarNotificacaoJogador(docSnap) {
  const d = docSnap.data();
  garantirPainel();
  const lista = document.getElementById("notif-lista");
  if (!lista) return;
  if (document.getElementById(`notif-${docSnap.id}`)) return;
 
  const card = document.createElement("div");
  card.id = `notif-${docSnap.id}`;
  card.style.cssText = `
    background:#0a1f0a; border:1px solid #12E06C; border-radius:10px;
    padding:12px; font-size:0.85rem; color:#E6EDF3;
  `;
  card.innerHTML = `
    <p style="margin:0 0 10px 0">
      🎉 Você foi <strong style="color:#12E06C">aceito</strong> no clube
      <strong>${d.clube}</strong>!
    </p>
    <a href="../HTML/chat.html?chatId=${d.chatId}"
      style="display:block;text-align:center;padding:8px;background:#12E06C;
             color:#050B14;border-radius:8px;font-weight:bold;text-decoration:none">
      💬 Abrir chat do clube
    </a>
  `;
 
  // Marca como visto
  updateDoc(docSnap.ref, { jogadorViu: true });
  lista.prepend(card);
}
 
// =========================================================================
// 5. ACEITAR / RECUSAR CANDIDATURA
// =========================================================================
async function aceitarCandidatura(candidaturaId, jogadorUid, clube, card) {
  try {
    // Cria chat entre capitão e jogador
    const chatRef = await addDoc(collection(db, "chats"), {
      clube,
      participantes: [usuarioAtual.uid, jogadorUid],
      criadoEm:      serverTimestamp(),
    });
 
    // Atualiza candidatura
    await updateDoc(doc(db, "candidaturas", candidaturaId), {
      status:     "aceito",
      chatId:     chatRef.id,
      jogadorViu: false,
    });
 
    // Adiciona jogador ao clube
    await setDoc(doc(db, "jogadores", jogadorUid), {
      clubeId: chatRef.id, clube
    }, { merge: true });
 
    card.innerHTML = `<p style="color:#12E06C;margin:0;text-align:center">✅ Aceito! Chat criado.</p>
      <a href="../HTML/chat.html?chatId=${chatRef.id}"
        style="display:block;margin-top:8px;text-align:center;padding:8px;background:#12E06C;
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
// =========================================================================
// MERCADO PRO CLUBS — chat.js
// Chat em tempo real entre capitão e jogador aceito.
// Usa Firestore: chats/{chatId}/mensagens (subcoleção)
// =========================================================================

import { auth, db }               from "./firebase-config.js";
import { onAuthStateChanged }     from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc, getDoc, collection, addDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ─── Pega o chatId da URL (?chatId=xxx) ──────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const chatId = params.get("chatId");

if (!chatId) {
  document.getElementById("chat-titulo").textContent = "❌ Chat não encontrado.";
}

// ─── Aguarda login e inicializa ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../HTML/cadastrar-se.html";
    return;
  }
  if (!chatId) return;

  // Verifica se o usuário faz parte deste chat
  const chatSnap = await getDoc(doc(db, "chats", chatId));
  if (!chatSnap.exists()) {
    mostrarNegado("Chat não encontrado.");
    return;
  }

  const chatData = chatSnap.data();
  if (!chatData.participantes.includes(user.uid)) {
    mostrarNegado("Você não tem acesso a este chat.");
    return;
  }

  // Título com nome do clube
  const titulo = document.getElementById("chat-titulo");
  if (titulo) titulo.textContent = `💬 ${chatData.clube || "Chat do Clube"}`;

  // Mostra o form de envio
  document.getElementById("chat-form").style.display = "flex";

  // Carrega perfil para saber o nickname
  const perfilSnap = await getDoc(doc(db, "jogadores", user.uid));
  const perfil = perfilSnap.exists() ? perfilSnap.data() : {};
  const meuNome = perfil.nickname || user.displayName || "Jogador";

  // ─── Ouve mensagens em tempo real ──────────────────────────────────────────
  const msgRef = collection(db, "chats", chatId, "mensagens");
  const q = query(msgRef, orderBy("enviadoEm", "asc"));

  onSnapshot(q, (snap) => {
    const container = document.getElementById("chat-mensagens");
    container.innerHTML = "";

    if (snap.empty) {
      container.innerHTML = `<p style="color:#A0AAB5;text-align:center;margin:auto">
        Nenhuma mensagem ainda. Diga olá! 👋</p>`;
      return;
    }

    snap.forEach((d) => {
      const msg  = d.data();
      const minha = msg.autorUid === user.uid;
      const hora  = msg.enviadoEm?.toDate
        ? msg.enviadoEm.toDate().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : "";

      const bolha = document.createElement("div");
      bolha.className = `msg-bolha ${minha ? "msg-minha" : "msg-outro"}`;
      bolha.innerHTML = `
        ${!minha ? `<div class="msg-nome">${msg.autorNome}</div>` : ""}
        <div>${escapeHtml(msg.texto)}</div>
        <div class="msg-hora">${hora}</div>
      `;
      container.appendChild(bolha);
    });

    // Scroll para o final
    container.scrollTop = container.scrollHeight;
  });

  // ─── Enviar mensagem ───────────────────────────────────────────────────────
  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const texto = input.value.trim();
    if (!texto) return;
    input.value = "";
    input.focus();

    try {
      await addDoc(collection(db, "chats", chatId, "mensagens"), {
        texto,
        autorUid:  user.uid,
        autorNome: meuNome,
        enviadoEm: serverTimestamp(),
      });
    } catch (err) {
      console.error("Erro ao enviar:", err);
    }
  });
});

// ─── Acesso negado ────────────────────────────────────────────────────────────
function mostrarNegado(msg) {
  const main = document.querySelector(".chat-main");
  if (!main) return;
  main.innerHTML = `
    <div class="chat-negado">
      <h2>⛔ Acesso negado</h2>
      <p>${msg}</p>
      <a href="../HTML/mercado.html"
        style="color:#12E06C;font-weight:bold;text-decoration:none">
        ← Voltar ao Mercado
      </a>
    </div>`;
}

// ─── Previne XSS ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
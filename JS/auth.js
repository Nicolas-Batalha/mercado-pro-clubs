// =========================================================================
// MERCADO PRO CLUBS — auth.js
// Responsabilidade: cadastro com e-mail/senha e login com Google.
// NÃO chama initializeApp — importa auth de firebase-config.js.
// =========================================================================

import { auth }                                              from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider }
                                                             from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const googleProvider = new GoogleAuthProvider();

// ─── Utilitário: toast ────────────────────────────────────────────────────────
function toast(msg, tipo = "sucesso") {
  document.getElementById("toast-auth")?.remove();
  const el = Object.assign(document.createElement("div"), {
    id: "toast-auth",
    textContent: msg,
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
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ─── Cadastro com e-mail e senha ──────────────────────────────────────────────
const formCadastro = document.getElementById("form-cadastro");
if (formCadastro) {
  formCadastro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email  = document.getElementById("email").value.trim();
    const senha  = document.getElementById("senha").value;
    const senha1 = document.getElementById("senha1").value;

    if (senha !== senha1) {
      toast("As senhas não coincidem, craque!", "erro");
      return;
    }

    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, senha);
      toast(`Conta criada! Bem-vindo, ${user.email}`);
      setTimeout(() => (window.location.href = "../index.html"), 1200);
    } catch (err) {
      toast("Erro ao criar conta: " + err.message, "erro");
    }
  });
}

// ─── Login / Cadastro com Google ──────────────────────────────────────────────
const btnGoogle = document.getElementById("btn-google");
if (btnGoogle) {
  btnGoogle.addEventListener("click", async () => {
    try {
      const { user } = await signInWithPopup(auth, googleProvider);
      toast(`Conectado: ${user.displayName}`);
      setTimeout(() => (window.location.href = "../index.html"), 1200);
    } catch (err) {
      toast("Falha com o Google: " + err.message, "erro");
    }
  });
}

// ─── Validação de senha em tempo real (chamada pelo oninput do HTML) ──────────
window.validarSenha = function (input) {
  const senha = document.getElementById("senha")?.value;
  if (senha !== undefined) {
    input.setCustomValidity(input.value !== senha ? "As senhas não batem!" : "");
  }
};
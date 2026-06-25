// =========================================================================
// MERCADO PRO CLUBS — AUTH (Cadastro com e-mail e Google)
// =========================================================================

import { initializeApp }           from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider }
                                   from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig }          from "./firebase-config.js";

const app            = initializeApp(firebaseConfig);
const auth           = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const formCadastro = document.getElementById('form-cadastro');
const btnGoogle    = document.getElementById('btn-google');

// ─── Cadastro com e-mail e senha ─────────────────────────────────────────────
if (formCadastro) {
  formCadastro.addEventListener('submit', (e) => {
    e.preventDefault();

    const email  = document.getElementById('email').value;
    const senha  = document.getElementById('senha').value;
    const senha1 = document.getElementById('senha1').value;

    if (senha !== senha1) {
      alert("As senhas informadas não coincidem, craque!");
      return;
    }

    createUserWithEmailAndPassword(auth, email, senha)
      .then(({ user }) => {
        alert(`Conta criada! Bem-vindo ao Mercado, ${user.email}`);
        window.location.href = "../index.html";
      })
      .catch((err) => alert("Erro ao criar conta: " + err.message));
  });
}

// ─── Login / Cadastro com Google ─────────────────────────────────────────────
if (btnGoogle) {
  btnGoogle.addEventListener('click', () => {
    signInWithPopup(auth, googleProvider)
      .then(({ user }) => {
        alert(`Conectado via Google: ${user.displayName}`);
        window.location.href = "../index.html";
      })
      .catch((err) => alert("Falha ao conectar com o Google: " + err.message));
  });
}

// ─── Validação de senha em tempo real (chamada pelo oninput do HTML) ──────────
window.validarSenha = function (input) {
  const senha = document.getElementById('senha')?.value;
  if (senha !== undefined) {
    input.setCustomValidity(input.value !== senha ? 'As senhas não batem!' : '');
  }
};
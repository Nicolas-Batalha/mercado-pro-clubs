// =========================================================================
// CADASTRO-TABS.JS — lógica das abas Criar conta / Já tenho conta
// + login com e-mail e senha
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6X9ExKAaNCDdpCr-4h8rUVDMFANRB7Ag",
  authDomain: "mercado-pro-clubs.firebaseapp.com",
  projectId: "mercado-pro-clubs",
  storageBucket: "mercado-pro-clubs.firebasestorage.app",
  messagingSenderId: "1018354864332",
  appId: "1:1018354864332:web:8a60b4a80942c490c43269",
  measurementId: "G-97YN402WJF"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ─── TOAST ───────────────────────────────────────────
function mostrarToast(mensagem, tipo = 'sucesso') {
  const toast = document.createElement('div');
  toast.textContent = mensagem;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    background: ${tipo === 'sucesso' ? '#12E06C' : '#d32f2f'};
    color: #000; font-weight: bold;
    padding: 14px 22px; border-radius: 8px;
    font-family: 'Montserrat', sans-serif; font-size: 0.9rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    z-index: 9999; opacity: 0; transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.style.opacity = '1');
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── ABAS CADASTRO / LOGIN ────────────────────────────
const tabCadastro  = document.getElementById('tabCadastro');
const tabLogin     = document.getElementById('tabLogin');
const formCadastro = document.getElementById('form-cadastro');
const formLogin    = document.getElementById('form-login');

tabCadastro.addEventListener('click', () => {
  tabCadastro.classList.add('active');
  tabLogin.classList.remove('active');
  formCadastro.classList.add('active');
  formLogin.classList.remove('active');
});

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabCadastro.classList.remove('active');
  formLogin.classList.add('active');
  formCadastro.classList.remove('active');
});

// ─── LOGIN COM E-MAIL E SENHA ─────────────────────────
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('login-email').value;
  const senha = document.getElementById('login-senha').value;

  try {
    await signInWithEmailAndPassword(auth, email, senha);
    mostrarToast('Login feito! Redirecionando...');
    setTimeout(() => {
      window.location.href = '../HTML/meu-perfil.html';
    }, 1200);
  } catch (error) {
    console.error(error);
    mostrarToast('E-mail ou senha incorretos.', 'erro');
  }
});

// ─── VALIDAÇÃO DE SENHA (global para o oninput do HTML) ──
window.validarSenha = function(input) {
  const senha = document.getElementById('senha')?.value;
  if (senha !== undefined) {
    input.setCustomValidity(input.value !== senha ? 'As senhas não batem!' : '');
  }
};
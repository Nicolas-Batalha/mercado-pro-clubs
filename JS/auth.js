// Importando as funções necessárias do Firebase via CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// TODO: Você deve criar uma conta gratuita no Firebase Console,
// criar um projeto Web lá e colar as SUAS credenciais aqui:
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "mercado-pro-clubs.firebaseapp.com",
  projectId: "mercado-pro-clubs",
  storageBucket: "mercado-pro-clubs.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:123456:web:abcde12345"
};
// Inicializando o Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- CAPTURANDO ELEMENTOS DO HTML ---
const formCadastro = document.getElementById('form-cadastro');
const btnGoogle = document.getElementById('btn-google');
const btnEA = document.getElementById('btn-ea');

// --- 1. CADASTRO POR E-MAIL E SENHA ---
formCadastro.addEventListener('submit', (e) => {
  e.preventDefault(); // Impede a página de recarregar
  
  const email = document.getElementById('email').value;
  const senha = document.getElementById('senha').value;
  const senha1 = document.getElementById('senha1').value;

  if (senha !== senha1) {
    alert("As senhas não coincidem, craque!");
    return;
  }

  createUserWithEmailAndPassword(auth, email, senha)
    .then((userCredential) => {
      const user = userCredential.user;
      alert(`Conta criada com sucesso! Bem-vindo, ${user.email}`);
      window.location.href = "../index.html"; // Redireciona para a home
    })
    .catch((error) => {
      console.error("Erro ao cadastrar:", error.message);
      alert("Erro ao criar conta: " + error.message);
    });
});

// --- 2. CADASTRO / LOGIN COM GOOGLE ---
btnGoogle.addEventListener('click', () => {
  signInWithPopup(auth, googleProvider)
    .then((result) => {
      const user = result.user;
      alert(`Conectado via Google como: ${user.displayName}`);
      window.location.href = "../index.html";
    })
    .catch((error) => {
      console.error("Erro no login do Google:", error.message);
      alert("Falha ao conectar com o Google.");
    });
});

// --- 3. LOGICA AMISTOSA DA EA SPORTS ---
btnEA.addEventListener('click', () => {
  const eaID = prompt("Digite a sua ID da EA Sports (Origin Name):");
  if (eaID) {
    alert(`ID "${eaID}" salva temporariamente! No futuro, vamos guardar isso direto no seu perfil.`);
  }
});

// Função global para validar as senhas em tempo real (usada no seu HTML)
window.validarSenha = function(input) {
  const senha = document.getElementById('senha').value;
  if (input.value !== senha) {
    input.setCustomValidity('As senhas não batem!');
  } else {
    input.setCustomValidity(''); // Senhas iguais, tudo certo
  }
}
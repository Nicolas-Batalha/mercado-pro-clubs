//Importando as funções do Firebase usando a CDN oficial para rodar direto no navegador
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Credenciais oficiais do Mercado Pro Clubs
// ATENÇÃO: Se o erro "API key not valid" continuar, revise o Passo 2 abaixo!
const firebaseConfig = {
  apiKey: "AIzaSyA6X9ExKAaNCDdpCr-4h8rUVDMFANRB7Ag", 
  authDomain: "mercado-pro-clubs.firebaseapp.com",
  projectId: "mercado-pro-clubs",
  storageBucket: "mercado-pro-clubs.firebasestorage.app",
  messagingSenderId: "1018354864332",
  appId: "1:1018354864332:web:8a60b4a80942c490c43269",
  measurementId: "G-97YN402WJF"
};

// Inicializando os serviços do Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- MAPEANDO ELEMENTOS DA INTERFACE (HTML) ---
const formCadastro = document.getElementById('form-cadastro');
const btnGoogle = document.getElementById('btn-google');

// --- 1. FUNÇÃO: CADASTRO COM E-MAIL E SENHA ---
if (formCadastro) {
  formCadastro.addEventListener('submit', (e) => {
    e.preventDefault(); // Impede o recarregamento automático da página
    
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const senha1 = document.getElementById('senha1').value;

    // Verificação de segurança extra para senhas diferentes
    if (senha !== senha1) {
      alert("As senhas informadas não coincidem, craque!");
      return;
    }

    createUserWithEmailAndPassword(auth, email, senha)
      .then((userCredential) => {
        const user = userCredential.user;
        alert(`Conta criada com sucesso! Bem-vindo ao Mercado, ${user.email}`);
        window.location.href = "../index.html"; // Redireciona de volta para a Home
      })
      .catch((error) => {
        console.error("Erro no cadastro:", error.message);
        alert("Erro ao criar conta: " + error.message);
      });
  });
}

// --- 2. FUNÇÃO: CADASTRO / LOGIN COM O GOOGLE ---
if (btnGoogle) {
  btnGoogle.addEventListener('click', () => {
    signInWithPopup(auth, googleProvider)
      .then((result) => {
        const user = result.user;
        alert(`Conectado com sucesso via Google: ${user.displayName}`);
        window.location.href = "../index.html"; // Redireciona para a Home
      })
      .catch((error) => {
        console.error("Erro no login do Google:", error.message);
        alert("Falha ao conectar com sua Conta Google. Verifique as configurações do Firebase.");
      });
  });
}

// --- 3. VALIDAÇÃO DE SENHA EM TEMPO REAL ---
// Tornando a função visível globalmente para o atributo oninput do HTML
window.validarSenha = function(input) {
  const senhaElement = document.getElementById('senha');
  if (senhaElement) {
    const senha = senhaElement.value;
    if (input.value !== senha) {
      input.setCustomValidity('As senhas não batem!');
    } else {
      input.setCustomValidity(''); // Tudo limpo e validado
    }
  }
};
// =========================================================================
// MERCADO PRO CLUBS - PERFIL DO JOGADOR (com Firebase Firestore)
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURAÇÃO DO FIREBASE (mesmo do auth.js) ---
const firebaseConfig = {
  apiKey: "AIzaSyA6X9ExKAaNCDdpCr-4h8rUVDMFANRB7Ag",
  authDomain: "mercado-pro-clubs.firebaseapp.com",
  projectId: "mercado-pro-clubs",
  storageBucket: "mercado-pro-clubs.firebasestorage.app",
  messagingSenderId: "1018354864332",
  appId: "1:1018354864332:web:8a60b4a80942c490c43269",
  measurementId: "G-97YN402WJF"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Guarda o uid do usuário logado
let uidAtual = null;

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

// ─── INDEXEDDB PARA A FOTO (fica local, foto é pesada para nuvem gratuita) ───
const DB_NOME = 'mercadoProClubs';
const DB_STORE = 'fotoPerfil';

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject('Erro ao abrir IndexedDB');
  });
}

async function salvarFotoIndexedDB(arquivo) {
  try {
    const db = await abrirDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(arquivo, 'foto');
  } catch (e) {
    console.warn('Não foi possível salvar a foto:', e);
  }
}

async function carregarFotoIndexedDB() {
  try {
    const dbLocal = await abrirDB();
    return new Promise((resolve) => {
      const req = dbLocal.transaction(DB_STORE).objectStore(DB_STORE).get('foto');
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// ─── PRÉ-VISUALIZAÇÃO DA FOTO ────────────────────────
const inputUpload = document.getElementById('upload-foto');
const fotoPreview = document.getElementById('foto-perfil-preview');

if (inputUpload) {
  inputUpload.addEventListener('change', function (event) {
    const arquivo = event.target.files[0];
    if (!arquivo) return;
    fotoPreview.src = URL.createObjectURL(arquivo);
    salvarFotoIndexedDB(arquivo);
  });
}

// ─── AGENTE LIVRE ────────────────────────────────────
const inputClube = document.getElementById('clube-atual');
const checkAgenteLivre = document.getElementById('agente-livre');

if (checkAgenteLivre && inputClube) {
  checkAgenteLivre.addEventListener('change', function () {
    if (this.checked) {
      inputClube.value = 'Sem Clube (Free Agent)';
      inputClube.disabled = true;
      inputClube.style.opacity = '0.5';
    } else {
      inputClube.value = '';
      inputClube.disabled = false;
      inputClube.style.opacity = '1';
    }
  });
}

// ─── PREENCHER FORMULÁRIO COM OS DADOS SALVOS ────────
function preencherFormulario(dados) {
  if (!dados) return;

  const campos = [
    ['nickname', 'nickname'],
    ['eaId', 'ea-id'],
    ['altura', 'altura'],
    ['peso', 'peso'],
    ['clube', 'clube-atual'],
  ];

  campos.forEach(([chave, id]) => {
    const el = document.getElementById(id);
    if (el && dados[chave]) el.value = dados[chave];
  });

  // Agente livre
  if (dados.agenteLivre && checkAgenteLivre && inputClube) {
    checkAgenteLivre.checked = true;
    inputClube.value = 'Sem Clube (Free Agent)';
    inputClube.disabled = true;
    inputClube.style.opacity = '0.5';
  }

  // Posição
  if (dados.posicao) {
    const radioPos = document.querySelector(`input[name="posicao"][value="${dados.posicao}"]`);
    if (radioPos) radioPos.checked = true;
  }

  // Plataforma
  if (dados.plataforma) {
    const radioPlat = document.querySelector(`input[name="plataforma"][value="${dados.plataforma}"]`);
    if (radioPlat) radioPlat.checked = true;
  }
}

// ─── CARREGAR PERFIL DO FIRESTORE ────────────────────
async function carregarPerfil(uid) {
  try {
    // Busca o documento do usuário na coleção "jogadores"
    const ref = doc(db, 'jogadores', uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      preencherFormulario(snap.data());
      mostrarToast('Perfil carregado! 👋', 'sucesso');
    }
    // Se não existir ainda, o formulário fica vazio para o usuário preencher
  } catch (e) {
    console.error('Erro ao carregar perfil:', e);
  }
}

// ─── SALVAR PERFIL NO FIRESTORE ──────────────────────
const formDados = document.getElementById('form-dados-jogador');

if (formDados) {
  formDados.addEventListener('submit', async function (event) {
    event.preventDefault();

    if (!uidAtual) {
      mostrarToast('Você precisa estar logado para salvar.', 'erro');
      return;
    }

    const posicaoSelecionada    = document.querySelector('input[name="posicao"]:checked');
    const plataformaSelecionada = document.querySelector('input[name="plataforma"]:checked');

    // Monta o objeto com os dados do jogador
    const dadosJogador = {
      nickname:    document.getElementById('nickname').value.trim(),
      eaId:        document.getElementById('ea-id').value.trim(),
      altura:      document.getElementById('altura').value,
      peso:        document.getElementById('peso').value,
      clube:       document.getElementById('clube-atual').value.trim(),
      agenteLivre: checkAgenteLivre ? checkAgenteLivre.checked : false,
      posicao:     posicaoSelecionada    ? posicaoSelecionada.value    : '',
      plataforma:  plataformaSelecionada ? plataformaSelecionada.value : '',
      atualizadoEm: new Date().toISOString(),
    };

    try {
      // Salva (ou sobrescreve) o documento do usuário no Firestore
      // Caminho: coleção "jogadores" → documento com o uid do usuário
      await setDoc(doc(db, 'jogadores', uidAtual), dadosJogador);
      mostrarToast('Perfil salvo na nuvem com sucesso! ☁️');
    } catch (e) {
      console.error('Erro ao salvar perfil:', e);
      mostrarToast('Erro ao salvar. Tente novamente.', 'erro');
    }
  });
}

// ─── DETECTAR LOGIN E INICIAR ────────────────────────
// Fica escutando se o usuário está logado ou não
onAuthStateChanged(auth, async (usuario) => {
  if (usuario) {
    // Usuário logado: guarda o uid e carrega o perfil dele
    uidAtual = usuario.uid;

    // Mostra o email no header se houver um elemento para isso
    const elEmail = document.getElementById('usuario-email');
    if (elEmail) elEmail.textContent = usuario.email;

    await carregarPerfil(usuario.uid);

    // Carrega foto local (IndexedDB)
    const fotoSalva = await carregarFotoIndexedDB();
    if (fotoSalva && fotoPreview) {
      fotoPreview.src = URL.createObjectURL(fotoSalva);
    }

  } else {
    // Usuário NÃO logado: redireciona para o cadastro
    mostrarToast('Faça login para acessar seu perfil.', 'erro');
    setTimeout(() => {
      window.location.href = '../HTML/cadastrar-se.html';
    }, 2000);
  }
});
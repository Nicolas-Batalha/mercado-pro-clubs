// =========================================================================
// MERCADO PRO CLUBS - PERFIL DO JOGADOR (com Firebase Firestore)
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ─── 1. CONFIGURAÇÃO DO FIREBASE ─────────────────────
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

let uidAtual = null; // Guarda o ID do usuário logado

// ─── 2. FUNÇÕES DE INTERFACE (UI) ────────────────────
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

// ─── 3. LÓGICA DE FOTO LOCAL (IndexedDB) ─────────────
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
    const dbLocal = await abrirDB();
    const tx = dbLocal.transaction(DB_STORE, 'readwrite');
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

// ─── 4. LÓGICA DO BANCO DE DADOS (Firestore) ─────────

// NOVO: Função que busca os dados no Firestore e preenche a tela
async function carregarPerfil(uid) {
  try {
    const docRef = doc(db, 'jogadores', uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const dadosJogador = docSnap.data();
      preencherFormulario(dadosJogador);
    } else {
      console.log("Nenhum perfil encontrado. O usuário precisa preencher e salvar pela primeira vez.");
    }
  } catch (erro) {
    console.error("Erro ao buscar dados do perfil:", erro);
    mostrarToast("Erro ao carregar seu perfil.", "erro");
  }
}

function preencherFormulario(dados) {
  if (!dados) return;

  const campos = [
    ['nickname', 'nickname'],
    ['eaId', 'ea-id'],
    ['altura', 'altura'],
    ['peso', 'peso'],
    ['clube', 'clube-atual'],
    ['overall', 'overall'], 
    ['nivel', 'nivel']       
  ];

  campos.forEach(([chave, id]) => {
    const el = document.getElementById(id);
    if (el && dados[chave] !== undefined) el.value = dados[chave];
  });

  // Agente livre
  const inputClube = document.getElementById('clube-atual');
  const checkAgenteLivre = document.getElementById('agente-livre');
  if (dados.agenteLivre && checkAgenteLivre && inputClube) {
    checkAgenteLivre.checked = true;
    inputClube.value = 'Sem Clube (Free Agent)';
    inputClube.disabled = true;
    inputClube.style.opacity = '0.5';
  }

  // Posição e Plataforma (Radios)
  if (dados.posicao) {
    const radioPos = document.querySelector(`input[name="posicao"][value="${dados.posicao}"]`);
    if (radioPos) radioPos.checked = true;
  }
  if (dados.plataforma) {
    const radioPlat = document.querySelector(`input[name="plataforma"][value="${dados.plataforma}"]`);
    if (radioPlat) radioPlat.checked = true;
  }
}

// ─── 5. EVENTOS DOS ELEMENTOS DA TELA ────────────────

// Preview e Upload da Foto
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

// Checkbox Agente Livre
const inputClubeEl = document.getElementById('clube-atual');
const checkAgenteLivreEl = document.getElementById('agente-livre');
if (checkAgenteLivreEl && inputClubeEl) {
  checkAgenteLivreEl.addEventListener('change', function () {
    if (this.checked) {
      inputClubeEl.value = 'Sem Clube (Free Agent)';
      inputClubeEl.disabled = true;
      inputClubeEl.style.opacity = '0.5';
    } else {
      inputClubeEl.value = '';
      inputClubeEl.disabled = false;
      inputClubeEl.style.opacity = '1';
    }
  });
}

// Botão de Salvar Perfil
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
    const checkAgenteLivre      = document.getElementById('agente-livre');

    // Monta o objeto com proteção (?.) para evitar o erro de 'null'
    const dadosJogador = {
      nickname:    document.getElementById('nickname')?.value.trim() || '',
      eaId:        document.getElementById('ea-id')?.value.trim() || '',
      overall:     parseInt(document.getElementById('overall')?.value) || 80,
      nivel:       parseInt(document.getElementById('nivel')?.value) || 1,
      altura:      document.getElementById('altura')?.value || '', 
      peso:        document.getElementById('peso')?.value || '',
      clube:       document.getElementById('clube-atual')?.value.trim() || '',
      agenteLivre: checkAgenteLivre ? checkAgenteLivre.checked : false,
      posicao:     posicaoSelecionada    ? posicaoSelecionada.value    : '',
      plataforma:  plataformaSelecionada ? plataformaSelecionada.value : '',
      atualizadoEm: new Date().toISOString(),
    };

    try {
      // Cria um estilo visual no botão enquanto salva
      const btnSalvar = formDados.querySelector('button[type="submit"]');
      const textoOriginal = btnSalvar.textContent;
      btnSalvar.textContent = "Salvando...";
      btnSalvar.disabled = true;

      await setDoc(doc(db, 'jogadores', uidAtual), dadosJogador);
      mostrarToast('Perfil salvo na nuvem com sucesso! ☁️');

      // Restaura o botão
      btnSalvar.textContent = textoOriginal;
      btnSalvar.disabled = false;

    } catch (e) {
      console.error('Erro ao salvar perfil:', e);
      mostrarToast('Erro ao salvar. Tente novamente.', 'erro');
    }
  });
}

// ─── 6. DETECTAR LOGIN E INICIAR TUDO ────────────────
onAuthStateChanged(auth, async (usuario) => {
  if (usuario) {
    // 1. Salva o ID
    uidAtual = usuario.uid;

    // 2. Coloca o email no topo (se houver)
    const elEmail = document.getElementById('usuario-email');
    if (elEmail) elEmail.textContent = usuario.email;

    // 3. Busca os dados no Banco e preenche a tela
    await carregarPerfil(usuario.uid);

    // 4. Carrega a foto local salva
    const fotoSalva = await carregarFotoIndexedDB();
    if (fotoSalva && fotoPreview) {
      fotoPreview.src = URL.createObjectURL(fotoSalva);
    }

  } else {
    // Se não estiver logado, chuta pra página de login
    mostrarToast('Faça login para acessar seu perfil.', 'erro');
    setTimeout(() => {
      window.location.href = '../HTML/cadastrar-se.html';
    }, 2000);
  }
});
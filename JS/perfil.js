// =========================================================================
// MERCADO PRO CLUBS — PERFIL DO JOGADOR
// =========================================================================

import { initializeApp }                    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged }      from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig }                   from "./firebase-config.js";

const auth = getAuth(initializeApp(firebaseConfig));
const db   = getFirestore();

let uidAtual = null;

// ─── Toast ────────────────────────────────────────────────────────────────────
function mostrarToast(mensagem, tipo = 'sucesso') {
  const toast = document.createElement('div');
  toast.textContent = mensagem;
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;
    background:${tipo === 'sucesso' ? '#12E06C' : '#d32f2f'};
    color:#000;font-weight:bold;padding:14px 22px;border-radius:8px;
    font-family:'Montserrat',sans-serif;font-size:0.9rem;
    box-shadow:0 4px 16px rgba(0,0,0,0.4);z-index:9999;
    opacity:0;transition:opacity 0.3s;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = '1'));
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── IndexedDB (foto local) ───────────────────────────────────────────────────
const DB_NOME  = 'mercadoProClubs';
const DB_STORE = 'fotoPerfil';

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(DB_STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = () => reject('Erro ao abrir IndexedDB');
  });
}

async function salvarFotoIndexedDB(arquivo) {
  try {
    const idb = await abrirDB();
    idb.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(arquivo, 'foto');
  } catch (e) {
    console.warn('Não foi possível salvar a foto:', e);
  }
}

async function carregarFotoIndexedDB() {
  try {
    const idb = await abrirDB();
    return new Promise((resolve) => {
      const req = idb.transaction(DB_STORE).objectStore(DB_STORE).get('foto');
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror   = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// ─── Firestore ────────────────────────────────────────────────────────────────
async function carregarPerfil(uid) {
  try {
    const snap = await getDoc(doc(db, 'jogadores', uid));
    if (snap.exists()) preencherFormulario(snap.data());
  } catch (err) {
    console.error("Erro ao buscar perfil:", err);
    mostrarToast("Erro ao carregar seu perfil.", "erro");
  }
}

function preencherFormulario(dados) {
  if (!dados) return;

  [
    ['nickname',  'nickname'],
    ['eaId',      'ea-id'],
    ['altura',    'altura'],
    ['peso',      'peso'],
    ['clube',     'clube-atual'],
    ['overall',   'overall'],
    ['nivel',     'nivel'],
  ].forEach(([chave, id]) => {
    const el = document.getElementById(id);
    if (el && dados[chave] !== undefined) el.value = dados[chave];
  });

  const inputClube       = document.getElementById('clube-atual');
  const checkAgenteLivre = document.getElementById('agente-livre');
  if (dados.agenteLivre && checkAgenteLivre && inputClube) {
    checkAgenteLivre.checked = true;
    inputClube.value    = 'Sem Clube (Free Agent)';
    inputClube.disabled = true;
    inputClube.style.opacity = '0.5';
  }

  if (dados.posicao) {
    const radio = document.querySelector(`input[name="posicao"][value="${dados.posicao}"]`);
    if (radio) radio.checked = true;
  }
  if (dados.plataforma) {
    const radio = document.querySelector(`input[name="plataforma"][value="${dados.plataforma}"]`);
    if (radio) radio.checked = true;
  }
}

// ─── Foto (upload) ────────────────────────────────────────────────────────────
const inputUpload = document.getElementById('upload-foto');
const fotoPreview = document.getElementById('foto-perfil-preview');

if (inputUpload) {
  inputUpload.addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    fotoPreview.src = URL.createObjectURL(arquivo);
    salvarFotoIndexedDB(arquivo);
  });
}

// ─── Agente Livre ─────────────────────────────────────────────────────────────
const inputClubeEl      = document.getElementById('clube-atual');
const checkAgenteLivreEl = document.getElementById('agente-livre');

if (checkAgenteLivreEl && inputClubeEl) {
  checkAgenteLivreEl.addEventListener('change', function () {
    if (this.checked) {
      inputClubeEl.value   = 'Sem Clube (Free Agent)';
      inputClubeEl.disabled = true;
      inputClubeEl.style.opacity = '0.5';
    } else {
      inputClubeEl.value   = '';
      inputClubeEl.disabled = false;
      inputClubeEl.style.opacity = '1';
    }
  });
}

// ─── Salvar perfil ────────────────────────────────────────────────────────────
const formDados = document.getElementById('form-dados-jogador');

if (formDados) {
  formDados.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!uidAtual) { mostrarToast('Você precisa estar logado para salvar.', 'erro'); return; }

    const dadosJogador = {
      nickname:    document.getElementById('nickname')?.value.trim()    || '',
      eaId:        document.getElementById('ea-id')?.value.trim()       || '',
      overall:     parseInt(document.getElementById('overall')?.value)  || 80,
      nivel:       parseInt(document.getElementById('nivel')?.value)    || 1,
      altura:      document.getElementById('altura')?.value             || '',
      peso:        document.getElementById('peso')?.value               || '',
      clube:       document.getElementById('clube-atual')?.value.trim() || '',
      agenteLivre: document.getElementById('agente-livre')?.checked     || false,
      posicao:     document.querySelector('input[name="posicao"]:checked')?.value    || '',
      plataforma:  document.querySelector('input[name="plataforma"]:checked')?.value || '',
      atualizadoEm: new Date().toISOString(),
    };

    const btn = formDados.querySelector('button[type="submit"]');
    const textoOriginal = btn.textContent;
    btn.textContent = "Salvando...";
    btn.disabled = true;

    try {
      await setDoc(doc(db, 'jogadores', uidAtual), dadosJogador);
      mostrarToast('Perfil salvo na nuvem com sucesso! ☁️');
    } catch (err) {
      console.error('Erro ao salvar perfil:', err);
      mostrarToast('Erro ao salvar. Tente novamente.', 'erro');
    } finally {
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }
  });
}

// ─── Init: detectar login ─────────────────────────────────────────────────────
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    mostrarToast('Faça login para acessar seu perfil.', 'erro');
    setTimeout(() => { window.location.href = '../HTML/cadastrar-se.html'; }, 2000);
    return;
  }

  uidAtual = usuario.uid;
  await carregarPerfil(usuario.uid);

  const fotoSalva = await carregarFotoIndexedDB();
  if (fotoSalva && fotoPreview) fotoPreview.src = URL.createObjectURL(fotoSalva);
});
// =========================================================================
// MERCADO PRO CLUBS - PERFIL DO JOGADOR
// =========================================================================

// --- 1. PRÉ-VISUALIZAÇÃO DA FOTO ---
const inputUpload = document.getElementById('upload-foto');
const fotoPreview = document.getElementById('foto-perfil-preview');

// FIX: usa URL.createObjectURL para preview (sem estourar o LocalStorage)
// A URL temporária dura enquanto a aba estiver aberta — ao recarregar,
// carrega a foto salva em IndexedDB (veja seção 4).
if (inputUpload) {
  inputUpload.addEventListener('change', function(event) {
    const arquivo = event.target.files[0];
    if (!arquivo) return;

    // Preview imediato sem Base64
    const urlTemporaria = URL.createObjectURL(arquivo);
    fotoPreview.src = urlTemporaria;

    // Salva o arquivo em IndexedDB para persistir entre sessões
    salvarFotoIndexedDB(arquivo);
  });
}

// --- 2. LÓGICA DO AGENTE LIVRE ---
const inputClube = document.getElementById('clube-atual');
const checkAgenteLivre = document.getElementById('agente-livre');

if (checkAgenteLivre && inputClube) {
  checkAgenteLivre.addEventListener('change', function() {
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

// --- 3. TOAST (substitui alert) ---
function mostrarToast(mensagem, tipo = 'sucesso') {
  const toast = document.createElement('div');
  toast.textContent = mensagem;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    background: ${tipo === 'sucesso' ? '#12E06C' : '#d32f2f'};
    color: #000; font-weight: bold;
    padding: 14px 22px; border-radius: 8px;
    font-family: 'Poppins', sans-serif; font-size: 0.9rem;
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

// --- 4. INDEXEDDB PARA A FOTO ---
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
    const db = await abrirDB();
    return new Promise((resolve) => {
      const req = db.transaction(DB_STORE).objectStore(DB_STORE).get('foto');
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// --- 5. SALVAR E CARREGAR DADOS ---
const formDados = document.getElementById('form-dados-jogador');

// FIX: função auxiliar para carregar um campo com segurança (limite de tamanho)
function carregarCampo(chave, idElemento, tamanhoMax = 100) {
  const valor = localStorage.getItem(chave);
  if (!valor) return;
  const el = document.getElementById(idElemento);
  if (el) el.value = valor.substring(0, tamanhoMax);
}

// Carregar dados salvos ao abrir a página
document.addEventListener('DOMContentLoaded', async () => {
  carregarCampo('nickname',  'nickname',    50);
  carregarCampo('eaId',      'ea-id',       50);
  carregarCampo('altura',    'altura',       3);
  carregarCampo('peso',      'peso',         3);
  carregarCampo('clube',     'clube-atual', 60);

  // FIX: restaura estado do agente livre
  const agenteLivreSalvo = localStorage.getItem('agenteLivre') === 'true';
  if (agenteLivreSalvo && checkAgenteLivre && inputClube) {
    checkAgenteLivre.checked = true;
    inputClube.value = 'Sem Clube (Free Agent)';
    inputClube.disabled = true;
    inputClube.style.opacity = '0.5';
  }

  // Carregar rádio da Posição
  const posSalva = localStorage.getItem('posicao');
  if (posSalva) {
    const radioPos = document.querySelector(`input[name="posicao"][value="${posSalva}"]`);
    if (radioPos) radioPos.checked = true;
  }

  // Carregar rádio da Plataforma
  const platSalva = localStorage.getItem('plataforma');
  if (platSalva) {
    const radioPlat = document.querySelector(`input[name="plataforma"][value="${platSalva}"]`);
    if (radioPlat) radioPlat.checked = true;
  }

  // FIX: carrega foto do IndexedDB
  const fotoSalva = await carregarFotoIndexedDB();
  if (fotoSalva && fotoPreview) {
    fotoPreview.src = URL.createObjectURL(fotoSalva);
  }
});

// Salvar dados no Submit
if (formDados) {
  formDados.addEventListener('submit', function(event) {
    event.preventDefault();

    const posicaoSelecionada   = document.querySelector('input[name="posicao"]:checked');
    const plataformaSelecionada = document.querySelector('input[name="plataforma"]:checked');

    localStorage.setItem('nickname',    document.getElementById('nickname').value.trim());
    localStorage.setItem('eaId',        document.getElementById('ea-id').value.trim());
    localStorage.setItem('altura',      document.getElementById('altura').value);
    localStorage.setItem('peso',        document.getElementById('peso').value);
    localStorage.setItem('clube',       document.getElementById('clube-atual').value.trim());
    localStorage.setItem('agenteLivre', checkAgenteLivre ? checkAgenteLivre.checked : false); // FIX
    if (posicaoSelecionada)    localStorage.setItem('posicao',   posicaoSelecionada.value);
    if (plataformaSelecionada) localStorage.setItem('plataforma', plataformaSelecionada.value);

    mostrarToast('Perfil atualizado com sucesso!'); // FIX: toast no lugar de alert
  });
}
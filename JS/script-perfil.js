// --- 1. PRÉ-VISUALIZAÇÃO DA FOTO ---
const inputUpload = document.getElementById('upload-foto');
const fotoPreview = document.getElementById('foto-perfil-preview');

if (inputUpload) {
  inputUpload.addEventListener('change', function(event) {
    const arquivo = event.target.files[0];
    if (arquivo) {
      const leitor = new FileReader();
      leitor.onload = function(e) {
        fotoPreview.src = e.target.result;
        localStorage.setItem('fotoPerfil', e.target.result); // Salva a foto em formato texto
      };
      leitor.readAsDataURL(arquivo);
    }
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

// --- 3. SALVAR E CARREGAR DADOS ---
const formDados = document.getElementById('form-dados-jogador');

// Carregar dados salvos ao abrir a página
document.addEventListener('DOMContentLoaded', () => {
  if(localStorage.getItem('nickname')) document.getElementById('nickname').value = localStorage.getItem('nickname');
  if(localStorage.getItem('eaId')) document.getElementById('ea-id').value = localStorage.getItem('eaId');
  if(localStorage.getItem('altura')) document.getElementById('altura').value = localStorage.getItem('altura');
  if(localStorage.getItem('peso')) document.getElementById('peso').value = localStorage.getItem('peso');
  if(localStorage.getItem('clube')) document.getElementById('clube-atual').value = localStorage.getItem('clube');
  if(localStorage.getItem('fotoPerfil')) fotoPreview.src = localStorage.getItem('fotoPerfil');

  // Carregar rádio da Posição
  const posSalva = localStorage.getItem('posicao');
  if(posSalva) {
    const radioPos = document.querySelector(`input[name="posicao"][value="${posSalva}"]`);
    if(radioPos) radioPos.checked = true;
  }

  // Carregar rádio da Plataforma
  const platSalva = localStorage.getItem('plataforma');
  if(platSalva) {
    const radioPlat = document.querySelector(`input[name="plataforma"][value="${platSalva}"]`);
    if(radioPlat) radioPlat.checked = true;
  }
});

// Salvar dados no Submit
if (formDados) {
  formDados.addEventListener('submit', function(event) {
    event.preventDefault(); 
    
    const posicaoSelecionada = document.querySelector('input[name="posicao"]:checked');
    const plataformaSelecionada = document.querySelector('input[name="plataforma"]:checked');

    localStorage.setItem('nickname', document.getElementById('nickname').value);
    localStorage.setItem('eaId', document.getElementById('ea-id').value);
    localStorage.setItem('altura', document.getElementById('altura').value);
    localStorage.setItem('peso', document.getElementById('peso').value);
    localStorage.setItem('clube', document.getElementById('clube-atual').value);
    if(posicaoSelecionada) localStorage.setItem('posicao', posicaoSelecionada.value);
    if(plataformaSelecionada) localStorage.setItem('plataforma', plataformaSelecionada.value);
    
    alert(`Perfil do Mercado Pro Clubs atualizado com sucesso!`);
  });
}
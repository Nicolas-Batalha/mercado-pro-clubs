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
      };
      leitor.readAsDataURL(arquivo);
    }
  });
}

// --- 2. LÓGICA DO AGENTE LIVRE (FREE AGENT) ---
const inputClube = document.getElementById('clube-atual');
const checkAgenteLivre = document.getElementById('agente-livre');

if (checkAgenteLivre && inputClube) {
  checkAgenteLivre.addEventListener('change', function() {
    if (this.checked) {
      // Se marcou a caixinha: preenche automático, bloqueia o campo e muda a cor
      inputClube.value = 'Sem Clube (Free Agent)';
      inputClube.disabled = true;
      inputClube.style.opacity = '0.5';
    } else {
      // Se desmarcou: limpa o campo e libera para digitar de novo
      inputClube.value = '';
      inputClube.disabled = false;
      inputClube.style.opacity = '1';
    }
  });
}

// --- 3. SALVAR DADOS DO JOGADOR ---
const formDados = document.getElementById('form-dados-jogador');

if (formDados) {
  formDados.addEventListener('submit', function(event) {
    event.preventDefault(); 
    
    // Captura os valores antigos
    const nickname = document.getElementById('nickname').value;
    const eaId = document.getElementById('ea-id').value;
    const altura = document.getElementById('altura').value;
    const peso = document.getElementById('peso').value;
    const clube = document.getElementById('clube-atual').value;
    const plataforma = document.getElementById('plataforma').value;
    
    // Captura a POSIÇÃO SELECIONADA (procura qual rádio com name="posicao" está checado)
    const posicaoSelecionada = document.querySelector('input[name="posicao"]:checked');
    const posicao = posicaoSelecionada ? posicaoSelecionada.value : 'Não informada';
    
    console.log("=== Dados Completos do Perfil ===");
    console.log("Nickname:", nickname);
    console.log("EA ID:", eaId);
    console.log("Altura:", altura + " cm");
    console.log("Peso:", peso + " kg");
    console.log("Clube Atual:", clube);
    console.log("Posição Principal:", posicao);
    console.log("qual plataforma joga:",plataforma)
    
    alert(`Perfil atualizado! Bem-vindo, novo ${posicao} do Mercado Pro Clubs!`);
  });
}
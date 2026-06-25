// =========================================================================
// MERCADO PRO CLUBS — CENTRAL DE RECRUTAMENTO (LFG / Times)
// =========================================================================

const TEMPO_EXPIRACAO = 2 * 60 * 60 * 1000; // 2 horas

let vagasClubes = JSON.parse(localStorage.getItem('vagasClubes')) || [];

// Dados de exemplo na primeira vez
if (!vagasClubes.length) {
  vagasClubes = [{
    id:        Date.now() - 1500000,
    clube:     "Brazucas FC",
    plataforma:"xboxO",
    posicao:   "vol",
    jogo:      "eafc25",
    estilo:    "competitivo",
    descricao: "Clube focado em campeonatos. Precisamos de um volante (VOL) que saiba sair jogando e tenha microfone. Treinos terça e quinta às 20h."
  }];
  salvarNoBanco();
}

// ─── Banco local ──────────────────────────────────────────────────────────────
function salvarNoBanco() {
  localStorage.setItem('vagasClubes', JSON.stringify(vagasClubes));
}

function limparPostsAntigos() {
  const antes = vagasClubes.length;
  vagasClubes = vagasClubes.filter(v => (Date.now() - v.id) < TEMPO_EXPIRACAO);
  if (vagasClubes.length !== antes) salvarNoBanco();
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
function calcularTempoDecorrido(ts) {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1)  return "Agora mesmo";
  if (min < 60) return `Há ${min} min`;
  return `Há ${Math.floor(min / 60)} hora(s)`;
}

function mostrarToast(mensagem, tipo = 'sucesso') {
  const toast = document.createElement('div');
  toast.textContent = mensagem;
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;
    background:${tipo === 'sucesso' ? '#12E06C' : '#d32f2f'};
    color:#000;font-weight:bold;padding:14px 22px;border-radius:8px;
    font-family:'Poppins',sans-serif;font-size:0.9rem;
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

window.deletarVaga = function (id) {
  if (!confirm("Tem certeza que deseja apagar esta vaga?")) return;
  vagasClubes = vagasClubes.filter(v => v.id !== id);
  salvarNoBanco();
  aplicarFiltros();
};

// ─── Plataformas ──────────────────────────────────────────────────────────────
const CONFIG_PLATAFORMAS = {
  xboxS:   { classe: 'badge-xbox', nome: 'Xbox Series X/S' },
  xboxO:   { classe: 'badge-xbox', nome: 'Xbox One' },
  ps5:     { classe: 'badge-ps5',  nome: 'PlayStation 5' },
  ps4:     { classe: 'badge-ps5',  nome: 'PlayStation 4' },
  pc:      { classe: 'badge-pc',   nome: 'PC' },
  switch2: { classe: 'badge-pc',   nome: 'Switch 2' },
  switch:  { classe: 'badge-pc',   nome: 'Switch' },
};

// ─── Renderização ─────────────────────────────────────────────────────────────
const feedLfg = document.getElementById('lfg-feed');

function renderizarFeed(vagas) {
  if (!feedLfg) return;

  if (!vagas.length) {
    feedLfg.innerHTML = '<p style="text-align:center;color:#aaa;margin-top:20px;font-style:italic;">Nenhuma vaga encontrada. Seja o primeiro a anunciar!</p>';
    return;
  }

  feedLfg.innerHTML = vagas.map(vaga => {
    const plat  = CONFIG_PLATAFORMAS[vaga.plataforma] || { classe: 'badge-pc', nome: vaga.plataforma };
    const pos   = vaga.posicao.toUpperCase();
    const estilo = vaga.estilo.charAt(0).toUpperCase() + vaga.estilo.slice(1);
    const jogo  = (vaga.jogo || '').toUpperCase() || 'EAFC';
    const tempo = calcularTempoDecorrido(vaga.id);

    return `
      <div class="lfg-card">
        <div class="card-topo">
          <span class="badge ${plat.classe}">${plat.nome}</span>
          <span class="badge badge-vaga">VAGA: ${pos}</span>
          <span class="badge badge-posicao">${jogo}</span>
          <div style="margin-left:auto;display:flex;align-items:center;gap:10px;">
            <span style="color:#888;font-size:0.8rem;">${tempo}</span>
            <button class="btn-excluir" onclick="deletarVaga(${vaga.id})">Excluir</button>
          </div>
        </div>
        <div class="card-corpo">
          <h4 class="nome-clube">${vaga.clube}</h4>
          <p class="descricao">${vaga.descricao}</p>
        </div>
        <div class="card-rodape">
          <span class="estilo-jogo">${estilo}</span>
          <button class="btn-chamar" onclick="mostrarToast('Funcionalidade de mensagem em breve!')">Pedir Teste</button>
        </div>
      </div>`;
  }).join('');
}

// ─── Filtros ──────────────────────────────────────────────────────────────────
const filtroPlataforma = document.getElementById('filtro-plataforma');
const filtroPosicao    = document.getElementById('filtro-posicao');
const filtroJogo       = document.getElementById('filtro-jogo');

function aplicarFiltros() {
  const plat = filtroPlataforma?.value || 'todas';
  const pos  = filtroPosicao?.value    || 'todas';
  const jogo = filtroJogo?.value       || 'todas';

  const filtradas = vagasClubes.filter(v =>
    (plat === 'todas' || v.plataforma === plat) &&
    (pos  === 'todas' || v.posicao    === pos)  &&
    (jogo === 'todas' || v.jogo       === jogo)
  );

  renderizarFeed(filtradas);
}

if (filtroPlataforma) filtroPlataforma.addEventListener('change', aplicarFiltros);
if (filtroPosicao)    filtroPosicao.addEventListener('change', aplicarFiltros);
if (filtroJogo)       filtroJogo.addEventListener('change', aplicarFiltros);

// ─── Publicar vaga ────────────────────────────────────────────────────────────
const formLfg = document.getElementById('form-lfg');

if (formLfg) {
  formLfg.addEventListener('submit', (e) => {
    e.preventDefault();

    const novaVaga = {
      id:        Date.now(),
      clube:     document.getElementById('post-clube').value,
      plataforma:document.getElementById('post-plataforma').value,
      posicao:   document.getElementById('post-posicao').value,
      jogo:      document.getElementById('post-jogo')?.value || 'eafc25',
      estilo:    document.getElementById('post-estilo').value,
      descricao: document.getElementById('post-descricao').value,
    };

    vagasClubes.unshift(novaVaga);
    salvarNoBanco();

    if (filtroPlataforma) filtroPlataforma.value = 'todas';
    if (filtroPosicao)    filtroPosicao.value    = 'todas';
    if (filtroJogo)       filtroJogo.value        = 'todas';

    formLfg.reset();
    aplicarFiltros();
    mostrarToast('Sua vaga foi publicada com sucesso!');
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
limparPostsAntigos();
aplicarFiltros();
/* =============================================
   TORNEIO.JS — Pro Clubs Hub Brasil
   Lógica: listagem, criação, filtros, modais
   ============================================= */

// ─── DADOS MOCKADOS ─────────────────────────────────

const CLUBES_REGISTRADOS = [
  { id: 1, nome: "Flamengo Hub FC",    sigla: "FHB", escudo: "🦅" },
  { id: 2, nome: "Santos Esporte Clube", sigla: "SEC", escudo: "🐟" },
  { id: 3, nome: "Corinthians Pro",    sigla: "COR", escudo: "⚫" },
  { id: 4, nome: "Palmeiras United",   sigla: "PAL", escudo: "🟢" },
  { id: 5, nome: "Vasco Cyber",        sigla: "VAS", escudo: "⚔️" },
  { id: 6, nome: "Botafogo Digital",   sigla: "BOT", escudo: "⭐" },
  { id: 7, nome: "Grêmio Virtual",     sigla: "GRE", escudo: "🔵" },
  { id: 8, nome: "Internacional FC",   sigla: "INT", escudo: "🔴" },
  { id: 9, nome: "Atletico Hub MG",    sigla: "ATL", escudo: "🐓" },
  { id:10, nome: "Cruzeiro Esports",   sigla: "CRU", escudo: "🌟" },
];

let torneios = JSON.parse(localStorage.getItem('torneios_hub') || '[]');

// Torneios de exemplo caso não haja nada salvo
if (torneios.length === 0) {
  torneios = [
    {
      id: "t_demo1",
      nome: "Copa Hub Brasil — Temporada 1",
      desc: "O maior torneio da plataforma. Apenas clubes verificados.",
      formato: "misto",
      status: "em-andamento",
      dataInicio: "2025-03-10",
      maxClubes: 16,
      criador: "Admin Hub",
      clubes: [1, 2, 3, 4, 5, 6, 7, 8],
    },
    {
      id: "t_demo2",
      nome: "Liga Relâmpago",
      desc: "Pontos corridos, ida e volta, campeão leva tudo.",
      formato: "liga",
      status: "aberto",
      dataInicio: "2025-05-01",
      maxClubes: 8,
      criador: "Org Liga",
      clubes: [1, 3],
    },
    {
      id: "t_demo3",
      nome: "Mata-mata de Abril",
      desc: "Eliminação direta, jogo único.",
      formato: "mata-mata",
      status: "finalizado",
      dataInicio: "2025-04-01",
      maxClubes: 8,
      criador: "Org Mata",
      clubes: [1, 2, 3, 4, 5, 6, 7, 8],
    },
  ];
  salvarTorneios();
}

function salvarTorneios() {
  localStorage.setItem('torneios_hub', JSON.stringify(torneios));
}

// ─── UTILIDADES ─────────────────────────────────────

function gerarId() {
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getClube(id) {
  return CLUBES_REGISTRADOS.find(c => c.id === id);
}

function formatarFormato(f) {
  const map = { liga: 'Liga', 'mata-mata': 'Mata-mata', misto: 'Misto' };
  return map[f] || f;
}

function formatarData(d) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function toast(msg, icon = '✅') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${icon}</span> ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── ABAS ────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'meus') renderMeusTorneios();
  });
});

// ─── RENDER CARDS ────────────────────────────────────

function criarCard(t) {
  const card = document.createElement('div');
  card.className = 'torneio-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  const statusMap = {
    'aberto':       { cls: 'badge-aberto',    label: 'Aberto' },
    'em-andamento': { cls: 'badge-andamento', label: 'Em andamento' },
    'finalizado':   { cls: 'badge-finalizado',label: 'Finalizado' },
  };
  const st = statusMap[t.status] || statusMap['aberto'];

  const avatares = (t.clubes || []).slice(0, 5).map(cid => {
    const cl = getClube(cid);
    return cl ? `<div class="clube-av" title="${cl.nome}">${cl.escudo}</div>` : '';
  }).join('');

  const extra = (t.clubes?.length || 0) > 5
    ? `<div class="clube-av">+${t.clubes.length - 5}</div>` : '';

  card.innerHTML = `
    <div class="card-top">
      <div class="card-nome">${t.nome}</div>
      <span class="badge-status ${st.cls}">${st.label}</span>
    </div>
    ${t.desc ? `<p class="card-desc">${t.desc}</p>` : ''}
    <div class="card-meta">
      <div class="meta-item">
        <span class="meta-label">Formato</span>
        <span class="meta-value">${formatarFormato(t.formato)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Início</span>
        <span class="meta-value">${formatarData(t.dataInicio)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Clubes</span>
        <span class="meta-value">${(t.clubes?.length || 0)} / ${t.maxClubes}</span>
      </div>
    </div>
    <div class="card-footer">
      <div class="clubes-avatares">${avatares}${extra}</div>
      <span class="card-cta">Ver detalhes →</span>
    </div>
  `;

  card.addEventListener('click', () => abrirDetalhe(t));
  card.addEventListener('keydown', e => { if (e.key === 'Enter') abrirDetalhe(t); });

  return card;
}

function renderGrid(lista, gridId, emptyId) {
  const grid = document.getElementById(gridId);
  const empty = document.getElementById(emptyId);
  grid.innerHTML = '';
  if (!lista.length) {
    empty && (empty.hidden = false);
    return;
  }
  empty && (empty.hidden = true);
  lista.forEach(t => grid.appendChild(criarCard(t)));
}

function renderTorneios() {
  const q    = document.getElementById('searchInput').value.toLowerCase();
  const fmt  = document.getElementById('filterFormato').value;
  const sts  = document.getElementById('filterStatus').value;

  const filtrados = torneios.filter(t => {
    const matchQ   = !q   || t.nome.toLowerCase().includes(q) || (t.desc || '').toLowerCase().includes(q);
    const matchFmt = !fmt || t.formato === fmt;
    const matchSts = !sts || t.status === sts;
    return matchQ && matchFmt && matchSts;
  });

  renderGrid(filtrados, 'torneioGrid', 'emptyState');
}

function renderMeusTorneios() {
  // Simula "meus" = criados com flag isMeu
  const meus = torneios.filter(t => t.isMeu);
  renderGrid(meus, 'meusTorneiosGrid', null);

  const empty = document.getElementById('meusEmpty');
  if (meus.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }
}

// Filtros em tempo real
document.getElementById('searchInput').addEventListener('input', renderTorneios);
document.getElementById('filterFormato').addEventListener('change', renderTorneios);
document.getElementById('filterStatus').addEventListener('change', renderTorneios);

// ─── DETALHE TORNEIO ─────────────────────────────────

const detalheOverlay = document.getElementById('detalheOverlay');
const detalheContent = document.getElementById('detalheContent');
document.getElementById('detalheClose').addEventListener('click', () => {
  detalheOverlay.hidden = true;
});
detalheOverlay.addEventListener('click', e => {
  if (e.target === detalheOverlay) detalheOverlay.hidden = true;
});

function abrirDetalhe(t) {
  const st = { aberto: 'badge-aberto', 'em-andamento': 'badge-andamento', finalizado: 'badge-finalizado' };
  const stLabel = { aberto: 'Aberto', 'em-andamento': 'Em andamento', finalizado: 'Finalizado' };

  const clubesHtml = (t.clubes || []).map(cid => {
    const cl = getClube(cid);
    return cl ? `<div class="clube-chip"><span>${cl.escudo}</span>${cl.nome}</div>` : '';
  }).join('');

  const podeEntrar = t.status === 'aberto' && (t.clubes?.length || 0) < t.maxClubes;

  detalheContent.innerHTML = `
    <div class="detalhe-header">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <h2 class="detalhe-nome">${t.nome}</h2>
        <span class="badge-status ${st[t.status] || 'badge-aberto'}">${stLabel[t.status] || 'Aberto'}</span>
      </div>
      ${t.desc ? `<p style="color:var(--text-sec);margin-top:8px;font-size:14px;">${t.desc}</p>` : ''}
      <div class="detalhe-meta">
        <div class="meta-item">
          <span class="meta-label">Formato</span>
          <span class="meta-value">${formatarFormato(t.formato)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Início</span>
          <span class="meta-value">${formatarData(t.dataInicio)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Vagas</span>
          <span class="meta-value">${(t.clubes?.length || 0)} / ${t.maxClubes}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Organizado por</span>
          <span class="meta-value">${t.criador || '—'}</span>
        </div>
      </div>
    </div>

    <div class="detalhe-section">
      <h4>Clubes participantes</h4>
      <div class="clubes-lista">
        ${clubesHtml || '<span style="color:var(--text-sec);font-size:13px;">Nenhum clube ainda.</span>'}
      </div>
    </div>

    ${podeEntrar ? `
    <button class="btn-primary btn-entrar" id="btnEntrarTorneio">Participar com meu clube</button>
    ` : ''}
  `;

  if (podeEntrar) {
    document.getElementById('btnEntrarTorneio').addEventListener('click', () => {
      toast('Solicitação de participação enviada!', '📨');
      detalheOverlay.hidden = true;
    });
  }

  detalheOverlay.hidden = false;
}

// ─── MODAL CRIAR TORNEIO ─────────────────────────────

const modalOverlay = document.getElementById('modalOverlay');
let stepAtual = 1;
let clubesSelecionados = [];

function abrirModal() {
  stepAtual = 1;
  clubesSelecionados = [];
  document.getElementById('nomeTorneio').value = '';
  document.getElementById('descTorneio').value = '';
  document.getElementById('dataInicio').value = '';
  document.getElementById('clubeSearch').value = '';
  document.querySelectorAll('input[name="formato"]').forEach(r => r.checked = false);
  renderClubesTag();
  irParaStep(1);
  modalOverlay.hidden = false;
}

document.getElementById('btnCriarTorneio').addEventListener('click', abrirModal);
document.getElementById('modalClose').addEventListener('click', () => { modalOverlay.hidden = true; });
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) modalOverlay.hidden = true;
});

// Atalho da aba "meus torneios"
document.addEventListener('click', e => {
  if (e.target.id === 'btnCriarMeus') abrirModal();
});

function irParaStep(n) {
  stepAtual = n;
  document.querySelectorAll('.step-panel').forEach((p, i) => {
    p.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.step').forEach((s, i) => {
    const num = i + 1;
    s.classList.toggle('active', num === n);
    s.classList.toggle('done', num < n);
  });
  document.querySelectorAll('.step-line').forEach((l, i) => {
    l.classList.toggle('done', i + 1 < n);
  });
  if (n === 4) montarResumo();
}

// Step 1 → 2
document.getElementById('step1Next').addEventListener('click', () => {
  const nome = document.getElementById('nomeTorneio').value.trim();
  if (!nome) { toast('Informe o nome do torneio.', '⚠️'); return; }
  irParaStep(2);
});

// Step 2
document.getElementById('step2Prev').addEventListener('click', () => irParaStep(1));
document.getElementById('step2Next').addEventListener('click', () => {
  const fmt = document.querySelector('input[name="formato"]:checked');
  if (!fmt) { toast('Selecione um formato.', '⚠️'); return; }
  irParaStep(3);
});

document.querySelectorAll('input[name="formato"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.getElementById('optsLiga').hidden  = radio.value !== 'liga';
    document.getElementById('optsMata').hidden  = radio.value !== 'mata-mata';
    document.getElementById('optsMisto').hidden = radio.value !== 'misto';
  });
});

// Step 3
document.getElementById('step3Prev').addEventListener('click', () => irParaStep(2));
document.getElementById('step3Next').addEventListener('click', () => {
  if (clubesSelecionados.length < 2) {
    toast('Adicione pelo menos 2 clubes.', '⚠️');
    return;
  }
  irParaStep(4);
});

// Busca de clubes
document.getElementById('clubeSearch').addEventListener('input', function () {
  const q = this.value.toLowerCase().trim();
  const sugg = document.getElementById('clubeSuggestions');
  sugg.innerHTML = '';

  if (!q) return;

  const max = parseInt(document.getElementById('maxClubes').value);
  const resultados = CLUBES_REGISTRADOS.filter(c =>
    (c.nome.toLowerCase().includes(q) || c.sigla.toLowerCase().includes(q)) &&
    !clubesSelecionados.includes(c.id)
  ).slice(0, 6);

  resultados.forEach(c => {
    const item = document.createElement('div');
    item.className = 'sugg-item';
    item.innerHTML = `<div class="sugg-av">${c.escudo}</div><div><strong>${c.nome}</strong><br/><small style="color:var(--text-sec)">${c.sigla}</small></div>`;
    item.addEventListener('click', () => {
      if (clubesSelecionados.length >= max) {
        toast(`Máximo de ${max} clubes atingido.`, '⚠️');
        return;
      }
      clubesSelecionados.push(c.id);
      renderClubesTag();
      document.getElementById('clubeSearch').value = '';
      sugg.innerHTML = '';
    });
    sugg.appendChild(item);
  });

  if (!resultados.length) {
    sugg.innerHTML = `<div class="sugg-item" style="color:var(--text-sec)">Nenhum clube encontrado.</div>`;
  }
});

document.addEventListener('click', e => {
  if (!document.querySelector('.clube-search-wrap').contains(e.target)) {
    document.getElementById('clubeSuggestions').innerHTML = '';
  }
});

function renderClubesTag() {
  const container = document.getElementById('clubesSelecionados');
  container.innerHTML = '';

  if (!clubesSelecionados.length) {
    container.innerHTML = '<p class="empty-clubes">Nenhum clube adicionado ainda.</p>';
    return;
  }

  clubesSelecionados.forEach(id => {
    const c = getClube(id);
    if (!c) return;
    const tag = document.createElement('div');
    tag.className = 'clube-tag';
    tag.innerHTML = `<span>${c.escudo}</span><span>${c.nome}</span><button title="Remover" aria-label="Remover ${c.nome}">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      clubesSelecionados = clubesSelecionados.filter(x => x !== id);
      renderClubesTag();
    });
    container.appendChild(tag);
  });
}

// Step 4 - Resumo
function montarResumo() {
  const nome    = document.getElementById('nomeTorneio').value.trim();
  const desc    = document.getElementById('descTorneio').value.trim();
  const data    = document.getElementById('dataInicio').value;
  const max     = document.getElementById('maxClubes').value;
  const formato = document.querySelector('input[name="formato"]:checked')?.value || '';

  const clubesHtml = clubesSelecionados.map(id => {
    const c = getClube(id);
    return c ? `${c.escudo} ${c.nome}` : '';
  }).filter(Boolean).join(', ');

  document.getElementById('resumoBox').innerHTML = `
    <div class="resumo-row">
      <span class="r-label">Nome</span>
      <span class="r-val">${nome}</span>
    </div>
    ${desc ? `<div class="resumo-row"><span class="r-label">Descrição</span><span class="r-val" style="font-family:Inter;font-size:13px;font-weight:400">${desc}</span></div>` : ''}
    <div class="resumo-divider"></div>
    <div class="resumo-row">
      <span class="r-label">Formato</span>
      <span class="r-val">${formatarFormato(formato)}</span>
    </div>
    <div class="resumo-row">
      <span class="r-label">Início</span>
      <span class="r-val">${formatarData(data) || 'A definir'}</span>
    </div>
    <div class="resumo-row">
      <span class="r-label">Máx. Clubes</span>
      <span class="r-val">${max}</span>
    </div>
    <div class="resumo-divider"></div>
    <div class="resumo-row">
      <span class="r-label">Clubes (${clubesSelecionados.length})</span>
      <span class="r-val" style="font-family:Inter;font-size:13px;font-weight:400;text-align:right">${clubesHtml || '—'}</span>
    </div>
  `;
}

document.getElementById('step4Prev').addEventListener('click', () => irParaStep(3));

// Publicar
document.getElementById('btnPublicar').addEventListener('click', () => {
  const nome    = document.getElementById('nomeTorneio').value.trim();
  const desc    = document.getElementById('descTorneio').value.trim();
  const data    = document.getElementById('dataInicio').value;
  const max     = document.getElementById('maxClubes').value;
  const formato = document.querySelector('input[name="formato"]:checked')?.value || '';

  const novoTorneio = {
    id: gerarId(),
    nome,
    desc,
    formato,
    status: 'aberto',
    dataInicio: data,
    maxClubes: parseInt(max),
    criador: 'Você',
    clubes: [...clubesSelecionados],
    isMeu: true,
  };

  torneios.unshift(novoTorneio);
  salvarTorneios();

  modalOverlay.hidden = true;
  renderTorneios();
  toast(`Torneio "${nome}" publicado com sucesso!`, '🏆');
});

// ─── INIT ────────────────────────────────────────────
renderTorneios();
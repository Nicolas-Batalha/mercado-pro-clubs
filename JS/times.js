// =========================================================================
// MERCADO PRO CLUBS - MOTOR DA CENTRAL DE RECRUTAMENTO (LFG)
// =========================================================================

// --- 1. SELEÇÃO DOS ELEMENTOS DO HTML ---
const formLfg = document.getElementById('form-lfg');
const feedLfg = document.getElementById('lfg-feed');
const filtroPlataforma = document.getElementById('filtro-plataforma');
const filtroPosicao = document.getElementById('filtro-posicao');
const filtroJogo = document.getElementById('filtro-jogo'); // FIX: filtro de jogo conectado

// Define que os posts somem após 2 horas (em milissegundos)
const TEMPO_EXPIRACAO = 2 * 60 * 60 * 1000;

// --- 2. BANCO DE DADOS LOCAL (LocalStorage) ---
let vagasClubes = JSON.parse(localStorage.getItem('vagasClubes')) || [];

// Inicia com exemplos caso esteja vazio pela primeira vez
if (vagasClubes.length === 0) {
    vagasClubes = [
        {
            id: Date.now() - 1500000,
            clube: "Brazucas FC",
            plataforma: "xboxO",
            posicao: "vol",
            jogo: "eafc25", // FIX: campo jogo adicionado
            estilo: "competitivo",
            descricao: "Clube focado em campeonatos. Precisamos de um volante (VOL) que saiba sair jogando e tenha microfone. Treinos terça e quinta às 20h."
        },
    ];
    salvarNoBanco();
}

// --- 3. FUNÇÕES DE SUPORTE ---

// Salva o array atualizado no navegador
function salvarNoBanco() {
    localStorage.setItem('vagasClubes', JSON.stringify(vagasClubes));
}

// O "Lixeiro": Limpa posts mais velhos que o TEMPO_EXPIRACAO
function limparPostsAntigos() {
    const tempoAtual = Date.now();
    const vagasValidas = vagasClubes.filter(vaga => (tempoAtual - vaga.id) < TEMPO_EXPIRACAO);
    if (vagasValidas.length !== vagasClubes.length) {
        vagasClubes = vagasValidas;
        salvarNoBanco();
    }
}

// Calcula o tempo que passou para mostrar na tela
function calcularTempoDecorrido(tempoCriacao) {
    const diferencaMinutos = Math.floor((Date.now() - tempoCriacao) / (1000 * 60));
    if (diferencaMinutos < 1) return "Agora mesmo";
    if (diferencaMinutos < 60) return `Há ${diferencaMinutos} min`;
    return `Há ${Math.floor(diferencaMinutos / 60)} hora(s)`;
}

// FIX: Toast no lugar de alert()
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
        z-index: 9999; opacity: 0;
        transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = '1');
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Deleta um post específico (Exposto para o onClick do HTML)
window.deletarVaga = function(idParaApagar) {
    if (confirm("Tem certeza que deseja apagar esta vaga do painel?")) {
        vagasClubes = vagasClubes.filter(vaga => vaga.id !== idParaApagar);
        salvarNoBanco();
        aplicarFiltros();
    }
};

// --- 4. RENDERIZAÇÃO NA TELA ---

// FIX: mapa de plataformas expandido para cobrir todos os valores do HTML
const CONFIG_PLATAFORMAS = {
    'xboxS':   { classe: 'badge-xbox', nome: 'Xbox Series X/S' },
    'xboxO':   { classe: 'badge-xbox', nome: 'Xbox One' },
    'ps5':     { classe: 'badge-ps5',  nome: 'PlayStation 5' },
    'ps4':     { classe: 'badge-ps5',  nome: 'PlayStation 4' },
    'pc':      { classe: 'badge-pc',   nome: 'PC' },
    'switch2': { classe: 'badge-pc',   nome: 'Switch 2' },
    'switch':  { classe: 'badge-pc',   nome: 'Switch' },
};

function renderizarFeed(vagas) {
    if (!feedLfg) return;

    if (vagas.length === 0) {
        feedLfg.innerHTML = '<p style="text-align: center; color: #aaa; margin-top: 20px; font-style: italic;">Nenhuma vaga encontrada. Seja o primeiro a anunciar!</p>';
        return;
    }

    const htmlGeral = vagas.map(vaga => {
        const configPlat = CONFIG_PLATAFORMAS[vaga.plataforma] || { classe: 'badge-pc', nome: vaga.plataforma };
        const nomePosicao = vaga.posicao.toUpperCase();
        const nomeEstilo = vaga.estilo.charAt(0).toUpperCase() + vaga.estilo.slice(1);
        const tempoNaTela = calcularTempoDecorrido(vaga.id);
        const nomeJogo = (vaga.jogo || '').toUpperCase() || 'EAFC';

        return `
            <div class="lfg-card">
                <div class="card-topo">
                    <span class="badge ${configPlat.classe}">${configPlat.nome}</span>
                    <span class="badge badge-vaga">VAGA: ${nomePosicao}</span>
                    <span class="badge badge-posicao">${nomeJogo}</span>
                    <div style="margin-left: auto; display: flex; align-items: center; gap: 10px;">
                        <span style="color: #888; font-size: 0.8rem;">${tempoNaTela}</span>
                        <button class="btn-excluir" onclick="deletarVaga(${vaga.id})">Excluir</button>
                    </div>
                </div>
                <div class="card-corpo">
                    <h4 class="nome-clube">${vaga.clube}</h4>
                    <p class="descricao">${vaga.descricao}</p>
                </div>
                <div class="card-rodape">
                    <span class="estilo-jogo">${nomeEstilo}</span>
                    <button class="btn-chamar" onclick="mostrarToast('Funcionalidade de mensagem em breve!', 'sucesso')">Pedir Teste</button>
                </div>
            </div>
        `;
    }).join('');

    feedLfg.innerHTML = htmlGeral;
}

// --- 5. LÓGICA DOS FILTROS ---
function aplicarFiltros() {
    if (!filtroPlataforma || !filtroPosicao) return;

    const plat = filtroPlataforma.value;
    const pos = filtroPosicao.value;
    const jogo = filtroJogo ? filtroJogo.value : 'todas'; // FIX: filtro de jogo aplicado

    const vagasFiltradas = vagasClubes.filter(vaga => {
        const passaPlataforma = (plat === 'todas') || (vaga.plataforma === plat);
        const passaPosicao    = (pos === 'todas')  || (vaga.posicao === pos);
        const passaJogo       = (jogo === 'todas') || (vaga.jogo === jogo); // FIX
        return passaPlataforma && passaPosicao && passaJogo;
    });

    renderizarFeed(vagasFiltradas);
}

// --- 6. EVENTOS E INICIALIZAÇÃO ---

if (formLfg) {
    formLfg.addEventListener('submit', (e) => {
        e.preventDefault();

        const novaVaga = {
            id: Date.now(),
            clube:      document.getElementById('post-clube').value,
            plataforma: document.getElementById('post-plataforma').value,
            posicao:    document.getElementById('post-posicao').value,
            jogo:       document.getElementById('post-jogo') // FIX: salva o jogo
                            ? document.getElementById('post-jogo').value
                            : 'eafc25',
            estilo:     document.getElementById('post-estilo').value,
            descricao:  document.getElementById('post-descricao').value
        };

        vagasClubes.unshift(novaVaga);
        salvarNoBanco();

        filtroPlataforma.value = 'todas';
        filtroPosicao.value = 'todas';
        if (filtroJogo) filtroJogo.value = 'todas';
        formLfg.reset();
        aplicarFiltros();

        mostrarToast('Sua vaga foi publicada com sucesso!'); // FIX: toast no lugar de alert
    });
}

// Eventos de mudança nos filtros
if (filtroPlataforma) filtroPlataforma.addEventListener('change', aplicarFiltros);
if (filtroPosicao)    filtroPosicao.addEventListener('change', aplicarFiltros);
if (filtroJogo)       filtroJogo.addEventListener('change', aplicarFiltros); // FIX

// --- START (Apito Inicial) ---
limparPostsAntigos();
aplicarFiltros();
// =========================================================================
// MERCADO PRO CLUBS — MERCADO DE TRANSFERÊNCIAS
// =========================================================================

import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, serverTimestamp,
  doc, getDoc, query, where, getDocs, updateDoc, deleteDoc
}                           from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth }          from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig }   from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

const TEMPO_EXPIRACAO = 2 * 60 * 60 * 1000; // 2 horas

const filtroPlataforma = document.getElementById('filtro-plataforma');
const filtroPosicao    = document.getElementById('filtro-posicao');
const filtroJogo       = document.getElementById('filtro-jogo');
const feedLfg          = document.getElementById('lfg-feed');
const formLfg          = document.getElementById('form-lfg');

let todasAsVagas = [];

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
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}
window.mostrarToast = mostrarToast;

// ─── Utilitários de tempo ─────────────────────────────────────────────────────
function calcularTempoDecorrido(ts) {
  if (!ts) return "Agora mesmo";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1)  return "Agora mesmo";
  if (min < 60) return `Há ${min} min`;
  return `Há ${Math.floor(min / 60)} hora(s)`;
}

function calcularTempoRestante(ts) {
  if (!ts) return '';
  const restante = TEMPO_EXPIRACAO - (Date.now() - ts);
  if (restante <= 0) return 'Expirando...';
  const h = Math.floor(restante / 3600000);
  const m = Math.floor((restante % 3600000) / 60000);
  return h > 0 ? `Expira em ${h}h ${m}min` : `Expira em ${m}min`;
}

// ─── Firestore: carregar e limpar vagas expiradas ─────────────────────────────
async function puxarVagasDoFirestore() {
  if (!feedLfg) return;
  feedLfg.innerHTML = '<p style="text-align:center;color:#aaa;margin-top:20px;">Carregando vagas...</p>';

  try {
    const snapshot = await getDocs(collection(db, "vagas"));
    const agora = Date.now();
    const expiradas = [];
    todasAsVagas = [];

    snapshot.forEach(d => {
      const vaga = { id: d.id, ...d.data() };
      if (vaga.criadoEm && (agora - vaga.criadoEm) > TEMPO_EXPIRACAO) {
        expiradas.push(deleteDoc(doc(db, "vagas", d.id)));
      } else {
        todasAsVagas.push(vaga);
      }
    });

    if (expiradas.length) await Promise.all(expiradas);

    todasAsVagas.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
    aplicarFiltros();
  } catch (err) {
    console.error("Erro ao buscar vagas:", err);
    feedLfg.innerHTML = '<p style="text-align:center;color:#f55;">Erro ao carregar vagas.</p>';
  }
}

// ─── Deletar vaga (somente dono) ─────────────────────────────────────────────
window.deletarVaga = async function (id) {
  if (!confirm("Apagar esta vaga definitivamente?")) return;
  try {
    await deleteDoc(doc(db, "vagas", id));
    mostrarToast("Vaga removida!");
    puxarVagasDoFirestore();
  } catch {
    mostrarToast("Erro ao apagar vaga.", "erro");
  }
};

// ─── Responder pedido de teste (capitão) ──────────────────────────────────────
window.responderPedido = async function (pedidoId, resposta) {
  try {
    await updateDoc(doc(db, "pedidos_teste", pedidoId), {
      status: resposta,
      respondidoEm: serverTimestamp()
    });
    if (resposta === 'aceito') {
      mostrarToast('Pedido Aceito! Abrindo mensagens... ✅');
      setTimeout(() => { window.location.href = '../HTML/mensagens.html'; }, 1200);
    } else {
      mostrarToast('Pedido Recusado. ❌');
      if (auth.currentUser) carregarSolicitacoesDeTeste(auth.currentUser.uid);
    }
  } catch {
    mostrarToast("Erro ao responder.", "erro");
  }
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

// ─── Renderizar cards ─────────────────────────────────────────────────────────
function renderizarFeed(vagas) {
  if (!feedLfg) return;

  if (!vagas.length) {
    feedLfg.innerHTML = '<p style="text-align:center;color:#aaa;margin-top:20px;font-style:italic;">Nenhuma vaga no momento. Seja o primeiro a anunciar!</p>';
    return;
  }

  const usuario = auth.currentUser;

  feedLfg.innerHTML = vagas.map(vaga => {
    const plat   = CONFIG_PLATAFORMAS[vaga.plataforma] || { classe: 'badge-pc', nome: vaga.plataforma || '?' };
    const posicao = (vaga.posicao || 'N/A').toUpperCase();
    const estilo  = vaga.estilo ? vaga.estilo.charAt(0).toUpperCase() + vaga.estilo.slice(1) : 'Casual';
    const jogo    = (vaga.jogo || 'eafc25').toUpperCase();
    const tempo   = calcularTempoDecorrido(vaga.criadoEm);
    const expira  = calcularTempoRestante(vaga.criadoEm);
    const ehDono  = usuario && usuario.uid === vaga.criadorUid;

    const btnExcluir = ehDono
      ? `<button onclick="deletarVaga('${vaga.id}')" style="background:#d32f2f;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:bold;">Excluir</button>`
      : '';

    return `
      <div class="lfg-card">
        <div class="card-topo">
          <span class="badge ${plat.classe}">${plat.nome}</span>
          <span class="badge badge-vaga">VAGA: ${posicao}</span>
          <span class="badge badge-posicao">${jogo}</span>
          <div style="margin-left:auto;display:flex;align-items:center;gap:10px;">
            <span style="color:#888;font-size:0.8rem;">${tempo}</span>
            ${btnExcluir}
          </div>
        </div>
        <div class="card-corpo">
          <h4 class="nome-clube">${vaga.clube || 'Clube'}</h4>
          <p class="descricao">${vaga.descricao || ''}</p>
        </div>
        <div class="card-rodape">
          <span class="estilo-jogo">${estilo}</span>
          <span style="color:#F0B429;font-size:0.75rem;font-weight:600;">⏱ ${expira}</span>
          <button class="btn-chamar" data-capitao="${vaga.criadorUid || ''}" data-clube="${vaga.clube || ''}">
            Pedir Teste no Clube
          </button>
        </div>
      </div>`;
  }).join('');
}

// ─── Filtros ──────────────────────────────────────────────────────────────────
function aplicarFiltros() {
  const plat = filtroPlataforma?.value || 'todas';
  const pos  = filtroPosicao?.value    || 'todas';
  const jogo = filtroJogo?.value       || 'todas';

  renderizarFeed(todasAsVagas.filter(v =>
    (plat === 'todas' || v.plataforma === plat) &&
    (pos  === 'todas' || v.posicao    === pos)  &&
    (jogo === 'todas' || v.jogo       === jogo)
  ));
}

if (filtroPlataforma) filtroPlataforma.addEventListener('change', aplicarFiltros);
if (filtroPosicao)    filtroPosicao.addEventListener('change', aplicarFiltros);
if (filtroJogo)       filtroJogo.addEventListener('change', aplicarFiltros);

// ─── Publicar vaga ────────────────────────────────────────────────────────────
if (formLfg) {
  formLfg.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = auth.currentUser;
    if (!usuario) { mostrarToast("Faça login para publicar uma vaga!", "erro"); return; }

    const btn = formLfg.querySelector('button[type="submit"]');
    const textoOriginal = btn.textContent;
    btn.textContent = "Publicando...";
    btn.disabled = true;

    const novaVaga = {
      criadoEm:   Date.now(),
      criadorUid: usuario.uid,
      clube:      document.getElementById('post-clube').value.trim(),
      plataforma: document.getElementById('post-plataforma').value,
      posicao:    document.getElementById('post-posicao').value,
      jogo:       document.getElementById('post-jogo')?.value || 'eafc25',
      estilo:     document.getElementById('post-estilo').value,
      descricao:  document.getElementById('post-descricao').value.trim(),
    };

    try {
      await addDoc(collection(db, "vagas"), novaVaga);
      mostrarToast("Vaga publicada no mercado! 🚀");
      formLfg.reset();
      if (filtroPlataforma) filtroPlataforma.value = 'todas';
      if (filtroPosicao)    filtroPosicao.value    = 'todas';
      if (filtroJogo)       filtroJogo.value        = 'todas';
      await puxarVagasDoFirestore();
    } catch (err) {
      console.error("Erro ao salvar vaga:", err);
      mostrarToast("Erro ao publicar vaga.", "erro");
    } finally {
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }
  });
}

// ─── Pedir teste ──────────────────────────────────────────────────────────────
if (feedLfg) {
  feedLfg.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-chamar');
    if (!btn) return;

    const usuario = auth.currentUser;
    if (!usuario) { mostrarToast("Faça login para pedir teste!", "erro"); return; }

    const capitaoUid = btn.dataset.capitao;
    const nomeClube  = btn.dataset.clube;

    if (capitaoUid === usuario.uid) {
      mostrarToast("Você não pode pedir teste no próprio clube!", "erro");
      return;
    }

    const textoOriginal = btn.textContent;
    btn.textContent = "Processando...";
    btn.disabled = true;

    try {
      const snap = await getDoc(doc(db, 'jogadores', usuario.uid));
      if (!snap.exists()) {
        mostrarToast("Complete seu perfil primeiro!", "erro");
        btn.textContent = textoOriginal;
        btn.disabled = false;
        return;
      }

      const dados = snap.data();
      await addDoc(collection(db, "pedidos_teste"), {
        clubeNome:         nomeClube,
        capitaoUid,
        jogadorUid:        usuario.uid,
        jogadorEmail:      usuario.email         || "",
        jogadorNickname:   dados.nickname        || "Sem Nome",
        jogadorEaId:       dados.eaId            || "N/A",
        jogadorOverall:    dados.overall         || 80,
        jogadorPosicao:    dados.posicao         || "N/A",
        jogadorPlataforma: dados.plataforma      || "N/A",
        status:            "pendente",
        enviadoEm:         serverTimestamp(),
      });

      mostrarToast(`Pedido enviado para ${nomeClube}! ⚽`);
      btn.textContent = "Pedido Enviado!";
    } catch (err) {
      console.error("Erro ao enviar pedido:", err);
      mostrarToast("Erro ao enviar pedido.", "erro");
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }
  });
}

// ─── Painel do Capitão ────────────────────────────────────────────────────────
async function carregarSolicitacoesDeTeste(capitaoUid) {
  const container = document.getElementById('painel-notificacoes');
  if (!container) return;

  try {
    const snap = await getDocs(query(
      collection(db, "pedidos_teste"),
      where("capitaoUid", "==", capitaoUid),
      where("status", "==", "pendente")
    ));

    if (snap.empty) {
      container.innerHTML = "<p style='color:#aaa;text-align:center;'>Nenhum pedido pendente.</p>";
      return;
    }

    container.innerHTML = '';
    snap.forEach(docSnap => {
      const p = docSnap.data();
      container.innerHTML += `
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
            <div style="background:#12E06C;color:#000;font-size:22px;font-weight:900;width:50px;height:50px;display:flex;align-items:center;justify-content:center;border-radius:8px;">
              ${p.jogadorOverall}
            </div>
            <div>
              <h3 style="margin:0;color:#fff;">${p.jogadorNickname}</h3>
              <p style="margin:4px 0 0;color:#aaa;font-size:13px;">ID EA: <strong style="color:#fff;">${p.jogadorEaId}</strong></p>
              <div style="display:flex;gap:6px;margin-top:6px;">
                <span style="background:#333;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;">${p.jogadorPosicao}</span>
                <span style="background:#333;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">${p.jogadorPlataforma}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button onclick="responderPedido('${docSnap.id}','aceito')"   style="flex:1;background:#12E06C;color:#000;border:none;padding:8px;border-radius:6px;font-weight:bold;cursor:pointer;">✅ Aceitar</button>
            <button onclick="responderPedido('${docSnap.id}','recusado')" style="flex:1;background:#333;color:#fff;border:1px solid #555;padding:8px;border-radius:6px;font-weight:bold;cursor:pointer;">❌ Recusar</button>
          </div>
        </div>`;
    });
  } catch (err) {
    console.error("Erro ao carregar pedidos:", err);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
auth.onAuthStateChanged(user => {
  puxarVagasDoFirestore();
  if (user) carregarSolicitacoesDeTeste(user.uid);
});
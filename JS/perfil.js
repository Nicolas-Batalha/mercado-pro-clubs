// =========================================================================
// MERCADO PRO CLUBS — perfil.js
// Responsabilidade: formulário de perfil do jogador.
//   - Carrega dados do Firestore ao abrir a página
//   - Salva no Firestore ao submeter o formulário
//   - Live preview no topo da página
//   - Upload de foto (base64 → Firestore)
//   - Animação de scroll
// NÃO chama initializeApp — importa auth e db de firebase-config.js.
// =========================================================================

import { auth, db }                        from "./firebase-config.js";
import { onAuthStateChanged }              from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc }             from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ─── 1. Animação de scroll ────────────────────────────────────────────────────
function iniciarAnimarScroll() {
  const els = document.querySelectorAll(".animar-scroll");
  if (!els.length) return;
  const obs = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("visivel"); obs.unobserve(e.target); }
    }),
    { threshold: 0.15 }
  );
  els.forEach((el) => obs.observe(el));
}

// ─── 2. Toast de feedback ─────────────────────────────────────────────────────
function toast(msg, tipo = "sucesso") {
  document.getElementById("toast-perfil")?.remove();
  const el = Object.assign(document.createElement("div"), {
    id: "toast-perfil", textContent: msg,
  });
  Object.assign(el.style, {
    position: "fixed", bottom: "30px", left: "50%", transform: "translateX(-50%)",
    background: tipo === "sucesso" ? "#12E06C" : "#d32f2f",
    color: tipo === "sucesso" ? "#050B14" : "#fff",
    padding: "12px 28px", borderRadius: "30px", fontWeight: "bold",
    fontSize: "15px", zIndex: "9999", boxShadow: "0 0 20px rgba(18,224,108,0.5)",
    transition: "opacity 0.5s ease", opacity: "1",
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 500); }, 2500);
}

// ─── 3. Firestore: ler e salvar ───────────────────────────────────────────────

/** Retorna a ref do documento do jogador logado (ou null se deslogado). */
function refJogador(uid) {
  return doc(db, "jogadores", uid);
}

async function carregarDoFirestore(uid) {
  try {
    const snap = await getDoc(refJogador(uid));
    return snap.exists() ? snap.data() : {};
  } catch (err) {
    console.error("Erro ao carregar perfil:", err);
    return {};
  }
}

async function salvarNoFirestore(uid, dados) {
  try {
    await setDoc(refJogador(uid), dados, { merge: true });
    return true;
  } catch (err) {
    console.error("Erro ao salvar perfil:", err);
    return false;
  }
}

// ─── 4. Atualizar seção de topo ───────────────────────────────────────────────
function atualizarTopo(dados) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Foto
  const fotoPrev = document.getElementById("foto-perfil-preview");
  if (fotoPrev && dados.fotoURL) fotoPrev.src = dados.fotoURL;

  set("usuario-nickname", dados.nickname || "Jogador Pro Clubs");
  set("usuario-email",    dados.eaId ? `EA ID: ${dados.eaId}` : "carregando Nick EA...");
  set("inputClube",       dados.agenteLivre ? "Free Agent" : dados.clube || "clube fc");
  set("radioPos",         dados.posicao   || "posição");
  set("radioPlat",        dados.plataforma || "plataforma");
  set("topo-overall",     dados.overall   || "—");
}

// ─── 5. Preencher formulário ──────────────────────────────────────────────────
function preencherForm(dados) {
  const campos = {
    nickname:     dados.nickname  || "",
    "ea-id":      dados.eaId      || "",
    altura:       dados.altura    || "",
    peso:         dados.peso      || "",
    overall:      dados.overall   || "",
    nivel:        dados.nivel     || "",
    "clube-atual": dados.clube    || "",
  };
  Object.entries(campos).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  const chkFA = document.getElementById("agente-livre");
  if (chkFA) chkFA.checked = !!dados.agenteLivre;

  if (dados.posicao) {
    const r = document.querySelector(`input[name="posicao"][value="${dados.posicao}"]`);
    if (r) r.checked = true;
  }
  if (dados.plataforma) {
    const r = document.querySelector(`input[name="plataforma"][value="${dados.plataforma}"]`);
    if (r) r.checked = true;
  }
}

// ─── 6. Configurar formulário (submit → Firestore) ────────────────────────────
function configurarForm(uid) {
  const form = document.getElementById("form-dados-jogador");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const dados = {
      nickname:    document.getElementById("nickname")?.value.trim()      || "",
      eaId:        document.getElementById("ea-id")?.value.trim()         || "",
      altura:      document.getElementById("altura")?.value               || "",
      peso:        document.getElementById("peso")?.value                 || "",
      overall:     document.getElementById("overall")?.value              || "",
      nivel:       document.getElementById("nivel")?.value                || "",
      clube:       document.getElementById("clube-atual")?.value.trim()   || "",
      agenteLivre: document.getElementById("agente-livre")?.checked       || false,
      posicao:     document.querySelector('input[name="posicao"]:checked')?.value    || "",
      plataforma:  document.querySelector('input[name="plataforma"]:checked')?.value || "",
    };

    // Preserva a fotoURL já salva (não sobrescreve ao salvar o form)
    const atual = await carregarDoFirestore(uid);
    if (atual.fotoURL) dados.fotoURL = atual.fotoURL;

    const ok = await salvarNoFirestore(uid, dados);
    if (ok) {
      atualizarTopo(dados);
      toast("✅ Perfil salvo com sucesso!");
    } else {
      toast("❌ Erro ao salvar. Tente novamente.", "erro");
    }
  });
}

// ─── 7. Upload de foto ────────────────────────────────────────────────────────
function configurarUploadFoto(uid) {
  const inputFoto = document.getElementById("upload-foto");
  const preview   = document.getElementById("foto-perfil-preview");
  if (!inputFoto || !preview) return;

  inputFoto.addEventListener("change", () => {
    const arquivo = inputFoto.files[0];
    if (!arquivo) return;
    if (arquivo.size > 2 * 1024 * 1024) {
      toast("⚠️ Imagem muito grande. Use até 2 MB.", "erro");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      preview.src = base64;
      await salvarNoFirestore(uid, { fotoURL: base64 });
    };
    reader.readAsDataURL(arquivo);
  });
}

// ─── 8. Free Agent — desabilita campo de clube ───────────────────────────────
function configurarFreeAgent() {
  const chk        = document.getElementById("agente-livre");
  const inputClube = document.getElementById("clube-atual");
  if (!chk || !inputClube) return;

  function toggle() {
    inputClube.disabled     = chk.checked;
    inputClube.style.opacity = chk.checked ? "0.4" : "1";
    if (chk.checked) inputClube.value = "";
  }
  chk.addEventListener("change", toggle);
  toggle();
}

// ─── 9. Live preview (topo atualiza enquanto digita) ─────────────────────────
function configurarLivePreview() {
  const mapa = {
    nickname:     "usuario-nickname",
    overall:      "topo-overall",
    "clube-atual": "inputClube",
    "ea-id":      "usuario-email",
  };
  Object.entries(mapa).forEach(([inputId, topoId]) => {
    const el   = document.getElementById(inputId);
    const alvo = document.getElementById(topoId);
    if (!el || !alvo) return;
    el.addEventListener("input", () => {
      if (inputId === "ea-id")
        alvo.textContent = el.value ? `EA ID: ${el.value}` : "carregando Nick EA...";
      else if (inputId === "nickname")
        alvo.textContent = el.value || "Jogador Pro Clubs";
      else
        alvo.textContent = el.value || "—";
    });
  });

  document.querySelectorAll('input[name="posicao"]').forEach((r) =>
    r.addEventListener("change", () => {
      const el = document.getElementById("radioPos");
      if (el) el.textContent = r.value;
    })
  );
  document.querySelectorAll('input[name="plataforma"]').forEach((r) =>
    r.addEventListener("change", () => {
      const el = document.getElementById("radioPlat");
      if (el) el.textContent = r.value;
    })
  );

  const chk = document.getElementById("agente-livre");
  if (chk) {
    chk.addEventListener("change", () => {
      const el = document.getElementById("inputClube");
      if (el) el.textContent = chk.checked
        ? "Free Agent"
        : document.getElementById("clube-atual")?.value || "clube fc";
    });
  }
}

// ─── 10. Inicialização (aguarda usuário logado) ───────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  iniciarAnimarScroll();

  onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
      // Não logado → redireciona para login
      window.location.href = "../HTML/cadastrar-se.html";
      return;
    }

    const dados = await carregarDoFirestore(usuario.uid);

    atualizarTopo(dados);
    preencherForm(dados);
    configurarForm(usuario.uid);
    configurarUploadFoto(usuario.uid);
    configurarFreeAgent();
    configurarLivePreview();
  });
});
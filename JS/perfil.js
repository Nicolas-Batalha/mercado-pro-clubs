/**
 * perfil.js — Mercado Pro Clubs
 * Responsabilidades:
 *  1. animar-scroll  → Intersection Observer para elementos .animar-scroll
 *  2. Topo do perfil → resume as configurações salvas
 *  3. Formulário     → carrega dados salvos e persiste ao salvar
 *  4. Upload de foto → preview + armazenamento em base64
 */
function iniciarAnimarScroll() {
  const elementos = document.querySelectorAll(".animar-scroll");

  if (!elementos.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visivel");
          // Para de observar depois de animar (performance)
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  elementos.forEach((el) => observer.observe(el));
}

// ─────────────────────────────────────────────
// 2. CHAVE DE ARMAZENAMENTO
// ─────────────────────────────────────────────

const STORAGE_KEY = "perfil_jogador_v1";

/** Lê o objeto de perfil do localStorage (ou retorna objeto vazio). */
function lerPerfil() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Grava o objeto de perfil no localStorage. */
function salvarPerfil(dados) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}

// ─────────────────────────────────────────────
// 3. SEÇÃO TOPO — resumo do perfil salvo
// ─────────────────────────────────────────────

/** Mapeia o value do radio de plataforma para um ícone legível. */
const ICONE_PLATAFORMA = {
  playstation5: "../IMG/logo-ps.svg",
  playstation4: "../IMG/logo-ps.svg",
  "xbox serie": "../IMG/logo-xbox.svg",
  "xbox one": "../IMG/logo-xbox.svg",
  pc: "../IMG/logo-pc.svg",
  switch2: "../IMG/logo-switch.svg",
  switch1: "../IMG/logo-switch.svg",
};

/** Mapeia posições para labels curtos de ícone de luvas/jogador. */

function atualizarTopoDosPerfil(dados) {
  // — Foto de perfil —
  const fotoPrev = document.getElementById("foto-perfil-preview");
  if (fotoPrev && dados.foto) {
    fotoPrev.src = dados.foto;
  }

  // — Nickname (h2 de destaque) —
  const elNick = document.getElementById("usuario-nickname");
  if (elNick) {
    elNick.textContent = dados.nickname || "Jogador Pro Clubs";
  }

  // — ID da EA (subtítulo / email-topo) —
  const elEmail = document.getElementById("usuario-email");
  if (elEmail) {
    elEmail.textContent = dados.eaId
      ? `EA ID: ${dados.eaId}`
      : "carregando Nick EA...";
  }

  // — Clube —
  const elClube = document.getElementById("inputClube");
  if (elClube) {
    elClube.textContent =
      dados.agenteLivre
        ? "Free Agent "
        : dados.clube || "clube fc";
  }

  // — Posição —
  const elPos = document.getElementById("radioPos");
  if (elPos) {
    elPos.textContent = dados.posicao || "posição";
  }

  // — Plataforma: atualiza ícone e texto —
  const elPlat = document.getElementById("radioPlat");
  if (elPlat) {
    elPlat.textContent = dados.plataforma || "plataforma";
  }

  // Troca o ícone de plataforma (img ao lado do texto)
  const plat = elPlat?.previousElementSibling;
  if (imgPlat && imgPlat.tagName === "IMG" && dados.plataforma) {
    const novoSrc = ICONE_PLATAFORMA[dados.plataforma];
    if (novoSrc) imgPlat.src = novoSrc;
  }

  // — Overall —
  const elOverall = document.getElementById("topo-overall");
  if (elOverall) {
    elOverall.textContent = dados.overall || "—";
  }
}

// ─────────────────────────────────────────────
// 4. PREENCHER O FORMULÁRIO COM DADOS SALVOS
// ─────────────────────────────────────────────

function preencherFormulario(dados) {
  // Campos de texto / número
  const campos = {
    nickname: dados.nickname || "",
    "ea-id": dados.eaId || "",
    altura: dados.altura || "",
    peso: dados.peso || "",
    overall: dados.overall || "",
    nivel: dados.nivel || "",
    "clube-atual": dados.clube || "",
  };

  Object.entries(campos).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) el.value = valor;
  });

  // Checkbox free agent
  const chkFA = document.getElementById("agente-livre");
  if (chkFA) chkFA.checked = !!dados.agenteLivre;

  // Radio posição
  if (dados.posicao) {
    const rPos = document.querySelector(
      `input[name="posicao"][value="${dados.posicao}"]`
    );
    if (rPos) rPos.checked = true;
  }

  // Radio plataforma
  if (dados.plataforma) {
    const rPlat = document.querySelector(
      `input[name="plataforma"][value="${dados.plataforma}"]`
    );
    if (rPlat) rPlat.checked = true;
  }
}

// ─────────────────────────────────────────────
// 5. SALVAR FORMULÁRIO
// ─────────────────────────────────────────────

function configurarFormulario() {
  const form = document.getElementById("form-dados-jogador");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const posicaoEl = document.querySelector('input[name="posicao"]:checked');
    const plataformaEl = document.querySelector(
      'input[name="plataforma"]:checked'
    );

    const dadosAtuais = lerPerfil(); // preserva a foto já salva

    const novosDados = {
      ...dadosAtuais,
      nickname: document.getElementById("nickname")?.value.trim() || "",
      eaId: document.getElementById("ea-id")?.value.trim() || "",
      altura: document.getElementById("altura")?.value || "",
      peso: document.getElementById("peso")?.value || "",
      overall: document.getElementById("overall")?.value || "",
      nivel: document.getElementById("nivel")?.value || "",
      clube: document.getElementById("clube-atual")?.value.trim() || "",
      agenteLivre: document.getElementById("agente-livre")?.checked || false,
      posicao: posicaoEl?.value || "",
      plataforma: plataformaEl?.value || "",
    };

    salvarPerfil(novosDados);
    atualizarTopoDosPerfil(novosDados);

    mostrarFeedback("✅ Perfil salvo com sucesso!");
  });
}

/** Exibe um toast temporário de feedback. */
function mostrarFeedback(msg) {
  // Remove toast anterior se existir
  document.getElementById("toast-perfil")?.remove();

  const toast = document.createElement("div");
  toast.id = "toast-perfil";
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "30px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#12E06C",
    color: "#050B14",
    padding: "12px 28px",
    borderRadius: "30px",
    fontWeight: "bold",
    fontSize: "15px",
    zIndex: "9999",
    boxShadow: "0 0 20px rgba(18,224,108,0.5)",
    transition: "opacity 0.5s ease",
    opacity: "1",
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
  }, 2500);
}

// ─────────────────────────────────────────────
// 6. UPLOAD & PREVIEW DE FOTO
// ─────────────────────────────────────────────

function configurarUploadFoto() {
  const inputFoto = document.getElementById("upload-foto");
  const preview = document.getElementById("foto-perfil-preview");
  if (!inputFoto || !preview) return;

  inputFoto.addEventListener("change", () => {
    const arquivo = inputFoto.files[0];
    if (!arquivo) return;

    // Valida tamanho (máx 2 MB para caber no localStorage)
    if (arquivo.size > 2 * 1024 * 1024) {
      mostrarFeedback("⚠️ Imagem muito grande. Use até 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      preview.src = base64;

      // Salva a foto junto com os demais dados
      const dados = lerPerfil();
      dados.foto = base64;
      salvarPerfil(dados);
    };
    reader.readAsDataURL(arquivo);
  });
}

// ─────────────────────────────────────────────
// 7. FREE AGENT — desabilita campo de clube
// ─────────────────────────────────────────────

function configurarFreeAgent() {
  const chk = document.getElementById("agente-livre");
  const inputClube = document.getElementById("clube-atual");
  if (!chk || !inputClube) return;

  function toggleClube() {
    if (chk.checked) {
      inputClube.disabled = true;
      inputClube.style.opacity = "0.4";
      inputClube.value = "";
    } else {
      inputClube.disabled = false;
      inputClube.style.opacity = "1";
    }
  }

  chk.addEventListener("change", toggleClube);
  toggleClube(); // aplica estado inicial
}

// ─────────────────────────────────────────────
// 8. SINCRONIZAÇÃO DINÂMICA (live preview no topo)
// ─────────────────────────────────────────────

/**
 * Atualiza o topo enquanto o usuário digita / seleciona,
 * sem precisar salvar primeiro.
 */
function configurarLivePreview() {
  // Campos de texto → topo
  const mapCampos = {
    nickname: "usuario-nickname",
    overall: "topo-overall",
    "clube-atual": "inputClube",
    "ea-id": "usuario-email",
  };

  Object.entries(mapCampos).forEach(([inputId, topoId]) => {
    const el = document.getElementById(inputId);
    const alvo = document.getElementById(topoId);
    if (!el || !alvo) return;

    el.addEventListener("input", () => {
      if (inputId === "ea-id") {
        alvo.textContent = el.value ? `EA ID: ${el.value}` : "carregando Nick EA...";
      } else if (inputId === "nickname") {
        alvo.textContent = el.value || "Jogador Pro Clubs";
      } else {
        alvo.textContent = el.value || alvo.dataset.placeholder || "—";
      }
    });
  });

  // Radios de posição → topo
  document.querySelectorAll('input[name="posicao"]').forEach((r) => {
    r.addEventListener("change", () => {
      const elPos = document.getElementById("radioPos");
      if (elPos) elPos.textContent = r.value;
    });
  });

  // Radios de plataforma → topo
  document.querySelectorAll('input[name="plataforma"]').forEach((r) => {
    r.addEventListener("change", () => {
      const elPlat = document.getElementById("radioPlat");
      if (elPlat) elPlat.textContent = r.value;
    });
  });

  // Free agent → clube no topo
  const chk = document.getElementById("agente-livre");
  if (chk) {
    chk.addEventListener("change", () => {
      const elClube = document.getElementById("inputClube");
      if (elClube) {
        elClube.textContent = chk.checked
          ? "Free Agent"
          : document.getElementById("clube-atual")?.value || "clube fc";
      }
    });
  }
}

// ─────────────────────────────────────────────
// 9. INICIALIZAÇÃO
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Animação de scroll
  iniciarAnimarScroll();

  // Carrega dados salvos
  const dados = lerPerfil();

  // Atualiza seção de topo (resumo)
  atualizarTopoDosPerfil(dados);

  // Preenche o formulário
  preencherFormulario(dados);

  // Configura eventos
  configurarFormulario();
  configurarUploadFoto();
  configurarFreeAgent();
  configurarLivePreview();
});
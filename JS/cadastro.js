// Controla as abas de criação de conta e login.
const tabCadastro = document.getElementById("tabCadastro");
const tabLogin = document.getElementById("tabLogin");
const formCadastro = document.getElementById("form-cadastro");
const formLogin = document.getElementById("form-login");
const CHAVE_PERFIL_INICIAL = "mercadoPerfilInicial";
const PERFIS_INICIAIS = new Set(["jogador", "capitao"]);
const botoesPerfil = [...document.querySelectorAll("[data-perfil-inicial]")];
const tituloIntencao = document.getElementById("cad-intencao-titulo");
const descricaoIntencao = document.getElementById("cad-intencao-descricao");
const botaoCriarConta = formCadastro?.querySelector('button[type="submit"]');

function perfilDaUrl() {
  const perfil = new URLSearchParams(window.location.search).get("perfil");
  return PERFIS_INICIAIS.has(perfil) ? perfil : "";
}

function perfilSalvo() {
  try {
    const perfil = localStorage.getItem(CHAVE_PERFIL_INICIAL) || "";
    return PERFIS_INICIAIS.has(perfil) ? perfil : "";
  } catch {
    return "";
  }
}

function definirPerfilInicial(perfil, atualizarUrl = true) {
  if (!PERFIS_INICIAIS.has(perfil)) return;
  try {
    localStorage.setItem(CHAVE_PERFIL_INICIAL, perfil);
  } catch {
    // A URL continua preservando a escolha quando o armazenamento local está indisponível.
  }

  botoesPerfil.forEach((botao) => {
    const ativo = botao.dataset.perfilInicial === perfil;
    botao.classList.toggle("ativo", ativo);
    botao.setAttribute("aria-pressed", String(ativo));
  });

  const capitao = perfil === "capitao";
  if (tituloIntencao) tituloIntencao.textContent = capitao ? "Você vai começar como capitão" : "Você vai começar como jogador";
  if (descricaoIntencao) {
    descricaoIntencao.textContent = capitao
      ? "Depois de entrar, você poderá criar o clube, organizar o elenco e publicar a primeira vaga."
      : "Depois de entrar, você completará posição, plataforma e OVR para encontrar vagas compatíveis.";
  }
  if (botaoCriarConta) botaoCriarConta.textContent = capitao ? "Criar conta de capitão" : "Criar conta de jogador";

  if (atualizarUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("perfil", perfil);
    history.replaceState(null, "", url.toString());
  }
}

botoesPerfil.forEach((botao) => {
  botao.setAttribute("aria-pressed", "false");
  botao.addEventListener("click", () => definirPerfilInicial(botao.dataset.perfilInicial));
});

const perfilInicial = perfilDaUrl() || perfilSalvo();
if (perfilInicial) definirPerfilInicial(perfilInicial, false);


function selecionarAba(modo, atualizarHash = true) {
  const loginAtivo = modo === "login";

  tabCadastro?.classList.toggle("active", !loginAtivo);
  tabLogin?.classList.toggle("active", loginAtivo);
  formCadastro?.classList.toggle("active", !loginAtivo);
  formLogin?.classList.toggle("active", loginAtivo);

  if (tabCadastro) {
    tabCadastro.setAttribute("aria-selected", String(!loginAtivo));
    tabCadastro.tabIndex = loginAtivo ? -1 : 0;
  }
  if (tabLogin) {
    tabLogin.setAttribute("aria-selected", String(loginAtivo));
    tabLogin.tabIndex = loginAtivo ? 0 : -1;
  }
  if (formCadastro) formCadastro.hidden = loginAtivo;
  if (formLogin) formLogin.hidden = !loginAtivo;

  if (atualizarHash) {
    const url = new URL(window.location.href);
    url.hash = loginAtivo ? "login" : "cadastro";
    history.replaceState(null, "", url.toString());
  }
}

tabCadastro?.addEventListener("click", () => selecionarAba("cadastro"));
tabLogin?.addEventListener("click", () => selecionarAba("login"));

[tabCadastro, tabLogin].forEach((tab) => {
  tab?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const proximoModo = tab === tabCadastro ? "login" : "cadastro";
    selecionarAba(proximoModo);
    (proximoModo === "login" ? tabLogin : tabCadastro)?.focus();
  });
});

window.addEventListener("hashchange", () => {
  selecionarAba(location.hash === "#login" ? "login" : "cadastro", false);
});

selecionarAba(location.hash === "#login" ? "login" : "cadastro", false);

// Mostrar ou ocultar senhas sem alterar o valor digitado.
document.querySelectorAll(".cad-mostrar-senha").forEach((botao) => {
  botao.addEventListener("click", () => {
    const campo = document.getElementById(botao.dataset.alvo);
    if (!campo) return;
    const mostrar = campo.type === "password";
    campo.type = mostrar ? "text" : "password";
    botao.textContent = mostrar ? "Ocultar" : "Mostrar";
    botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
  });
});

// Indicador simples de força: orienta sem guardar ou enviar a senha.
const campoSenha = document.getElementById("senha");
const forcaSenha = document.getElementById("forca-senha");
campoSenha?.addEventListener("input", () => {
  if (!forcaSenha) return;
  const valor = campoSenha.value;
  forcaSenha.className = "cad-senha-dica";
  if (!valor) {
    forcaSenha.textContent = "Use 10 ou mais caracteres, com maiúscula, minúscula, número e símbolo.";
    return;
  }
  const pontos = [
    valor.length >= 10,
    /[a-z]/.test(valor) && /[A-Z]/.test(valor),
    /\d/.test(valor),
    /[^A-Za-z0-9]/.test(valor),
  ].filter(Boolean).length;
  if (pontos >= 4) {
    forcaSenha.textContent = "Senha forte.";
    forcaSenha.classList.add("forte");
  } else if (pontos >= 2) {
    forcaSenha.textContent = "Senha média. Misture letras, números e símbolos.";
    forcaSenha.classList.add("media");
  } else {
    forcaSenha.textContent = "Senha fraca. Use 10 caracteres e misture letras, número e símbolo.";
  }
});

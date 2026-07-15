// Controla as abas de criação de conta e login.
const tabCadastro = document.getElementById("tabCadastro");
const tabLogin = document.getElementById("tabLogin");
const formCadastro = document.getElementById("form-cadastro");
const formLogin = document.getElementById("form-login");

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
    history.replaceState(null, "", loginAtivo ? "#login" : "#cadastro");
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
    forcaSenha.textContent = "Use 8 ou mais caracteres.";
    return;
  }
  const pontos = [
    valor.length >= 8,
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
    forcaSenha.textContent = "Senha fraca. Use pelo menos 8 caracteres.";
  }
});

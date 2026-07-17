import { auth } from "./firebase-config.js";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const parametros = new URLSearchParams(window.location.search);
const modo = parametros.get("mode") || "";
const codigo = parametros.get("oobCode") || "";
const continuarRecebido = parametros.get("continueUrl") || "";
const titulo = document.getElementById("acao-email-titulo");
const mensagem = document.getElementById("acao-email-mensagem");
const icone = document.getElementById("acao-email-icone");
const formSenha = document.getElementById("acao-email-form-senha");
const linkContinuar = document.getElementById("acao-email-continuar");

function urlContinuacaoSegura() {
  try {
    const url = new URL(continuarRecebido);
    if (url.protocol === "https:" && ["mercadoproclubs.com", "www.mercadoproclubs.com"].includes(url.hostname)) return url.href;
  } catch { /* usa o login padrão */ }
  return "./cadastrar-se.html#login";
}

function exibirSucesso(novoTitulo, novaMensagem) {
  titulo.textContent = novoTitulo;
  mensagem.textContent = novaMensagem;
  icone.textContent = "✓";
  icone.classList.add("sucesso");
  linkContinuar.href = urlContinuacaoSegura();
  linkContinuar.hidden = false;
}

function exibirErro(novaMensagem) {
  titulo.textContent = "Este link não pôde ser usado";
  mensagem.textContent = novaMensagem;
  icone.textContent = "!";
  icone.classList.add("erro");
  linkContinuar.href = "./cadastrar-se.html#login";
  linkContinuar.textContent = "SOLICITAR UM NOVO LINK";
  linkContinuar.hidden = false;
}

function senhaForte(senha) {
  return senha.length >= 10
    && /[a-z]/.test(senha)
    && /[A-Z]/.test(senha)
    && /\d/.test(senha)
    && /[^A-Za-z0-9]/.test(senha);
}

async function iniciar() {
  if (!codigo) {
    exibirErro("O endereço está incompleto. Volte ao login e solicite um novo e-mail.");
    return;
  }
  try {
    if (modo === "verifyEmail" || modo === "verifyAndChangeEmail") {
      await applyActionCode(auth, codigo);
      exibirSucesso("E-mail confirmado!", "Sua conta está pronta. Agora você já pode entrar no Mercado Pro Clubs.");
      return;
    }
    if (modo === "resetPassword") {
      const email = await verifyPasswordResetCode(auth, codigo);
      titulo.textContent = "Crie sua nova senha";
      mensagem.textContent = `Defina uma nova senha segura para ${email}.`;
      icone.textContent = "🔒";
      formSenha.hidden = false;
      formSenha.querySelector("input")?.focus();
      return;
    }
    if (modo === "recoverEmail") {
      await checkActionCode(auth, codigo);
      await applyActionCode(auth, codigo);
      exibirSucesso("E-mail recuperado", "A alteração foi desfeita e o endereço anterior voltou para sua conta.");
      return;
    }
    exibirErro("Esta ação não é reconhecida. Volte ao login e solicite um novo link.");
  } catch (erro) {
    console.debug("Falha na ação de e-mail:", erro?.code || erro?.message);
    const expirado = ["auth/expired-action-code", "auth/invalid-action-code"].includes(erro?.code);
    exibirErro(expirado
      ? "Este link expirou ou já foi utilizado. Solicite um novo e-mail na tela de login."
      : "Não foi possível confirmar a solicitação agora. Tente novamente em alguns instantes.");
  }
}

formSenha?.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const senha = document.getElementById("acao-email-senha").value;
  const confirmar = document.getElementById("acao-email-confirmar").value;
  if (!senhaForte(senha)) {
    mensagem.textContent = "A senha ainda não atende a todos os requisitos de segurança.";
    return;
  }
  if (senha !== confirmar) {
    mensagem.textContent = "As duas senhas precisam ser iguais.";
    return;
  }
  const botao = formSenha.querySelector("button");
  botao.disabled = true;
  botao.textContent = "SALVANDO...";
  try {
    await confirmPasswordReset(auth, codigo, senha);
    formSenha.hidden = true;
    exibirSucesso("Senha alterada!", "Sua nova senha foi salva com segurança. Você já pode entrar na conta.");
  } catch (erro) {
    console.debug("Falha ao trocar senha:", erro?.code || erro?.message);
    mensagem.textContent = erro?.code === "auth/weak-password"
      ? "Escolha uma senha mais forte."
      : "O link expirou ou não pôde ser usado. Solicite uma nova recuperação de senha.";
    botao.disabled = false;
    botao.textContent = "SALVAR NOVA SENHA";
  }
});

iniciar();

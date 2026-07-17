// =========================================================================
// MERCADO PRO CLUBS — auth.js
// Responsabilidade: cadastro com e-mail/senha e login com Google.
// NÃO chama initializeApp — importa auth de firebase-config.js.
// =========================================================================

import { auth, db }                                          from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
} 
                                                             from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp }
                                                             from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();
const CONFIGURACAO_ACAO_EMAIL = {
  url: "https://www.mercadoproclubs.com/HTML/cadastrar-se.html#login",
  handleCodeInApp: false,
};

function mensagemErroAuth(err) {
  const mensagens = {
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/weak-password": "A senha não atende aos requisitos de segurança.",
    "auth/popup-closed-by-user": "A janela do Google foi fechada antes de concluir.",
    "auth/popup-blocked": "O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.",
    "auth/network-request-failed": "Falha de conexão. Confira sua internet e tente novamente.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/user-disabled": "Esta conta foi desativada. Entre em contato com o suporte.",
    "auth/operation-not-allowed": "Este método de acesso ainda não está habilitado.",
    "auth/unauthorized-domain": "Este endereço ainda não foi autorizado no Firebase.",
  };
  return mensagens[err?.code] || "Não foi possível concluir. Tente novamente.";
}

function mostrarFeedback(id, mensagem = "", tipo = "") {
  const elemento = document.getElementById(id);
  if (!elemento) return;
  elemento.textContent = mensagem;
  elemento.className = `cad-feedback${tipo ? ` ${tipo}` : ""}`;
}

function definirCarregando(botao, carregando, textoCarregando) {
  if (!botao) return;
  if (carregando) {
    botao.dataset.textoOriginal = botao.textContent;
    botao.textContent = textoCarregando;
    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
    return;
  }
  botao.textContent = botao.dataset.textoOriginal || botao.textContent;
  botao.disabled = false;
  botao.removeAttribute("aria-busy");
}

function destinoAposLogin() {
  const destinoSolicitado = new URLSearchParams(window.location.search).get("continuar");
  if (!destinoSolicitado) return "../index.html";

  try {
    const destino = new URL(destinoSolicitado, window.location.origin);
    const caminhoPermitido = destino.pathname === "/" || destino.pathname.startsWith("/HTML/");
    if (destino.origin !== window.location.origin || !caminhoPermitido) return "../index.html";
    return `${destino.pathname}${destino.search}${destino.hash}`;
  } catch {
    return "../index.html";
  }
}

function irParaInicio() {
  window.location.href = destinoAposLogin();
}

function senhaForte(senha) {
  return senha.length >= 10
    && /[a-z]/.test(senha)
    && /[A-Z]/.test(senha)
    && /\d/.test(senha)
    && /[^A-Za-z0-9]/.test(senha);
}

async function salvarEmailPrivado(user) {
  if (!user?.uid || !user?.email) return;
  await setDoc(doc(db, "jogadoresPrivados", user.uid), {
    email: user.email.trim().toLowerCase(),
    atualizadoEm: serverTimestamp(),
  }, { merge: true });
}

// ─── Utilitário: toast ────────────────────────────────────────────────────────
function toast(msg, tipo = "sucesso") {
  document.getElementById("toast-auth")?.remove();
  const el = Object.assign(document.createElement("div"), {
    id: "toast-auth",
    textContent: msg,
  });
  Object.assign(el.style, {
    position: "fixed", bottom: "24px", right: "24px",
    background: tipo === "sucesso" ? "#12E06C" : "#d32f2f",
    color: tipo === "sucesso" ? "#050B14" : "#fff",
    fontWeight: "bold", padding: "14px 22px", borderRadius: "8px",
    fontFamily: "'Montserrat',sans-serif", fontSize: "0.9rem",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: "9999",
    opacity: "0", transition: "opacity 0.3s",
  });
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = "1"));
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ─── Cadastro com e-mail e senha ──────────────────────────────────────────────
const formCadastro = document.getElementById("form-cadastro");
if (formCadastro) {
  formCadastro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome   = document.getElementById("nome").value.trim();
    const email  = document.getElementById("email").value.trim().toLowerCase();
    const senha  = document.getElementById("senha").value;
    const senha1 = document.getElementById("senha1").value;
    const botao  = formCadastro.querySelector('button[type="submit"]');
    mostrarFeedback("cadastro-feedback");

    if (senha !== senha1) {
      toast("As senhas não coincidem, craque!", "erro");
      mostrarFeedback("cadastro-feedback", "As senhas digitadas não são iguais.", "erro");
      return;
    }

    if (nome.length < 3) {
      mostrarFeedback("cadastro-feedback", "Use um nome com pelo menos 3 caracteres.", "erro");
      document.getElementById("nome")?.focus();
      return;
    }

    if (!senhaForte(senha)) {
      mostrarFeedback(
        "cadastro-feedback",
        "Use 10 ou mais caracteres, com letra maiúscula, minúscula, número e símbolo.",
        "erro",
      );
      document.getElementById("senha")?.focus();
      return;
    }

    definirCarregando(botao, true, "Criando conta...");
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, senha);
      try {
        await updateProfile(user, { displayName: nome });
      } catch (perfilAuthErr) {
        console.warn("Não foi possível atualizar o nome da conta:", perfilAuthErr);
      }
      try {
        await setDoc(doc(db, "jogadores", user.uid), {
          nickname: nome,
          criadoEm: serverTimestamp(),
        }, { merge: true });
        await salvarEmailPrivado(user);
      } catch (perfilErr) {
        console.error("Conta criada, mas o perfil inicial não pôde ser salvo:", perfilErr);
      }
      let verificacaoEnviada = true;
      try {
        await sendEmailVerification(user, CONFIGURACAO_ACAO_EMAIL);
      } catch (verificacaoErr) {
        verificacaoEnviada = false;
        console.warn("Conta criada, mas o e-mail de verificação não pôde ser enviado:", verificacaoErr);
      }
      try {
        await signOut(auth);
      } catch (logoutErr) {
        console.warn("Não foi possível encerrar a sessão após o cadastro:", logoutErr);
      }
      const mensagem = verificacaoEnviada
        ? "Conta criada! Abra o link enviado ao seu e-mail e depois faça login."
        : "Conta criada, mas o link não foi enviado. Tente entrar novamente para reenviar.";
      mostrarFeedback("cadastro-feedback", mensagem, verificacaoEnviada ? "sucesso" : "aviso");
      toast(`Conta criada! Agora confirme seu e-mail, ${nome}.`);
      formCadastro.reset();
      definirCarregando(botao, false);
    } catch (err) {
      const mensagem = mensagemErroAuth(err);
      toast(mensagem, "erro");
      mostrarFeedback("cadastro-feedback", mensagem, "erro");
      definirCarregando(botao, false);
    }
  });
}

// ─── Login com e-mail e senha ────────────────────────────────────────────────
const formLogin = document.getElementById("form-login");
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const senha = document.getElementById("login-senha").value;
    const botao = formLogin.querySelector('button[type="submit"]');

    mostrarFeedback("login-feedback");
    definirCarregando(botao, true, "Entrando...");
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, senha);
      if (!user.emailVerified) {
        try {
          await sendEmailVerification(user, CONFIGURACAO_ACAO_EMAIL);
        } catch (verificacaoErr) {
          console.warn("Não foi possível reenviar a verificação:", verificacaoErr);
        }
        await signOut(auth);
        mostrarFeedback(
          "login-feedback",
          "Confirme seu e-mail antes de entrar. Se possível, reenviamos um novo link agora.",
          "aviso",
        );
        toast("Confirme seu e-mail para liberar a conta.", "erro");
        definirCarregando(botao, false);
      } else {
        await salvarEmailPrivado(user).catch((perfilErr) => {
          console.warn("Não foi possível atualizar o e-mail privado:", perfilErr);
        });
        toast("Login realizado com sucesso!");
        mostrarFeedback("login-feedback", "Login realizado com sucesso!", "sucesso");
        setTimeout(irParaInicio, 800);
      }
    } catch (err) {
      const mensagem = mensagemErroAuth(err);
      toast(mensagem, "erro");
      mostrarFeedback("login-feedback", mensagem, "erro");
      definirCarregando(botao, false);
    }
  });
}

// ─── Recuperação de senha ───────────────────────────────────────────────────
const btnEsqueciSenha = document.getElementById("btn-esqueci-senha");
btnEsqueciSenha?.addEventListener("click", async () => {
  const campoEmail = document.getElementById("login-email");
  const email = campoEmail?.value.trim().toLowerCase() || "";
  mostrarFeedback("login-feedback");

  if (!email || !campoEmail?.checkValidity()) {
    mostrarFeedback("login-feedback", "Digite um e-mail válido para recuperar a senha.", "erro");
    campoEmail?.focus();
    campoEmail?.reportValidity();
    return;
  }

  definirCarregando(btnEsqueciSenha, true, "Enviando...");
  try {
    await sendPasswordResetEmail(auth, email, CONFIGURACAO_ACAO_EMAIL);
    mostrarFeedback(
      "login-feedback",
      "Se existir uma conta com esse e-mail, você receberá o link para criar uma nova senha.",
      "sucesso",
    );
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      mostrarFeedback(
        "login-feedback",
        "Se existir uma conta com esse e-mail, você receberá o link para criar uma nova senha.",
        "sucesso",
      );
    } else {
      mostrarFeedback("login-feedback", mensagemErroAuth(err), "erro");
    }
  } finally {
    definirCarregando(btnEsqueciSenha, false);
  }
});

// ─── Login / Cadastro com Google ──────────────────────────────────────────────
const btnGoogle = document.getElementById("btn-google");
if (btnGoogle) {
  btnGoogle.addEventListener("click", async () => {
    mostrarFeedback("google-feedback");
    definirCarregando(btnGoogle, true, "Conectando ao Google...");
    try {
      const { user } = await signInWithPopup(auth, googleProvider);
      try {
        const perfilRef = doc(db, "jogadores", user.uid);
        const perfilSnap = await getDoc(perfilRef);
        if (!perfilSnap.exists()) {
          await setDoc(perfilRef, {
            nickname: user.displayName || "Jogador",
            fotoURL: user.photoURL || "",
            criadoEm: serverTimestamp(),
          });
        }
        await salvarEmailPrivado(user);
      } catch (perfilErr) {
        console.error("Login concluído, mas o perfil inicial não pôde ser salvo:", perfilErr);
      }
      mostrarFeedback("google-feedback", "Conta conectada com sucesso!", "sucesso");
      toast(`Conectado: ${user.displayName || user.email || "Jogador"}`);
      setTimeout(irParaInicio, 1000);
    } catch (err) {
      const mensagem = mensagemErroAuth(err);
      toast(mensagem, "erro");
      mostrarFeedback("google-feedback", mensagem, "erro");
      definirCarregando(btnGoogle, false);
    }
  });
}

// ─── Validação de senha em tempo real ────────────────────────────────────────
window.validarSenha = function (input) {
  const senha = document.getElementById("senha")?.value;
  if (senha !== undefined) {
    input.setCustomValidity(input.value !== senha ? "As senhas não batem!" : "");
  }
};

document.getElementById("senha")?.addEventListener("input", () => {
  const confirmacao = document.getElementById("senha1");
  if (confirmacao) window.validarSenha(confirmacao);
});

document.getElementById("senha1")?.addEventListener("input", (event) => {
  window.validarSenha(event.currentTarget);
});

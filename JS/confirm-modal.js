// =========================================================================
// MERCADO PRO CLUBS — confirm-modal.js
// Modal de confirmação reutilizável, no lugar do confirm() nativo do navegador.
// Uso:
//   const ok = await confirmModal({ mensagem: "Tem certeza?" });
//   if (!ok) return;
//
// Opções aceitas:
//   titulo           (string)  — padrão: "Confirmar ação"
//   mensagem         (string)  — obrigatório
//   textoConfirmar   (string)  — padrão: "Confirmar"
//   textoCancelar    (string)  — padrão: "Cancelar"
//   destrutivo       (bool)    — deixa o botão de confirmar vermelho (ações
//                                 que não têm volta, tipo excluir/remover)
// =========================================================================

export function confirmModal({
  titulo = "Confirmar ação",
  mensagem = "Tem certeza?",
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  destrutivo = false,
} = {}) {
  return new Promise((resolve) => {
    document.getElementById("modal-confirm")?.remove();
    const focoAnterior = document.activeElement;

    const overlay = document.createElement("div");
    overlay.id = "modal-confirm";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="modal-confirm-titulo" aria-describedby="modal-confirm-mensagem">
        <h3 id="modal-confirm-titulo" class="modal-confirm-titulo"></h3>
        <p id="modal-confirm-mensagem" class="modal-confirm-mensagem"></p>
        <div class="modal-confirm-acoes">
          <button type="button" class="modal-confirm-cancelar"></button>
          <button type="button" class="modal-confirm-confirmar${destrutivo ? " destrutivo" : ""}"></button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const botaoCancelar = overlay.querySelector(".modal-confirm-cancelar");
    const botaoConfirmar = overlay.querySelector(".modal-confirm-confirmar");
    overlay.querySelector(".modal-confirm-titulo").textContent = String(titulo);
    overlay.querySelector(".modal-confirm-mensagem").textContent = String(mensagem);
    botaoCancelar.textContent = String(textoCancelar);
    botaoConfirmar.textContent = String(textoConfirmar);

    let finalizado = false;

    const finalizar = (resultado) => {
      if (finalizado) return;
      finalizado = true;
      document.removeEventListener("keydown", aoTeclar);
      overlay.remove();
      if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) focoAnterior.focus();
      resolve(resultado);
    };

    const aoTeclar = (e) => {
      if (e.key === "Escape") finalizar(false);
      if (e.key === "Enter") finalizar(document.activeElement !== botaoCancelar);
    };

    botaoCancelar.addEventListener("click", () => finalizar(false));
    botaoConfirmar.addEventListener("click", () => finalizar(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) finalizar(false); });
    document.addEventListener("keydown", aoTeclar);

    botaoConfirmar.focus();
  });
}

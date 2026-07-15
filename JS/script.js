// Anima elementos com a classe 'animar-scroll' ao entrarem na tela.
const elementosAnimados = document.querySelectorAll(".animar-scroll");

if ("IntersectionObserver" in window) {
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add("mostrar");
      observador.unobserve(entrada.target);
    });
  });

  elementosAnimados.forEach((el) => observador.observe(el));
} else {
  elementosAnimados.forEach((el) => el.classList.add("mostrar"));
}

// Anima elementos com a classe 'animar-scroll' ao entrarem na tela
const observador = new IntersectionObserver((entradas) => {
  entradas.forEach((entrada) => {
    if (entrada.isIntersecting) {
      entrada.target.classList.add('mostrar');
    }
  });
});

document.querySelectorAll('.animar-scroll').forEach((el) => observador.observe(el));
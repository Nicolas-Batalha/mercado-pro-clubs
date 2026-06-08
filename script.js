// Seleciona todos os elementos que têm a classe 'animar-scroll'
const elementosAnimados = document.querySelectorAll('.animar-scroll');

// Cria um "Observador" para ver quando os elementos aparecem na tela
const observador = new IntersectionObserver((entradas) => {
  entradas.forEach((entrada) => {
    // Se o elemento entrou na área visível da tela
    if (entrada.isIntersecting) {
      // Adiciona a classe que faz ele aparecer
      entrada.target.classList.add('mostrar');
    }
  });
});

// Pede para o observador vigiar cada um dos cards
elementosAnimados.forEach((elemento) => {
  observador.observe(elemento);
});
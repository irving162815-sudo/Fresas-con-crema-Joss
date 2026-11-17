// Componentes comunes hechos con JavaScript para que las páginas funcionen sin servidor.
const publicPages = [
  ['home', 'index.html', 'Inicio'],
  ['menu', 'menu.html', 'Menú'],
  ['about', 'sobre-nosotros.html', 'Sobre nosotros'],
  ['social', 'redes.html', 'Nuestras redes'],
  ['order', 'pedido.html', 'Pedidos'],
  ['register', 'registro.html', 'Cliente fiel']
];

function makeHeader() {
  const activePage = document.body.dataset.page;
  const links = publicPages.map(([page, file, label]) => {
    const active = page === activePage;
    const classes = `${active ? 'active ' : ''}${page === 'register' ? 'nav-cta' : ''}`.trim();
    return `<a class="${classes}" href="${file}"${active ? ' aria-current="page"' : ''}>${label}${page === 'register' ? ' <span>♡</span>' : ''}</a>`;
  }).join('');

  return `<header class="site-header">
    <a class="brand" href="index.html" aria-label="Jossy’s Berry PTY, inicio"><img src="assets/logo-jossys-berry.jpeg" alt=""><span>Jossy’s <b>Berry PTY</b></span></a>
    <button class="menu-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="main-nav"><span></span><span></span><span></span></button>
    <nav id="main-nav" class="main-nav" aria-label="Navegación principal">${links}</nav>
  </header>`;
}

function makeFooter() {
  return `<footer class="site-footer">
    <a class="brand" href="index.html"><img src="assets/logo-jossys-berry.jpeg" alt=""><span>Jossy’s <b>Berry PTY</b></span></a>
    <div class="footer-social"><p>Encuéntranos y escríbenos</p>
      <a class="social-link" href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="ig-dot" cx="18" cy="6" r="1"/></svg> Instagram</a>
      <a class="social-link" href="https://wa.me/50764347297" target="_blank" rel="noopener noreferrer">WhatsApp 6434-7297</a>
      <a class="social-link" href="https://wa.me/50766260366" target="_blank" rel="noopener noreferrer">WhatsApp 6626-0366</a>
    </div><p class="copyright">© <span data-year></span> Jossy’s Berry PTY · Frescura y dulzura</p>
    <a class="footer-report-link" href="reportar.html">Reportar una falla</a>
  </footer>`;
}

function makeAssistant() {
  return `<a class="admin-corner" href="admin.html" aria-label="Abrir acceso de administración">♙ <span>Acceso admin</span></a>
  <button class="assistant-launcher" id="assistant-launcher" type="button" aria-label="Abrir chatbot">✦ <span>¿Te ayudo?</span></button>
  <aside class="assistant-panel" id="assistant-panel" aria-label="Chatbot Berry" hidden>
    <div class="assistant-head"><div><span class="assistant-spark">✦</span><strong>Chatbot Berry</strong><small>Tu ayudante de Jossy’s Berry 🍓</small></div><button type="button" id="assistant-close" aria-label="Cerrar chat">×</button></div>
    <div class="assistant-messages" id="assistant-messages" aria-live="polite"><p class="bot-message">¡Hola! Puedo contarte sobre nuestros productos, ayudarte con un pedido o avisar al equipo si necesitas hablar con alguien.</p></div>
    <div class="quick-questions"><button type="button" data-prompt="Cuéntame el menú de Jossy's Berry">Ver menú</button><button type="button" data-prompt="Quiero hacer un pedido">Hacer pedido</button><button type="button" data-prompt="Quiero hablar con una persona">Hablar con alguien</button></div>
    <form id="assistant-form" class="assistant-form"><input id="assistant-input" autocomplete="off" aria-label="Escribe tu pregunta" placeholder="Escribe tu pregunta…"><button type="submit" aria-label="Enviar mensaje">➤</button></form>
  </aside>`;
}

// Completa cada espacio reservado con el encabezado, el pie y el chatbot.
document.querySelector('[data-partial="header"]')?.insertAdjacentHTML('afterbegin', makeHeader());
document.querySelector('[data-partial="footer"]')?.insertAdjacentHTML('afterbegin', makeFooter());
document.querySelector('[data-partial="assistant"]')?.insertAdjacentHTML('afterbegin', makeAssistant());
document.querySelectorAll('[data-year]').forEach((year) => { year.textContent = new Date().getFullYear(); });

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-nav');
menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Abrir menú' : 'Cerrar menú');
  navigation.classList.toggle('is-open', !isOpen);
});

document.querySelector('#welcome-enter')?.addEventListener('click', () => {
  const welcome = document.querySelector('#welcome-screen');
  welcome.classList.add('is-leaving');
  window.setTimeout(() => welcome.remove(), 560);
});

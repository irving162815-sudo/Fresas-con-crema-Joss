// Este archivo reúne los componentes compartidos por las páginas públicas del sitio.
// El mapa relaciona cada identificador de página con su archivo y su nombre de navegación.
const publicPages = [
  ['home', 'index.html', 'Inicio'],
  ['menu', 'menu.html', 'Menú'],
  ['promotions', 'promociones.html', 'Promociones'],
  ['about', 'sobre-nosotros.html', 'Sobre nosotros'],
  ['social', 'redes.html', 'Nuestras redes'],
  ['order', 'pedido.html', 'Pedidos'],
  ['register', 'registro.html', 'Registrarse']
];

// Busca los datos del cliente que inició sesión para mostrar su nombre en el menú.
function readSignedInCustomer() {
  try {
    return JSON.parse(sessionStorage.getItem('jossysBerryCustomer') || 'null');
  } catch { return null; }
}

// Evita que nombres escritos por clientes se interpreten como etiquetas HTML.
function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Dibuja el enlace de inicio de sesión o el saludo de la cuenta activa.
function makeAccountLink(activePage) {
  const customer = readSignedInCustomer();
  return customer
    ? `<span class="signed-in-name">Hola, ${escapeHTML(customer.name)}</span><button class="sign-out-button" id="sign-out" type="button">Salir</button>`
    : `<a class="login-link${activePage === 'login' ? ' active' : ''}" href="iniciar-sesion.html">Iniciar sesión</a>`;
}

// Crea el encabezado común con el logo, navegación y controles de cuenta.
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
    <nav id="main-nav" class="main-nav" aria-label="Navegación principal">${links}<span id="account-area">${makeAccountLink(activePage)}</span></nav>
  </header>`;
}

// Crea el pie de página compartido con redes, WhatsApp y reporte de fallas.
function makeFooter() {
  return `<footer class="site-footer">
    <div class="footer-brand-block">
      <a class="brand" href="index.html"><img src="assets/logo-jossys-berry.jpeg" alt=""><span>Jossy’s <b>Berry PTY</b></span></a>
      <p>Fresas con crema, frescura y dulzura para compartir.</p>
    </div>
    <div class="footer-contact">
      <p class="footer-heading">Hablemos</p>
      <a class="footer-contact-card" href="https://wa.me/50764347297" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp al 6434-7297; número alternativo 6626-0366">
        <img src="Imagenes%20de%20la%20pagina/Imagenes%20adicionales/Logo%20de%20whatsapp.avif" alt="" loading="lazy">
        <span><b>WhatsApp</b><small>6434-7297 · 6626-0366</small></span>
      </a>
    </div>
    <div class="footer-contact">
      <p class="footer-heading">Síguenos y ayuda</p>
      <a class="footer-contact-card" href="https://www.instagram.com/fresa_mania01?dmpr=ZWQxOHFnbTQ0Z3Rw" target="_blank" rel="noopener noreferrer" aria-label="Visitar Instagram Fresamania">
        <img src="Imagenes%20de%20la%20pagina/Imagenes%20adicionales/Logo%20de%20Instagran.avif" alt="" loading="lazy">
        <span><b>Instagram</b><small>@fresa_mania01 · Fresamania</small></span>
      </a>
      <a class="footer-report-link" href="reportar.html">Reportar una falla <span aria-hidden="true">↗</span></a>
    </div>
    <p class="copyright">© <span data-year></span> Jossy’s Berry PTY · Frescura y dulzura</p>
  </footer>`;
}

// Crea el acceso al panel de administración y la ventana del chatbot.
function makeAssistant() {
  return `<a class="admin-corner" href="admin.html" aria-label="Abrir acceso de administración">♙ <span>Acceso admin</span></a>
  <button class="assistant-launcher" id="assistant-launcher" type="button" aria-label="Abrir chatbot">✦ <span>¿Te ayudo?</span></button>
  <aside class="assistant-panel" id="assistant-panel" aria-label="Chatbot Berry" hidden>
    <div class="assistant-head"><div><span class="assistant-spark">✦</span><strong>Chatbot Berry</strong><small>Tu ayudante de Jossy’s Berry 🍓</small></div><button type="button" id="assistant-close" aria-label="Cerrar chat">×</button></div>
    <div class="assistant-messages" id="assistant-messages" aria-live="polite"><p class="bot-message">¡Hola! 🍓 Puedo ayudarte con el menú, precios, toppings, pedidos y pagos. Para hablar con una persona, pídemelo aquí.</p></div>
    <div class="quick-questions" id="assistant-suggestions" aria-label="Sugerencias de preguntas"></div>
    <form id="assistant-form" class="assistant-form"><input id="assistant-input" autocomplete="off" aria-label="Escribe tu pregunta" placeholder="Escribe tu pregunta…"><button type="submit" aria-label="Enviar mensaje">➤</button></form>
  </aside>`;
}

// Completa cada espacio reservado con el encabezado, el pie y el chatbot.
document.querySelector('[data-partial="header"]')?.insertAdjacentHTML('afterbegin', makeHeader());
document.querySelector('[data-partial="footer"]')?.insertAdjacentHTML('afterbegin', makeFooter());
document.querySelector('[data-partial="assistant"]')?.insertAdjacentHTML('afterbegin', makeAssistant());
document.querySelectorAll('[data-year]').forEach((year) => { year.textContent = new Date().getFullYear(); });

// Al iniciar o cerrar sesión, actualiza el nombre visible en el encabezado.
window.addEventListener('jossys-data-changed', () => {
  const accountArea = document.querySelector('#account-area');
  if (!accountArea) return;
  accountArea.innerHTML = makeAccountLink(document.body.dataset.page);
  document.querySelector('#sign-out')?.addEventListener('click', signOut);
});

// Cierra la sesión en el servidor y refresca el nombre que muestra el encabezado.
function signOut() {
  // Pide al servidor cerrar la sesión y borra el nombre temporal de esta pestaña.
  fetch('/api/customers/logout', { method: 'POST', credentials: 'same-origin' })
    .catch(() => {})
    .finally(() => {
      sessionStorage.removeItem('jossysBerryCustomer');
      window.dispatchEvent(new CustomEvent('jossys-data-changed'));
    });
}

document.querySelector('#sign-out')?.addEventListener('click', signOut);

// Confirma con el servidor si esta pestaña tiene una sesión vigente de cliente.
fetch('/api/session', { credentials: 'same-origin' })
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('Sesión no disponible')))
  .then(({ customer }) => {
    if (customer) sessionStorage.setItem('jossysBerryCustomer', JSON.stringify(customer));
    else sessionStorage.removeItem('jossysBerryCustomer');
    window.dispatchEvent(new CustomEvent('jossys-data-changed'));
  })
  .catch(() => {});

// Referencias al botón móvil y al panel de navegación que abre o cierra.
const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-nav');
// Abre y cierra el menú desplegable en pantallas pequeñas.
menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Abrir menú' : 'Cerrar menú');
  navigation.classList.toggle('is-open', !isOpen);
});

document.querySelector('#welcome-enter')?.addEventListener('click', () => {
  // Anima la salida de la bienvenida y la quita para mostrar la página principal.
  const welcome = document.querySelector('#welcome-screen');
  welcome.classList.add('is-leaving');
  window.setTimeout(() => welcome.remove(), 560);
});

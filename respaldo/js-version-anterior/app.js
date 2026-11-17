const ADMIN_PASSWORD = 'CLAVE_DEMO_ANTERIOR_NO_USAR'; // Acceso de demostración: no es autenticación segura para producción.
const ORDERS_KEY = 'jossysBerryDemoOrders';
const CUSTOMERS_KEY = 'jossysBerryDemoCustomers';

const welcomeScreen = document.querySelector('#welcome-screen');
document.querySelector('#welcome-enter').addEventListener('click', () => {
  welcomeScreen.classList.add('is-leaving');
  window.setTimeout(() => welcomeScreen.remove(), 560);
});

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-nav');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  menuButton.setAttribute('aria-label', open ? 'Abrir menú' : 'Cerrar menú');
  navigation.classList.toggle('is-open', !open);
});
navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  navigation.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menú');
}));

document.querySelectorAll('[data-flavor]').forEach((link) => link.addEventListener('click', () => {
  document.querySelector('#flavor-choice').value = link.dataset.flavor;
}));

const locationButton = document.querySelector('#location-button');
const locationStatus = document.querySelector('#location-status');
const mapWrap = document.querySelector('#map-wrap');
locationButton.addEventListener('click', () => {
  if (!navigator.geolocation) {
    locationStatus.textContent = 'Este navegador no permite compartir la ubicación. Escribe tu dirección, por favor.';
    return;
  }
  locationStatus.textContent = 'Solicitando permiso de ubicación…';
  navigator.geolocation.getCurrentPosition((position) => {
    const { latitude, longitude } = position.coords;
    document.querySelector('#latitude').value = latitude.toFixed(6);
    document.querySelector('#longitude').value = longitude.toFixed(6);
    const delta = 0.006;
    const bbox = `${longitude - delta}%2C${latitude - delta}%2C${longitude + delta}%2C${latitude + delta}`;
    document.querySelector('#location-map').src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;
    mapWrap.hidden = false;
    locationStatus.textContent = 'Ubicación agregada. También puedes aclarar la dirección en el campo de texto.';
  }, () => {
    locationStatus.textContent = 'No pudimos obtener la ubicación. Puedes escribir la dirección manualmente.';
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
});

function readStored(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveStored(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

document.querySelector('#order-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const order = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: fields.get('name').trim(),
    phone: fields.get('phone').trim(),
    flavor: fields.get('flavor'),
    address: fields.get('address').trim(),
    latitude: fields.get('latitude'),
    longitude: fields.get('longitude'),
    createdAt: new Date().toLocaleString('es-PA')
  };
  const orders = readStored(ORDERS_KEY);
  orders.unshift(order);
  saveStored(ORDERS_KEY, orders);
  document.querySelector('#order-message').textContent = `¡Gracias, ${order.name}! Tu pedido quedó anotado en esta demostración.`;
  form.reset();
  mapWrap.hidden = true;
  document.querySelector('#location-map').removeAttribute('src');
  document.querySelector('#latitude').value = '';
  document.querySelector('#longitude').value = '';
  locationStatus.textContent = 'También puedes escribir la dirección.';
  if (!document.querySelector('#admin-dashboard').hidden) renderOrders();
});

document.querySelector('#loyalty-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const customer = { name: fields.get('name').trim(), phone: fields.get('phone').trim() };
  const customers = readStored(CUSTOMERS_KEY);
  customers.push(customer);
  saveStored(CUSTOMERS_KEY, customers);
  document.querySelector('#loyalty-message').textContent = `¡Bienvenido/a, ${customer.name}! Tu registro de muestra quedó guardado.`;
  event.currentTarget.reset();
});

const adminDashboard = document.querySelector('#admin-dashboard');
const ordersList = document.querySelector('#orders-list');
function renderOrders() {
  ordersList.replaceChildren();
  const orders = readStored(ORDERS_KEY);
  if (orders.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-orders';
    empty.textContent = 'Todavía no hay pedidos en este navegador.';
    ordersList.append(empty);
    return;
  }
  orders.forEach((order) => {
    const card = document.createElement('article');
    card.className = 'order-item';
    const details = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = `${order.flavor} — ${order.name}`;
    const phone = document.createElement('p');
    phone.textContent = `Teléfono: ${order.phone}`;
    const address = document.createElement('p');
    address.textContent = `Dirección: ${order.address}`;
    const mapLink = document.createElement('p');
    if (order.latitude && order.longitude) {
      const link = document.createElement('a');
      link.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(order.latitude)}&mlon=${encodeURIComponent(order.longitude)}#map=17/${encodeURIComponent(order.latitude)}/${encodeURIComponent(order.longitude)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `Ver ubicación (${order.latitude}, ${order.longitude}) ↗`;
      mapLink.append(link);
    } else {
      mapLink.textContent = 'Ubicación GPS: no compartida';
    }
    const time = document.createElement('p');
    time.className = 'order-meta';
    time.textContent = `Recibido: ${order.createdAt}`;
    details.append(title, phone, address, mapLink, time);
    const removeButton = document.createElement('button');
    removeButton.className = 'delete-order';
    removeButton.type = 'button';
    removeButton.textContent = 'Eliminar';
    removeButton.setAttribute('aria-label', `Eliminar pedido de ${order.name}`);
    removeButton.addEventListener('click', () => {
      saveStored(ORDERS_KEY, readStored(ORDERS_KEY).filter((item) => item.id !== order.id));
      renderOrders();
    });
    card.append(details, removeButton);
    ordersList.append(card);
  });
}

document.querySelector('#admin-login').addEventListener('submit', (event) => {
  event.preventDefault();
  const password = document.querySelector('#admin-password').value;
  const message = document.querySelector('#admin-message');
  if (password !== ADMIN_PASSWORD) {
    message.textContent = 'La clave no es correcta.';
    return;
  }
  message.textContent = 'Sesión de demostración iniciada.';
  event.currentTarget.hidden = true;
  adminDashboard.hidden = false;
  renderOrders();
});

document.querySelector('#admin-logout').addEventListener('click', () => {
  adminDashboard.hidden = true;
  document.querySelector('#admin-login').hidden = false;
  document.querySelector('#admin-login').reset();
  document.querySelector('#admin-message').textContent = 'Sesión cerrada.';
});

const assistantPanel = document.querySelector('#assistant-panel');
const assistantMessages = document.querySelector('#assistant-messages');
document.querySelector('#assistant-launcher').addEventListener('click', () => {
  assistantPanel.hidden = !assistantPanel.hidden;
  if (!assistantPanel.hidden) document.querySelector('#assistant-input').focus();
});
document.querySelector('#assistant-close').addEventListener('click', () => { assistantPanel.hidden = true; });

function addChatMessage(message, sender) {
  const bubble = document.createElement('p');
  bubble.className = sender === 'user' ? 'user-message' : 'bot-message';
  bubble.textContent = message;
  assistantMessages.append(bubble);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function assistantAnswer(question) {
  const text = question.toLowerCase();
  if (text.includes('menú') || text.includes('menu') || text.includes('sabor') || text.includes('producto')) return 'Tenemos La Clásica, La Crocantita y La Consentida. Puedes ver las descripciones y elegir en la sección Menú 🍓';
  if (text.includes('pedido') || text.includes('comprar') || text.includes('orden')) return '¡Con gusto! Ve a la sección “Haz tu pedido”, escoge el sabor y completa tus datos. Puedes escribir tu dirección o compartir la ubicación.';
  if (text.includes('whatsapp') || text.includes('teléfono') || text.includes('telefono') || text.includes('contacto')) return 'Puedes escribirnos por WhatsApp al 6434-7297 o al 6626-0366. Los accesos están al final de la página.';
  if (text.includes('precio') || text.includes('cuesta') || text.includes('costo')) return 'Los precios se confirman al coordinar el pedido. Escríbenos por WhatsApp y te ayudamos.';
  if (text.includes('hola') || text.includes('buenas')) return '¡Hola! 🍓 ¿Quieres ver el menú, hacer un pedido o encontrar nuestro WhatsApp?';
  return 'Puedo ayudarte con el menú, los pedidos, los precios o el contacto. ¿Qué te gustaría saber?';
}

function sendAssistantQuestion(question) {
  const trimmed = question.trim();
  if (!trimmed) return;
  addChatMessage(trimmed, 'user');
  window.setTimeout(() => addChatMessage(assistantAnswer(trimmed), 'bot'), 250);
}

document.querySelector('#assistant-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#assistant-input');
  sendAssistantQuestion(input.value);
  input.value = '';
});
document.querySelectorAll('[data-question]').forEach((button) => button.addEventListener('click', () => {
  const prompts = { menu: '¿Qué sabores tienen en el menú?', pedido: '¿Cómo puedo hacer un pedido?', contacto: '¿Cómo los contacto por WhatsApp?' };
  sendAssistantQuestion(prompts[button.dataset.question]);
}));

document.querySelector('#year').textContent = new Date().getFullYear();


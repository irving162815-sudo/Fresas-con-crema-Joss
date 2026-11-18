// Formularios públicos: envían los datos al servidor para guardarlos en MongoDB Atlas.
// Guarda en el navegador la llave aleatoria que identifica la conversación del chat.
const CHAT_ID_KEY = 'jossysBerryChatId';

// Envía JSON al servidor y enseña mensajes claros si la API responde con un error.
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'No se pudo conectar con el servidor.');
  return result;
}

// Muestra el resultado de un formulario debajo del botón de envío.
function showMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('is-error', isError);
}

// Guarda solo el nombre y correo en la pestaña para mostrar el saludo del encabezado.
function cacheCustomer(customer) {
  sessionStorage.setItem('jossysBerryCustomer', JSON.stringify(customer));
  window.dispatchEvent(new CustomEvent('jossys-data-changed'));
}

// Si el cliente llega desde el menú, deja seleccionado el sabor que escogió.
const productCode = new URLSearchParams(window.location.search).get('producto');
const productName = { clasica: 'La Clásica', crocantita: 'La Crocantita', consentida: 'La Consentida' }[productCode];
if (productName) {
  const productChoice = document.querySelector(`input[name="flavor"][value="${productName}"]`);
  if (productChoice) productChoice.checked = true;
}

// Explica los siguientes pasos según el método de pago elegido por el cliente.
document.querySelectorAll('input[name="paymentMethod"]').forEach((choice) => choice.addEventListener('change', () => {
  const help = document.querySelector('#payment-help');
  if (!help) return;
  const instructions = {
    Efectivo: 'Pagarás al recibir. El equipo confirmará el total y la entrega por WhatsApp.',
    Yappy: 'Cuando el equipo confirme el total, podrás enviar el pago por Yappy al 6434-7297.',
    'Tarjeta Visa': 'Registraremos tu preferencia y el equipo coordinará un pago seguro. Nunca escribas los datos de tu tarjeta aquí.'
  };
  help.textContent = instructions[choice.value] || 'El equipo confirmará el total antes de completar tu pedido.';
}));

// Enseña un total estimado; el servidor vuelve a calcularlo antes de guardarlo.
function updateOrderTotal() {
  const total = document.querySelector('#order-total');
  if (!total) return;
  const selectedProduct = document.querySelector('input[name="flavor"]:checked')?.value;
  const productPrices = { 'La Clásica': 2.99, 'La Crocantita': 3.99, 'La Consentida': 4.99 };
  if (!selectedProduct || !productPrices[selectedProduct]) {
    total.textContent = 'Elige un producto para ver el total.';
    return;
  }
  const toppingCount = document.querySelectorAll('input[name="toppings"]:checked').length;
  const orderTotal = Number((productPrices[selectedProduct] + toppingCount * 0.5).toFixed(2));
  total.textContent = `Total estimado: $${orderTotal.toFixed(2)} (${toppingCount} topping(s) × $0.50).`;
}
document.querySelectorAll('input[name="flavor"],input[name="toppings"]').forEach((choice) => choice.addEventListener('change', updateOrderTotal));
updateOrderTotal();

// Pide permiso GPS solo cuando la persona pulsa el botón para compartir su ubicación.
document.querySelector('#location-button')?.addEventListener('click', () => {
  const status = document.querySelector('#location-status');
  const address = document.querySelector('#delivery-address');
  if (!navigator.geolocation) {
    address.required = true;
    status.textContent = 'Este navegador no permite compartir ubicación. Escribe la dirección.';
    return;
  }
  status.textContent = 'Solicitando permiso de ubicación…';
  navigator.geolocation.getCurrentPosition((position) => {
    const { latitude, longitude } = position.coords;
    document.querySelector('#latitude').value = latitude.toFixed(6);
    document.querySelector('#longitude').value = longitude.toFixed(6);
    address.required = false;
    address.placeholder = 'Ubicación agregada. Puedes escribir una referencia opcional.';
    const delta = 0.006;
    const bounds = `${longitude - delta}%2C${latitude - delta}%2C${longitude + delta}%2C${latitude + delta}`;
    document.querySelector('#location-map').src = `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${latitude}%2C${longitude}`;
    document.querySelector('#map-wrap').hidden = false;
    status.textContent = 'Ubicación agregada. OpenStreetMap la usa para mostrar el mapa.';
  }, () => {
    address.required = true;
    status.textContent = 'No pudimos obtener la ubicación. Puedes escribir la dirección manualmente.';
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
});

// Envía los pedidos al servidor para que queden disponibles en la bandeja de Admin.
document.querySelector('#order-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const fields = Object.fromEntries(formData);
  fields.toppings = formData.getAll('toppings');
  const message = document.querySelector('#order-message');
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  try {
    const result = await apiRequest('/api/orders', { method: 'POST', body: JSON.stringify({
      ...fields, consent: fields.consent === 'on'
    }) });
    showMessage(message, result.message);
    form.reset();
    document.querySelector('#payment-help').textContent = 'Selecciona un método de pago. El equipo confirmará el total antes de completar tu pedido.';
    updateOrderTotal();
    document.querySelector('#delivery-address').required = true;
    document.querySelector('#delivery-address').placeholder = 'Calle, corregimiento y punto de referencia';
    document.querySelector('#map-wrap').hidden = true;
    document.querySelector('#location-map').removeAttribute('src');
    document.querySelector('#location-status').textContent = 'También puedes escribir tu dirección arriba.';
  } catch (error) { showMessage(message, error.message, true); }
  finally { submit.disabled = false; submit.removeAttribute('aria-busy'); }
});

// Registra la cuenta en Atlas; el servidor cifra la contraseña y abre la sesión segura.
document.querySelector('#register-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = Object.fromEntries(new FormData(form));
  const message = document.querySelector('#register-message');
  try {
    const result = await apiRequest('/api/customers/register', { method: 'POST', body: JSON.stringify({
      name: fields.name, email: fields.email, phone: fields.phone, password: fields.password,
      marketingConsent: fields.promotions === 'on', consent: fields.consent === 'on'
    }) });
    cacheCustomer(result.customer);
    showMessage(message, '¡Cuenta creada y guardada! Abriendo la página principal…');
    window.setTimeout(() => { window.location.href = 'index.html'; }, 500);
  } catch (error) { showMessage(message, error.message, true); }
});

// Inicia sesión comprobando el correo y la contraseña en el servidor, no en el navegador.
document.querySelector('#login-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  const message = document.querySelector('#login-message');
  try {
    const result = await apiRequest('/api/customers/login', { method: 'POST', body: JSON.stringify(fields) });
    cacheCustomer(result.customer);
    showMessage(message, `¡Hola, ${result.customer.name}! Iniciando sesión…`);
    window.setTimeout(() => { window.location.href = 'index.html'; }, 500);
  } catch (error) { showMessage(message, error.message, true); }
});

// Guarda reportes de fallas en Atlas para que el equipo pueda revisarlos en Admin.
document.querySelector('#report-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#report-message');
  try {
    const result = await apiRequest('/api/reports', {
      method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    showMessage(message, result.message);
    form.reset();
  } catch (error) { showMessage(message, error.message, true); }
});

// Muestra las promociones que el equipo publicó desde el panel privado.
async function loadPublicPromotions() {
  const list = document.querySelector('#public-promotions');
  if (!list) return;
  try {
    const { offers } = await apiRequest('/api/promotions');
    list.replaceChildren();
    if (!offers.length) {
      const empty = document.createElement('p');
      empty.className = 'promotion-empty';
      empty.textContent = 'Pronto compartiremos nuevas promociones. ¡Vuelve a visitarnos!';
      list.append(empty);
      return;
    }
    offers.forEach((offer) => {
      const card = document.createElement('article');
      card.className = 'promotion-card';
      if (offer.imageData) {
        const image = document.createElement('img');
        image.src = offer.imageData;
        image.alt = `Imagen de la promoción ${offer.title}`;
        image.loading = 'lazy';
        card.append(image);
      }
      const content = document.createElement('div');
      const title = document.createElement('h2');
      title.textContent = offer.title;
      const description = document.createElement('p');
      description.textContent = offer.description;
      content.append(title, description);
      card.append(content);
      list.append(card);
    });
  } catch {
    list.replaceChildren();
    const error = document.createElement('p');
    error.className = 'promotion-empty';
    error.textContent = 'No pudimos cargar las promociones. Intenta de nuevo más tarde.';
    list.append(error);
  }
}

loadPublicPromotions();

// Crea o recupera una llave aleatoria para que el chat sobreviva al cambio de página.
function getChatKey() {
  let key = localStorage.getItem(CHAT_ID_KEY);
  if (!key || !/^[a-f0-9-]{30,40}$/i.test(key)) {
    key = window.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = Math.random() * 16 | 0;
      return (char === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
    });
    localStorage.setItem(CHAT_ID_KEY, key);
  }
  return key;
}

// Actualiza la conversación y agrega los mensajes de forma segura como texto.
function renderChat(conversation) {
  const messages = document.querySelector('#assistant-messages');
  if (!messages || !conversation) return;
  messages.replaceChildren();
  const privacy = document.createElement('p');
  privacy.className = 'assistant-privacy';
  privacy.textContent = 'Chat con Google Gemini. Si falta un dato, tu consulta puede pasar al equipo.';
  messages.append(privacy);
  conversation.messages.forEach((message) => {
    const bubble = document.createElement('p');
    bubble.className = message.role === 'customer' ? 'user-message' : message.role === 'human' ? 'human-message' : 'bot-message';
    bubble.textContent = message.text;
    messages.append(bubble);
  });
  if (conversation.handoff) {
    const note = document.createElement('p');
    note.className = 'handoff-note';
    note.textContent = conversation.status === 'closed' ? 'Gracias por conversar con nuestro asesor. 🍓'
      : conversation.status === 'answered' ? 'Una persona del equipo respondió a tu pregunta.'
        : 'Tu pregunta está en la bandeja del equipo; aquí aparecerá su respuesta.';
    messages.append(note);
  }
  messages.scrollTop = messages.scrollHeight;
}

// Consulta el chat guardado; el sondeo permite recibir respuestas del equipo en vivo.
async function loadChat() {
  const key = getChatKey();
  const result = await apiRequest(`/api/chats/${encodeURIComponent(key)}`);
  renderChat(result.conversation);
}

// Envía la pregunta al servidor; este la guarda y consulta Gemini o deriva al equipo.
async function sendChatMessage(text) {
  const message = text.trim();
  if (!message) return;
  const input = document.querySelector('#assistant-input');
  if (input) input.disabled = true;
  try {
    const result = await apiRequest(`/api/chats/${encodeURIComponent(getChatKey())}/messages`, {
      method: 'POST', body: JSON.stringify({ message })
    });
    renderChat(result.conversation);
  } catch (error) {
    const messages = document.querySelector('#assistant-messages');
    if (messages) {
      const bubble = document.createElement('p');
      bubble.className = 'bot-message'; bubble.textContent = error.message; messages.append(bubble);
    }
  } finally {
    if (input) { input.disabled = false; input.focus(); }
  }
}

// Activa el chatbot persistente, las preguntas rápidas y el formulario de mensajes.
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.querySelector('#assistant-panel');
  const launcher = document.querySelector('#assistant-launcher');
  if (!panel || !launcher) return;
  const close = document.querySelector('#assistant-close');
  const input = document.querySelector('#assistant-input');
  let pollTimer;
  launcher.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      loadChat().catch(() => {});
      input.focus();
      pollTimer = window.setInterval(() => loadChat().catch(() => {}), 6000);
    } else window.clearInterval(pollTimer);
  });
  close?.addEventListener('click', () => { panel.hidden = true; window.clearInterval(pollTimer); });
  document.querySelector('#assistant-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value;
    input.value = '';
    sendChatMessage(text);
  });
  document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => sendChatMessage(button.dataset.prompt)));
});

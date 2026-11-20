// Formularios públicos: envían los datos al servidor para guardarlos en MongoDB Atlas.
// Guarda en el navegador la llave aleatoria que identifica la conversación del chat.
const CHAT_ID_KEY = 'jossysBerryChatId';
// El token privado permite seguir el pedido desde el mismo navegador sin pedir la cuenta.
const ORDER_TRACKS_KEY = 'jossysBerryTrackedOrders';
const ORDER_STEPS = [
  ['received', 'Recibido'], ['preparing', 'En proceso'],
  ['waiting_courier', 'Esperando el repartidor'], ['sent', 'Enviado']
];
// Lista segura de páginas a las que el chatbot puede dirigir a los visitantes.
const chatPageLinks = new Map([
  ['menu.html', 'Abrir el menú'], ['pedido.html', 'Ir a Pedidos'], ['promociones.html', 'Ver promociones'],
  ['redes.html', 'Ver contacto y redes'], ['sobre-nosotros.html', 'Conocer el emprendimiento'],
  ['registro.html', 'Crear cuenta de cliente fiel'], ['iniciar-sesion.html', 'Iniciar sesión'], ['reportar.html', 'Reportar una falla']
]);

// Preguntas de ejemplo: cada vez que se abre o responde el chat se muestran algunas al azar.
const suggestedQuestions = [
  '¿Qué sabores tienen?', '¿Cuánto cuesta La Clásica?', '¿Qué toppings puedo agregar?',
  '¿Cuánto cuesta cada topping?', '¿Cómo hago un pedido?', '¿Puedo pagar con Yappy?',
  '¿Cuál es el número de Yappy?', '¿Aceptan efectivo?', '¿Puedo pagar con Visa?',
  '¿Cómo comparto mi ubicación?', '¿Dónde escribo mi dirección?', '¿Cuáles son sus WhatsApp?',
  '¿Cuál es su Instagram?', '¿Dónde veo las promociones?', 'Quiero hablar con una persona',
  '¿Qué incluye La Crocantita?', '¿Cuánto cuesta La Consentida?', '¿Cómo personalizo mi pedido?',
  '¿Hacen entregas?', '¿Tienen opciones para alergias?', '¿A qué hora atienden?',
  '¿Qué días atienden?', '¿Quiénes son Jossy’s Berry?', '¿Las imágenes son ilustrativas?',
  '¿Cómo creo una cuenta?', '¿Cómo reporto un error?', '¿Puedo escoger mis toppings?',
  '¿Cuánto cuesta La Crocantita?', '¿Dónde puedo ver los productos?', '¿Me ayudan con mi pedido?',
  '¿Cuánto cuesta la entrega?', '¿Puedo pagar en efectivo?', '¿Cómo contacto al equipo?'
];

// Elige tres preguntas sin repetirlas y crea sus botones de forma segura.
function showRandomChatSuggestions() {
  const area = document.querySelector('#assistant-suggestions');
  if (!area) return;
  const pool = [...suggestedQuestions];
  for (let index = pool.length - 1; index > 0; index--) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapWith]] = [pool[swapWith], pool[index]];
  }
  area.replaceChildren();
  pool.slice(0, 3).forEach((prompt) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.prompt = prompt;
    button.textContent = prompt;
    button.addEventListener('click', () => sendChatMessage(prompt));
    area.append(button);
  });
}

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

// Recupera únicamente los identificadores y llaves privadas guardadas al hacer pedidos.
function readTrackedOrders() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_TRACKS_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => /^[a-f0-9]{24}$/i.test(item.id) && /^[a-f0-9]{64}$/i.test(item.token)).slice(0, 10) : [];
  } catch { return []; }
}

// Guarda la llave privada del pedido en el navegador para volver a consultar su progreso.
function rememberTrackedOrder(order) {
  const previous = readTrackedOrders().filter((item) => item.id !== order.id);
  try {
    localStorage.setItem(ORDER_TRACKS_KEY, JSON.stringify([{ id: order.id, token: order.trackingToken }, ...previous].slice(0, 10)));
    return true;
  } catch { return false; }
}

// Dibuja el avance y consulta solo estados públicos, sin exponer dirección o teléfono.
async function refreshOrderTracking() {
  const section = document.querySelector('#order-tracking');
  const area = document.querySelector('#tracked-orders');
  if (!section || !area) return;
  const orders = readTrackedOrders();
  section.hidden = orders.length === 0;
  area.replaceChildren();
  if (!orders.length) return;

  const cards = orders.map((item) => {
    const card = document.createElement('article');
    card.className = 'tracked-order-card';
    const title = document.createElement('h3');
    title.textContent = `Pedido #${item.id.slice(-6).toUpperCase()}`;
    const message = document.createElement('p');
    message.className = 'tracking-status-message';
    message.textContent = 'Consultando el estado…';
    card.append(title, message);
    area.append(card);
    return { item, card, title, message };
  });

  await Promise.all(cards.map(async ({ item, card, title, message }) => {
    try {
      const result = await apiRequest(`/api/orders/${encodeURIComponent(item.id)}/status`, {
        headers: { 'X-Order-Tracking-Token': item.token }
      });
      const orderSummary = result.offerType === 'two_for_one' ? ' · Promoción 2 x 1, 2 porciones' : result.quantity > 1 ? ` · ${result.quantity} porciones` : '';
      title.textContent = `Pedido #${item.id.slice(-6).toUpperCase()} · ${result.flavor}${orderSummary}`;
      message.textContent = `Estado actual: ${ORDER_STEPS.find(([value]) => value === result.status)?.[1] || 'Recibido'}`;
      const steps = document.createElement('ol');
      steps.className = 'order-progress';
      const activeIndex = Math.max(0, ORDER_STEPS.findIndex(([value]) => value === result.status));
      ORDER_STEPS.forEach(([value, label], index) => {
        const step = document.createElement('li');
        step.textContent = label;
        step.className = index < activeIndex ? 'is-complete' : index === activeIndex ? 'is-current' : '';
        if (index === activeIndex) step.setAttribute('aria-current', 'step');
        steps.append(step);
      });
      const updated = document.createElement('small');
      updated.textContent = `Última actualización: ${new Date(result.statusUpdatedAt).toLocaleString('es-PA')}`;
      card.append(steps, updated);
    } catch (error) {
      message.textContent = error.message || 'No pudimos consultar el estado. Intenta de nuevo más tarde.';
      if (error.message?.includes('No encontramos ese pedido')) {
        const active = readTrackedOrders().filter((entry) => entry.id !== item.id);
        localStorage.setItem(ORDER_TRACKS_KEY, JSON.stringify(active));
        card.remove();
        if (!active.length) section.hidden = true;
      }
    }
  }));
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
let selectedOffer = null;

// Aplica la oferta al producto y evita que se combine con un sabor distinto.
function setSelectedOffer(offer) {
  selectedOffer = offer;
  const offerId = document.querySelector('#order-offer-id');
  const panel = document.querySelector('#selected-offer');
  const note = document.querySelector('#selected-offer-message');
  const toppingNote = document.querySelector('.price-note');
  if (offerId) offerId.value = offer?.id || '';
  if (panel) panel.hidden = !offer;
  if (note && offer) {
    const regularPrices = { 'La Clásica': 2.99, 'La Crocantita': 3.99, 'La Consentida': 4.99 };
    note.textContent = offer.offerType === 'two_for_one'
      ? `${offer.title}: recibirás 2 porciones de ${offer.product} por $${Number(offer.price).toFixed(2)}. Los toppings se cobran por porción.`
      : `${offer.title}: ${offer.product} por $${Number(offer.price).toFixed(2)} (regular $${regularPrices[offer.product].toFixed(2)}). Los toppings se cobran aparte.`;
    if (offer.conditions) note.textContent += ` Condiciones: ${offer.conditions}`;
    if (offer.expiresAt) note.textContent += ` Válida hasta ${new Date(offer.expiresAt).toLocaleDateString('es-PA')}.`;
  }
  if (toppingNote) toppingNote.textContent = offer?.offerType === 'two_for_one'
    ? 'Oferta 2 x 1: los toppings seleccionados se cobran por porción, $0.50 cada uno.'
    : 'Precios en dólares (USD). Cada topping agrega $0.50 al total.';
  document.querySelectorAll('input[name="flavor"]').forEach((radio) => {
    radio.disabled = Boolean(offer && radio.value !== offer.product);
    if (offer && radio.value === offer.product) radio.checked = true;
  });
  updateOrderTotal();
}

// Quita la oferta y vuelve a habilitar los tres productos.
function clearSelectedOffer() {
  setSelectedOffer(null);
  const url = new URL(window.location.href);
  if (url.searchParams.has('oferta')) {
    url.searchParams.delete('oferta');
    window.history.replaceState({}, '', url);
  }
}

// Busca la oferta escogida en la página pública y la muestra antes de confirmar el pedido.
async function loadSelectedOffer() {
  const offerId = new URLSearchParams(window.location.search).get('oferta');
  if (!offerId) return;
  if (!/^[a-f0-9]{24}$/i.test(offerId)) throw new Error('El enlace de la oferta no es válido. Elige otra desde Promociones.');
  const { offer } = await apiRequest(`/api/promotions/${encodeURIComponent(offerId)}`);
  if (!offer || !['La Clásica', 'La Crocantita', 'La Consentida'].includes(offer.product) || !['discount', 'two_for_one'].includes(offer.offerType) || !Number.isFinite(offer.price))
    throw new Error('Esta oferta ya no está disponible. Revisa las promociones vigentes.');
  setSelectedOffer(offer);
  document.querySelector('#selected-offer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

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
  const regularPrice = productPrices[selectedProduct];
  const basePrice = selectedOffer?.product === selectedProduct ? Number(selectedOffer.price) : regularPrice;
  const quantity = selectedOffer?.product === selectedProduct && selectedOffer.offerType === 'two_for_one' ? 2 : 1;
  const orderTotal = Number((basePrice + toppingCount * 0.5 * quantity).toFixed(2));
  total.textContent = selectedOffer?.product === selectedProduct && selectedOffer.offerType === 'two_for_one'
    ? `Oferta 2 x 1: ${quantity} porciones por $${basePrice.toFixed(2)}. Total estimado: $${orderTotal.toFixed(2)}${toppingCount ? ` con toppings para ${quantity} porciones` : ''}.`
    : selectedOffer?.product === selectedProduct
      ? `Oferta aplicada: producto $${basePrice.toFixed(2)} (antes $${regularPrice.toFixed(2)}). Total estimado: $${orderTotal.toFixed(2)} con ${toppingCount} topping(s).`
    : `Total estimado: $${orderTotal.toFixed(2)} (${toppingCount} topping(s) × $0.50).`;
}
document.querySelectorAll('input[name="flavor"],input[name="toppings"]').forEach((choice) => choice.addEventListener('change', updateOrderTotal));
updateOrderTotal();
document.querySelector('#remove-selected-offer')?.addEventListener('click', clearSelectedOffer);
loadSelectedOffer().catch((error) => showMessage(document.querySelector('#order-message'), error.message, true));

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
    // Conserva el acceso privado y muestra inmediatamente el seguimiento al cliente.
    rememberTrackedOrder(result);
    await refreshOrderTracking();
    document.querySelector('#order-tracking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.reset();
    clearSelectedOffer();
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

// Actualiza los estados guardados mientras la página de pedidos permanece abierta.
document.addEventListener('DOMContentLoaded', () => {
  refreshOrderTracking();
  window.setInterval(() => {
    if (!document.hidden) refreshOrderTracking();
  }, 15000);
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
      if (offer.product && Number.isFinite(offer.price) && offer.id) {
        const regularPrices = { 'La Clásica': 2.99, 'La Crocantita': 3.99, 'La Consentida': 4.99 };
        const product = document.createElement('p');
        product.textContent = offer.offerType === 'two_for_one' ? `Promoción 2 x 1 · ${offer.product}` : `Incluye ${offer.product}`;
        const price = document.createElement('p');
        price.className = 'promotion-price';
        price.textContent = offer.offerType === 'two_for_one'
          ? `Lleva 2 por $${Number(offer.price).toFixed(2)} (precio regular de una porción)`
          : `Precio de oferta: $${Number(offer.price).toFixed(2)}${regularPrices[offer.product] ? ` · Regular $${regularPrices[offer.product].toFixed(2)}` : ''}`;
        content.append(product, price);
        if (offer.conditions) {
          const conditions = document.createElement('p');
          conditions.className = 'promotion-conditions';
          conditions.textContent = offer.conditions;
          content.append(conditions);
        }
        if (offer.expiresAt) {
          const expiry = document.createElement('p');
          expiry.className = 'promotion-expiry';
          expiry.textContent = `Válida hasta ${new Date(offer.expiresAt).toLocaleDateString('es-PA')}`;
          content.append(expiry);
        }
        const redeem = document.createElement('a');
        redeem.className = 'button button-dark promotion-redeem';
        redeem.href = `pedido.html?oferta=${encodeURIComponent(offer.id)}`;
        redeem.textContent = 'Canjear oferta';
        content.append(redeem);
      }
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
  if (!messages) return;
  messages.replaceChildren();
  if (!conversation) {
    const welcome = document.createElement('p');
    welcome.className = 'bot-message';
    welcome.textContent = '¡Hola! Puedo ayudarte con productos, pedidos o pasar tu consulta al equipo.';
    messages.append(welcome);
    return;
  }
  conversation.messages.forEach((message) => {
    const bubble = document.createElement('p');
    bubble.className = message.role === 'customer' ? 'user-message' : message.role === 'human' ? 'human-message' : 'bot-message';
    bubble.textContent = message.text;
    // Solo se crean enlaces a las páginas aprobadas de la lista interna.
    if (chatPageLinks.has(message.link)) {
      const pageLink = document.createElement('a');
      pageLink.className = 'chat-page-link';
      pageLink.href = message.link;
      pageLink.textContent = chatPageLinks.get(message.link);
      bubble.append(document.createElement('br'), pageLink);
    }
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
  // El botón elimina el registro de Atlas y la llave local del navegador.
  const eraseButton = document.createElement('button');
  eraseButton.type = 'button';
  eraseButton.className = 'button button-outline chat-delete-button';
  eraseButton.textContent = 'Finalizar y borrar chat';
  eraseButton.addEventListener('click', async () => {
    eraseButton.disabled = true;
    try {
      await apiRequest(`/api/chats/${encodeURIComponent(getChatKey())}`, { method: 'DELETE' });
      localStorage.removeItem(CHAT_ID_KEY);
      renderChat(null);
    } catch (error) {
      eraseButton.disabled = false;
      eraseButton.textContent = error.message || 'No se pudo borrar. Intenta de nuevo.';
    }
  });
  messages.append(eraseButton);
  messages.scrollTop = messages.scrollHeight;
}

// Consulta el chat guardado; el sondeo permite recibir respuestas del equipo en vivo.
async function loadChat() {
  const key = getChatKey();
  const result = await apiRequest(`/api/chats/${encodeURIComponent(key)}`);
  renderChat(result.conversation);
}

// Envía la pregunta al servidor; allí se contesta con reglas locales o se deriva al equipo.
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
    showRandomChatSuggestions();
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
      showRandomChatSuggestions();
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
  showRandomChatSuggestions();
});

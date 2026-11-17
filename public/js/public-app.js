// Chatbot de reglas: usa datos confirmados de la marca y no llama a una IA.
const STORAGE_KEY = 'jossysBerryDemoData';
const CHAT_ID_KEY = 'jossysBerryChatId';

function readData() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      orders: Array.isArray(value.orders) ? value.orders : [],
      customers: Array.isArray(value.customers) ? value.customers : [],
      conversations: Array.isArray(value.conversations) ? value.conversations : [],
      reports: Array.isArray(value.reports) ? value.reports : [],
      promotions: Array.isArray(value.promotions) ? value.promotions : []
    };
  } catch {
    return { orders: [], customers: [], conversations: [], reports: [], promotions: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('jossys-data-changed'));
}

function showMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('is-error', isError);
}

// Resume una contraseña para el prototipo; esto no convierte la cuenta estática en seguridad real.
function createPasswordSalt() {
  if (!window.crypto?.getRandomValues) throw new Error('Abre el sitio desde Go Live en Visual Studio Code para crear tu cuenta.');
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  if (!window.crypto?.subtle) throw new Error('Abre el sitio desde Go Live en Visual Studio Code para iniciar sesión.');
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Deja marcado el producto escogido desde la página del menú.
const productCode = new URLSearchParams(window.location.search).get('producto');
const productName = { clasica: 'La Clásica', crocantita: 'La Crocantita', consentida: 'La Consentida' }[productCode];
if (productName && document.querySelector('#flavor-choice')) document.querySelector('#flavor-choice').value = productName;

// El permiso GPS solo se pide cuando el visitante lo solicita.
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

document.querySelector('#order-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = Object.fromEntries(new FormData(form));
  const data = readData();
  data.orders.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: fields.name.trim(), phone: fields.phone.trim(), flavor: fields.flavor,
    address: fields.address.trim() || 'Ubicación GPS compartida', latitude: fields.latitude,
    longitude: fields.longitude, createdAt: new Date().toLocaleString('es-PA')
  });
  saveData(data);
  showMessage(document.querySelector('#order-message'), '¡Gracias! Tu pedido quedó guardado en este navegador para la demostración.');
  form.reset();
  document.querySelector('#delivery-address').required = true;
  document.querySelector('#delivery-address').placeholder = 'Calle, corregimiento y punto de referencia';
  document.querySelector('#map-wrap').hidden = true;
  document.querySelector('#location-map').removeAttribute('src');
  document.querySelector('#location-status').textContent = 'También puedes escribir tu dirección arriba.';
});

document.querySelector('#loyalty-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  const data = readData();
  data.customers.unshift({ name: fields.name.trim(), phone: fields.phone.trim(), createdAt: new Date().toLocaleString('es-PA') });
  saveData(data);
  showMessage(document.querySelector('#loyalty-message'), `¡Bienvenido/a, ${fields.name}! Tu registro quedó guardado en este navegador.`);
  event.currentTarget.reset();
});

// Crea la cuenta local y guarda por separado el permiso opcional para promociones.
document.querySelector('#register-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = Object.fromEntries(new FormData(form));
  const email = fields.email.trim().toLowerCase();
  const data = readData();
  const message = document.querySelector('#register-message');
  if (data.customers.some((customer) => customer.email === email)) {
    showMessage(message, 'Ya existe una cuenta con ese correo. Inicia sesión.', true);
    return;
  }
  try {
    const passwordSalt = createPasswordSalt();
    const passwordHash = await hashPassword(fields.password, passwordSalt);
    data.customers.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: fields.name.trim(), email, phone: fields.phone.trim(), passwordSalt, passwordHash,
      marketingConsent: fields.promotions === 'on', createdAt: new Date().toLocaleString('es-PA')
    });
    saveData(data);
    localStorage.setItem('jossysBerrySignedIn', email);
    window.dispatchEvent(new CustomEvent('jossys-data-changed'));
    showMessage(message, '¡Cuenta creada! Abriendo la página principal…');
    window.setTimeout(() => { window.location.href = 'index.html'; }, 500);
  } catch (error) { showMessage(message, error.message, true); }
});

// Comprueba el correo y la contraseña contra las cuentas locales de esta demostración.
document.querySelector('#login-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  const email = fields.email.trim().toLowerCase();
  const message = document.querySelector('#login-message');
  try {
    const customer = readData().customers.find((item) => item.email === email);
    const passwordHash = customer ? await hashPassword(fields.password, customer.passwordSalt) : '';
    const isCorrectPassword = customer && passwordHash === customer.passwordHash;
    if (!isCorrectPassword) { showMessage(message, 'El correo o la contraseña no coinciden.', true); return; }
    localStorage.setItem('jossysBerrySignedIn', email);
    window.dispatchEvent(new CustomEvent('jossys-data-changed'));
    showMessage(message, `¡Hola, ${customer.name}! Iniciando sesión…`);
    window.setTimeout(() => { window.location.href = 'index.html'; }, 500);
  } catch (error) { showMessage(message, error.message, true); }
});

// Guarda los avisos de fallas en el mismo espacio local que consulta la página Admin.
document.querySelector('#report-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = Object.fromEntries(new FormData(form));
  const data = readData();
  const reportId = `F-${Date.now().toString(36).toUpperCase()}`;
  data.reports.unshift({
    id: reportId, category: fields.category, page: fields.page,
    description: fields.description.trim(), steps: fields.steps.trim(),
    contact: fields.contact.trim(), createdAt: new Date().toLocaleString('es-PA'), resolved: false
  });
  saveData(data);
  showMessage(document.querySelector('#report-message'), `Gracias por avisarnos. El reporte ${reportId} quedó guardado en este navegador.`);
  form.reset();
});

function chooseConversation(data) {
  let id = localStorage.getItem(CHAT_ID_KEY);
  let conversation = data.conversations.find((item) => item.id === id);
  if (!conversation || conversation.status === 'closed') {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    conversation = { id, status: 'open', handoff: false, messages: [], updatedAt: new Date().toISOString() };
    data.conversations.unshift(conversation);
    localStorage.setItem(CHAT_ID_KEY, id);
  }
  return conversation;
}

// Respuestas claras y amables basadas únicamente en lo que la marca ya confirmó.
function getBrandReply(question) {
  const text = question.toLowerCase();
  if (/\b(persona|asesor|humano|alguien real|representante|encargad[oa])\b/.test(text)) {
    return { reply: 'Claro, voy a dejar tu pregunta en la bandeja del equipo para que una persona te responda por este chat. 🍓', handoff: true };
  }
  if (/men[uú]|sabor|producto|cl[aá]sica|crocantita|consentida/.test(text)) {
    return { reply: 'Nuestro menú tiene La Clásica (fresas frescas con crema dulce y suave), La Crocantita (con un toque crujiente) y La Consentida (nuestra combinación especial). Puedes ver los detalles en la página Menú 🍓', handoff: false };
  }
  if (/pedido|comprar|orden|entrega|direcci[oó]n|ubicaci[oó]n|gps/.test(text)) {
    return { reply: 'Para pedir, abre la página “Pedidos”, elige tu sabor y escribe la dirección. Si quieres, puedes compartir tu ubicación GPS. El equipo te contactará para coordinar la entrega.', handoff: false };
  }
  if (/whats ?app|tel[eé]fono|contacto|n[uú]mero/.test(text)) {
    return { reply: 'Puedes escribirnos por WhatsApp al 6434-7297 o al 6626-0366. ¡Con gusto te atendemos! ♡', handoff: false };
  }
  if (/precio|precios|cu[aá]nto cuesta|cu[aá]nto vale|costo|pago/.test(text)) {
    return { reply: 'No tengo los precios ni métodos de pago confirmados. Te conectaré con una persona del equipo para darte la información correcta.', handoff: true };
  }
  if (/horario|abren|cierran|disponib|zona|repart|ingrediente|alerg|sin lactosa/.test(text)) {
    return { reply: 'No tengo ese detalle confirmado todavía. Voy a dejar tu consulta en la bandeja para que una persona del equipo te responda.', handoff: true };
  }
  if (/qui[eé]nes son|sobre ustedes|historia|emprendimiento|qu[eé] hacen/.test(text)) {
    return { reply: 'Somos Jossy’s Berry PTY. Preparamos y vendemos fresas con crema con frutas frescas y de alta calidad. Nos importa ofrecer un postre delicioso, accesible y una experiencia con higiene y buen servicio.', handoff: false };
  }
  if (/hola|buenas|saludos/.test(text)) {
    return { reply: '¡Hola! Qué gusto tenerte en Jossy’s Berry PTY 🍓 ¿Quieres conocer el menú o hacer un pedido?', handoff: false };
  }
  return { reply: 'No tengo esa respuesta confirmada. Dejaré tu pregunta en la bandeja para que una persona del equipo pueda ayudarte por este chat.', handoff: true };
}

document.addEventListener('DOMContentLoaded', () => {
  const panel = document.querySelector('#assistant-panel');
  const launcher = document.querySelector('#assistant-launcher');
  if (!panel || !launcher) return;
  const messages = document.querySelector('#assistant-messages');
  let renderedMessages = 0;
  let renderedConversationId = null;
  let pollTimer;

  function renderConversation() {
    const data = readData();
    const conversation = data.conversations.find((item) => item.id === localStorage.getItem(CHAT_ID_KEY));
    if (!conversation) return;
    if (conversation.id !== renderedConversationId) {
      messages.replaceChildren();
      renderedMessages = 0;
      renderedConversationId = conversation.id;
    }
    conversation.messages.slice(renderedMessages).forEach((message) => {
      const bubble = document.createElement('p');
      bubble.className = message.role === 'customer' ? 'user-message' : message.role === 'human' ? 'human-message' : 'bot-message';
      bubble.textContent = message.text;
      messages.append(bubble);
    });
    renderedMessages = conversation.messages.length;
    if (conversation.handoff) {
      let note = messages.querySelector('.handoff-note');
      if (!note) { note = document.createElement('p'); note.className = 'handoff-note'; messages.append(note); }
      const hasHumanReply = conversation.messages.some((message) => message.role === 'human');
      note.textContent = conversation.status === 'closed' ? 'Gracias por conversar con nuestro asesor. 🍓' : hasHumanReply ? 'Una persona del equipo respondió a tu pregunta. ¿Te ayudamos con algo más?' : 'Tu pregunta está en la bandeja local del equipo. Aquí aparecerá su respuesta.';
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function saveChatMessage(text) {
    const data = readData();
    const conversation = chooseConversation(data);
    conversation.messages.push({ role: 'customer', text, createdAt: new Date().toISOString() });
    let answer;
    if (conversation.handoff) {
      answer = { reply: 'Tu mensaje ya está en la bandeja del equipo. Una persona te responderá por aquí en cuanto pueda.', handoff: true };
    } else answer = getBrandReply(text);
    conversation.messages.push({ role: 'assistant', text: answer.reply, createdAt: new Date().toISOString() });
    conversation.handoff = conversation.handoff || answer.handoff;
    if (conversation.handoff) conversation.status = 'waiting';
    conversation.updatedAt = new Date().toISOString();
    saveData(data);
    renderConversation();
  }

  launcher.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      renderConversation();
      document.querySelector('#assistant-input').focus();
      pollTimer = window.setInterval(renderConversation, 1500);
    } else window.clearInterval(pollTimer);
  });
  document.querySelector('#assistant-close').addEventListener('click', () => {
    panel.hidden = true;
    window.clearInterval(pollTimer);
  });
  document.querySelector('#assistant-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.querySelector('#assistant-input');
    if (input.value.trim()) saveChatMessage(input.value.trim());
    input.value = '';
  });
  document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => saveChatMessage(button.dataset.prompt)));
  window.addEventListener('storage', renderConversation);
  renderConversation();
});

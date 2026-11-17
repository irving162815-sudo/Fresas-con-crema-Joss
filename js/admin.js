// Panel local de demostración: los datos proceden del almacenamiento de este navegador.
const ADMIN_PASSWORD = 'ADMINPTY507'; // Clave visible solo para la presentación escolar.
const STORAGE_KEY = 'jossysBerryDemoData';
const loginForm = document.querySelector('#admin-login');
const dashboard = document.querySelector('#admin-dashboard');
const adminMessage = document.querySelector('#admin-message');

function readData() {
  // Recupera los registros del navegador y usa listas vacías si aún no hay datos.
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      orders: value.orders || [], customers: value.customers || [],
      conversations: value.conversations || [], reports: value.reports || [],
      promotions: value.promotions || []
    };
  } catch { return { orders: [], customers: [], conversations: [], reports: [], promotions: [] }; }
}

function saveData(data) {
  // Persiste cambios del panel y actualiza cualquier pantalla que esté abierta.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('jossys-data-changed'));
}

function makeElement(tag, className, text) {
  // Crea elementos con texto seguro para mostrar datos escritos por los clientes.
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderOrders(data) {
  // Dibuja los pedidos y permite eliminar uno o abrir su ubicación en el mapa.
  const list = document.querySelector('#orders-list');
  list.replaceChildren();
  if (!data.orders.length) { list.append(makeElement('p', 'empty-orders', 'Aún no hay pedidos en este navegador.')); return; }
  data.orders.forEach((order) => {
    const card = makeElement('article', 'order-item');
    const details = makeElement('div');
    details.append(makeElement('h3', '', `${order.flavor} — ${order.name}`));
    details.append(makeElement('p', '', `Teléfono: ${order.phone}`));
    details.append(makeElement('p', '', `Dirección: ${order.address}`));
    details.append(makeElement('p', 'order-meta', `Recibido: ${order.createdAt}`));
    if (order.latitude && order.longitude) {
      const map = makeElement('a', '', 'Ver ubicación en el mapa ↗');
      map.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(order.latitude)}&mlon=${encodeURIComponent(order.longitude)}#map=17/${encodeURIComponent(order.latitude)}/${encodeURIComponent(order.longitude)}`;
      map.target = '_blank'; map.rel = 'noopener noreferrer'; details.append(map);
    }
    const remove = makeElement('button', 'delete-order', 'Eliminar pedido');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      const latest = readData();
      latest.orders = latest.orders.filter((item) => item.id !== order.id);
      saveData(latest); refreshDashboard(true);
    });
    card.append(details, remove); list.append(card);
  });
}

function renderConversations(data) {
  // Muestra los mensajes del chatbot y permite que Admin responda o cierre chats.
  const list = document.querySelector('#conversations-list');
  list.replaceChildren();
  if (!data.conversations.length) { list.append(makeElement('p', 'empty-orders', 'Todavía no hay preguntas en la bandeja.')); return; }
  data.conversations.forEach((conversation) => {
    const card = makeElement('article', 'conversation-card');
    const heading = makeElement('div', 'conversation-title');
    heading.append(makeElement('h3', '', `Chat ${conversation.id.slice(-8)}`));
    const status = conversation.status === 'closed' ? 'Cerrada' : conversation.handoff ? (conversation.status === 'answered' ? 'Respondida' : 'Necesita asesor') : 'Chatbot';
    heading.append(makeElement('span', 'status-pill', status));
    const log = makeElement('div', 'chat-log');
    conversation.messages.forEach((message) => {
      const who = message.role === 'customer' ? 'Cliente' : message.role === 'human' ? 'Asesor' : 'Berry';
      const kind = message.role === 'customer' ? 'chat-customer' : message.role === 'human' ? 'chat-human' : 'chat-assistant';
      log.append(makeElement('p', kind, `${who}: ${message.text}`));
    });
    card.append(heading, log);
    if (conversation.status !== 'closed') {
      const replyForm = makeElement('form', 'conversation-reply');
      const input = makeElement('input');
      input.name = 'reply'; input.placeholder = 'Escribe una respuesta para el cliente…'; input.maxLength = 1200; input.required = true;
      const send = makeElement('button', '', 'Responder'); send.type = 'submit';
      replyForm.append(input, send);
      replyForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const replyText = input.value.trim();
        if (!replyText) { input.focus(); return; }
        const latest = readData();
        const item = latest.conversations.find((entry) => entry.id === conversation.id);
        if (!item) return;
        item.messages.push({ role: 'human', text: replyText, createdAt: new Date().toISOString() });
        item.handoff = true; item.status = 'answered'; item.updatedAt = new Date().toISOString();
        saveData(latest);
        refreshDashboard(true);
      });
      const close = makeElement('button', 'button button-outline', 'Cerrar conversación'); close.type = 'button';
      close.addEventListener('click', () => {
        const latest = readData();
        const item = latest.conversations.find((entry) => entry.id === conversation.id);
        if (item) { item.status = 'closed'; saveData(latest); refreshDashboard(true); }
      });
      card.append(replyForm, close);
    }
    list.append(card);
  });
}

function renderCustomers(data) {
  // Presenta los clientes registrados y deja retirar su permiso promocional.
  const list = document.querySelector('#customers-list');
  list.replaceChildren();
  if (!data.customers.length) { list.append(makeElement('p', 'empty-orders', 'Aún no hay registros de clientes en este navegador.')); return; }
  data.customers.forEach((customer) => {
    const item = makeElement('article', 'customer-item');
    const info = makeElement('div');
    info.append(makeElement('b', '', customer.name));
    info.append(makeElement('p', '', `Correo: ${customer.email || 'No registrado'}`));
    info.append(makeElement('p', '', `WhatsApp: ${customer.phone || 'No registrado'} · ${customer.createdAt || ''}`));
    const status = makeElement('span', 'status-pill', customer.marketingConsent ? 'Acepta promociones' : 'Sin permiso de promociones');
    item.append(info, status);
    if (customer.marketingConsent) {
      const unsubscribe = makeElement('button', 'delete-order', 'Retirar permiso');
      unsubscribe.type = 'button';
      unsubscribe.addEventListener('click', () => {
        const latest = readData();
        const entry = latest.customers.find((record) => record.email === customer.email);
        if (entry) { entry.marketingConsent = false; saveData(latest); refreshDashboard(true); }
      });
      item.append(unsubscribe);
    }
    list.append(item);
  });
}

// La bandeja de fallas guarda la descripción y el estado de atención de cada reporte.
function renderReports(data) {
  // Muestra los reportes de fallas y permite marcarlos atendidos o eliminarlos.
  const list = document.querySelector('#reports-list');
  list.replaceChildren();
  if (!data.reports.length) { list.append(makeElement('p', 'empty-orders', 'Todavía no hay reportes de fallas.')); return; }
  data.reports.forEach((report) => {
    const card = makeElement('article', `report-item${report.resolved ? ' is-resolved' : ''}`);
    const heading = makeElement('div', 'report-heading');
    heading.append(makeElement('h3', '', report.category || 'Reporte de problema'));
    heading.append(makeElement('span', 'status-pill', report.resolved ? 'Atendido' : 'Pendiente'));
    card.append(heading);
    card.append(makeElement('p', '', `Página: ${report.page || 'No indicada'}`));
    card.append(makeElement('p', 'report-description', report.description));
    if (report.steps) card.append(makeElement('p', '', `Pasos para reproducirlo: ${report.steps}`));
    if (report.contact) card.append(makeElement('p', '', `Contacto: ${report.contact}`));
    card.append(makeElement('p', 'order-meta', `Enviado: ${report.createdAt}`));
    const actions = makeElement('div', 'report-actions');
    if (!report.resolved) {
      const resolve = makeElement('button', 'button button-outline', 'Marcar atendido'); resolve.type = 'button';
      resolve.addEventListener('click', () => {
        const latest = readData();
        const item = latest.reports.find((entry) => entry.id === report.id);
        if (item) { item.resolved = true; saveData(latest); refreshDashboard(true); }
      });
      actions.append(resolve);
    }
    const remove = makeElement('button', 'delete-order', 'Eliminar reporte'); remove.type = 'button';
    remove.addEventListener('click', () => {
      const latest = readData();
      latest.reports = latest.reports.filter((entry) => entry.id !== report.id);
      saveData(latest); refreshDashboard(true);
    });
    actions.append(remove); card.append(actions); list.append(card);
  });
}

function renderPromotions(data) {
  // Lista las campañas que el administrador preparó anteriormente.
  const list = document.querySelector('#promotions-list');
  list.replaceChildren();
  if (!data.promotions.length) { list.append(makeElement('p', 'empty-orders', 'Aún no has preparado una promoción.')); return; }
  data.promotions.forEach((promotion) => {
    const item = makeElement('article', 'report-item');
    item.append(makeElement('h3', '', promotion.title));
    item.append(makeElement('p', '', `Asunto: ${promotion.subject}`));
    item.append(makeElement('p', '', `Personas suscritas incluidas: ${promotion.recipientCount}`));
    item.append(makeElement('p', 'order-meta', `Preparada: ${promotion.createdAt}`));
    list.append(item);
  });
}

function refreshDashboard(force = false) {
  // Pausa el refresco automático mientras hay texto activo en la respuesta del chat.
  if (!force && document.activeElement?.closest('.conversation-reply')) return;
  const data = readData();
  renderOrders(data); renderConversations(data); renderCustomers(data); renderReports(data); renderPromotions(data);
}

loginForm.addEventListener('submit', (event) => {
  // Abre el panel de demostración si se escribe la clave configurada en el código.
  event.preventDefault();
  const password = document.querySelector('#admin-password').value;
  if (password !== ADMIN_PASSWORD) { adminMessage.textContent = 'La contraseña no coincide.'; return; }
  adminMessage.textContent = '';
  loginForm.hidden = true; dashboard.hidden = false; refreshDashboard(true);
});

document.querySelector('#admin-logout').addEventListener('click', () => {
  // Oculta el panel y vuelve al formulario de acceso de demostración.
  dashboard.hidden = true; loginForm.hidden = false; loginForm.reset();
});
document.querySelectorAll('[data-refresh]').forEach((button) => button.addEventListener('click', () => refreshDashboard(true)));

// Prepara el texto de una campaña y cuenta solo a clientes que aceptaron recibir promociones.
document.querySelector('#promotion-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  const data = readData();
  const recipientCount = data.customers.filter((customer) => customer.marketingConsent === true && customer.email).length;
  data.promotions.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: fields.title.trim(), subject: fields.subject.trim(), message: fields.message.trim(),
    recipientCount, createdAt: new Date().toLocaleString('es-PA')
  });
  saveData(data);
  document.querySelector('#promotion-message').textContent = `Campaña preparada para ${recipientCount} persona(s) que aceptaron promociones. Esta versión no envía correos.`;
  event.currentTarget.reset();
  refreshDashboard(true);
});

// Descarga únicamente los correos de clientes que marcaron la casilla de promociones.
document.querySelector('#export-subscribers')?.addEventListener('click', () => {
  const subscribers = readData().customers.filter((customer) => customer.marketingConsent === true && customer.email);
  if (!subscribers.length) {
    document.querySelector('#promotion-message').textContent = 'Todavía no hay clientes que hayan aceptado recibir promociones.';
    return;
  }
  const escapeCsv = (value) => `"${String(value || '').replaceAll('"', '""')}"`;
  const rows = [['Nombre', 'Correo'], ...subscribers.map((customer) => [customer.name, customer.email])];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
  const file = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const download = document.createElement('a');
  download.href = file; download.download = 'clientes-que-aceptan-promociones.csv'; download.click();
  URL.revokeObjectURL(file);
  document.querySelector('#promotion-message').textContent = `Se descargó la lista de ${subscribers.length} contacto(s) con permiso.`;
});

// Abre un borrador en el programa de correo; la persona administradora revisa y envía.
document.querySelector('#open-campaign-email')?.addEventListener('click', () => {
  const form = document.querySelector('#promotion-form');
  if (!form.reportValidity()) return;
  const fields = Object.fromEntries(new FormData(form));
  const subscribers = readData().customers.filter((customer) => customer.marketingConsent === true && customer.email);
  const message = document.querySelector('#promotion-message');
  if (!subscribers.length) {
    message.textContent = 'Todavía no hay clientes que hayan aceptado recibir promociones.';
    return;
  }
  const bcc = subscribers.map((customer) => customer.email).join(',');
  const body = `${fields.message.trim()}\n\nJossy’s Berry PTY · Frescura y dulzura`;
  const mailto = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(fields.subject.trim())}&body=${encodeURIComponent(body)}`;
  if (mailto.length > 1800) {
    message.textContent = 'Hay muchos destinatarios para abrirlos juntos. Exporta la lista autorizada y úsala en tu servicio de correo.';
    return;
  }
  const link = document.createElement('a');
  link.href = mailto;
  link.click();
  message.textContent = `Se preparó un borrador con ${subscribers.length} destinatario(s) ocultos. Revísalo y pulsa Enviar en tu programa de correo.`;
});

window.addEventListener('storage', () => refreshDashboard());
window.addEventListener('jossys-data-changed', () => refreshDashboard());
// Actualiza los datos visibles mientras el panel está abierto, para la demo local.
window.setInterval(() => { if (!dashboard.hidden) refreshDashboard(); }, 1500);

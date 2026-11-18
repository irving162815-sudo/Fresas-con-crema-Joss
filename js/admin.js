// Panel de administración: consulta MongoDB y protege las herramientas con sesión privada.
const loginForm = document.querySelector('#admin-login');
const dashboard = document.querySelector('#admin-dashboard');
const adminMessage = document.querySelector('#admin-message');
let dashboardData = { orders: [], conversations: [], customers: [], reports: [], promotions: [] };
let loggedIn = false;

// Llama a la API protegida y convierte errores del servidor en mensajes legibles.
async function adminApi(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin', ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'No se pudo completar la acción.');
  return result;
}

// Crea tarjetas usando texto simple, para que los datos guardados no se interpreten como HTML.
function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Dibuja los pedidos y permite abrir la dirección GPS o borrar un registro.
function renderOrders(orders) {
  const list = document.querySelector('#orders-list');
  list.replaceChildren();
  if (!orders.length) { list.append(makeElement('p', 'empty-orders', 'Todavía no hay pedidos.')); return; }
  orders.forEach((order) => {
    const card = makeElement('article', 'order-item');
    const details = makeElement('div');
    details.append(makeElement('h3', '', `${order.flavor} — ${order.name}`));
    details.append(makeElement('p', '', `Teléfono: ${order.phone}`));
    details.append(makeElement('p', '', `Dirección: ${order.address}`));
    details.append(makeElement('p', '', `Método de pago elegido: ${order.paymentMethod || 'No especificado'}`));
    details.append(makeElement('p', 'order-meta', `Recibido: ${new Date(order.createdAt).toLocaleString('es-PA')}`));
    if (Number.isFinite(order.latitude) && Number.isFinite(order.longitude)) {
      const map = makeElement('a', '', 'Ver ubicación en el mapa ↗');
      map.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(order.latitude)}&mlon=${encodeURIComponent(order.longitude)}#map=17/${encodeURIComponent(order.latitude)}/${encodeURIComponent(order.longitude)}`;
      map.target = '_blank'; map.rel = 'noopener noreferrer'; details.append(map);
    }
    const remove = makeElement('button', 'delete-order', 'Eliminar pedido');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      try { await adminApi(`/api/admin/orders/${order._id}`, { method: 'DELETE' }); await refreshDashboard(true); }
      catch (error) { setStatus(error.message, true); }
    });
    card.append(details, remove); list.append(card);
  });
}

// Muestra chats y deja que la persona administradora responda o cierre una conversación.
function renderConversations(conversations) {
  const list = document.querySelector('#conversations-list');
  list.replaceChildren();
  if (!conversations.length) { list.append(makeElement('p', 'empty-orders', 'Todavía no hay preguntas en la bandeja.')); return; }
  conversations.forEach((conversation) => {
    const card = makeElement('article', 'conversation-card');
    const heading = makeElement('div', 'conversation-title');
    heading.append(makeElement('h3', '', `Chat ${conversation.key.slice(-8)}`));
    const status = conversation.status === 'closed' ? 'Cerrada' : conversation.handoff
      ? (conversation.status === 'answered' ? 'Respondida' : 'Necesita asesor') : 'Chatbot';
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
      replyForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = input.value.trim();
        if (!message) return;
        send.disabled = true;
        try {
          await adminApi(`/api/admin/chats/${conversation._id}/reply`, { method: 'POST', body: JSON.stringify({ message }) });
          await refreshDashboard(true);
        } catch (error) { setStatus(error.message, true); send.disabled = false; }
      });
      const close = makeElement('button', 'button button-outline', 'Cerrar conversación'); close.type = 'button';
      close.addEventListener('click', async () => {
        try { await adminApi(`/api/admin/chats/${conversation._id}/close`, { method: 'POST' }); await refreshDashboard(true); }
        catch (error) { setStatus(error.message, true); }
      });
      card.append(replyForm, close);
    }
    list.append(card);
  });
}

// Presenta clientes sin exponer contraseñas y permite retirar el permiso promocional.
function renderCustomers(customers) {
  const list = document.querySelector('#customers-list');
  list.replaceChildren();
  if (!customers.length) { list.append(makeElement('p', 'empty-orders', 'Aún no hay clientes registrados.')); return; }
  customers.forEach((customer) => {
    const item = makeElement('article', 'customer-item');
    const info = makeElement('div');
    info.append(makeElement('b', '', customer.name));
    info.append(makeElement('p', '', `Correo: ${customer.email}`));
    info.append(makeElement('p', '', `WhatsApp: ${customer.phone} · ${new Date(customer.createdAt).toLocaleString('es-PA')}`));
    item.append(info, makeElement('span', 'status-pill', customer.marketingConsent ? 'Acepta promociones' : 'Sin permiso de promociones'));
    if (customer.marketingConsent) {
      const unsubscribe = makeElement('button', 'delete-order', 'Retirar permiso');
      unsubscribe.type = 'button';
      unsubscribe.addEventListener('click', async () => {
        try { await adminApi(`/api/admin/customers/${customer._id}/unsubscribe`, { method: 'PATCH' }); await refreshDashboard(true); }
        catch (error) { setStatus(error.message, true); }
      });
      item.append(unsubscribe);
    }
    list.append(item);
  });
}

// Dibuja reportes y deja marcarlos como atendidos o eliminarlos de Atlas.
function renderReports(reports) {
  const list = document.querySelector('#reports-list');
  list.replaceChildren();
  if (!reports.length) { list.append(makeElement('p', 'empty-orders', 'Todavía no hay reportes de fallas.')); return; }
  reports.forEach((report) => {
    const card = makeElement('article', `report-item${report.resolved ? ' is-resolved' : ''}`);
    const heading = makeElement('div', 'report-heading');
    heading.append(makeElement('h3', '', report.category));
    heading.append(makeElement('span', 'status-pill', report.resolved ? 'Atendido' : 'Pendiente'));
    card.append(heading, makeElement('p', '', `Página: ${report.page}`), makeElement('p', 'report-description', report.description));
    if (report.steps) card.append(makeElement('p', '', `Pasos para reproducirlo: ${report.steps}`));
    if (report.contact) card.append(makeElement('p', '', `Contacto: ${report.contact}`));
    card.append(makeElement('p', 'order-meta', `Enviado: ${new Date(report.createdAt).toLocaleString('es-PA')}`));
    const actions = makeElement('div', 'report-actions');
    if (!report.resolved) {
      const resolve = makeElement('button', 'button button-outline', 'Marcar atendido'); resolve.type = 'button';
      resolve.addEventListener('click', async () => {
        try { await adminApi(`/api/admin/reports/${report._id}/resolve`, { method: 'PATCH' }); await refreshDashboard(true); }
        catch (error) { setStatus(error.message, true); }
      });
      actions.append(resolve);
    }
    const remove = makeElement('button', 'delete-order', 'Eliminar reporte'); remove.type = 'button';
    remove.addEventListener('click', async () => {
      try { await adminApi(`/api/admin/reports/${report._id}`, { method: 'DELETE' }); await refreshDashboard(true); }
      catch (error) { setStatus(error.message, true); }
    });
    actions.append(remove); card.append(actions); list.append(card);
  });
}

// Lista las campañas guardadas en la base de datos.
function renderPromotions(promotions) {
  const list = document.querySelector('#promotions-list');
  list.replaceChildren();
  if (!promotions.length) { list.append(makeElement('p', 'empty-orders', 'Aún no has preparado una promoción.')); return; }
  promotions.forEach((promotion) => {
    const item = makeElement('article', 'report-item');
    item.append(makeElement('h3', '', promotion.title));
    item.append(makeElement('p', '', `Asunto: ${promotion.subject}`));
    item.append(makeElement('p', '', `Personas suscritas incluidas: ${promotion.recipientCount}`));
    item.append(makeElement('p', 'order-meta', `Preparada: ${new Date(promotion.createdAt).toLocaleString('es-PA')}`));
    list.append(item);
  });
}

// Actualiza los contadores superiores para que el equipo vea pendientes de un vistazo.
function renderAdminSummary(data) {
  document.querySelector('#stat-orders').textContent = data.orders.length;
  document.querySelector('#stat-chats').textContent = data.conversations.filter((chat) => chat.handoff && chat.status !== 'closed' && chat.status !== 'answered').length;
  document.querySelector('#stat-reports').textContent = data.reports.filter((report) => !report.resolved).length;
  document.querySelector('#stat-customers').textContent = data.customers.length;
}

// Muestra un aviso general en la barra del panel.
function setStatus(message, isError = false) {
  const status = document.querySelector('#admin-status');
  if (status) { status.textContent = message; status.classList.toggle('is-error', isError); }
}

// Actualiza las listas con datos que vienen de MongoDB, pausando si se escribe una respuesta.
async function refreshDashboard(force = false) {
  if (!loggedIn || (!force && document.activeElement?.closest('.conversation-reply'))) return;
  dashboardData = await adminApi('/api/admin/dashboard');
  renderAdminSummary(dashboardData);
  renderOrders(dashboardData.orders); renderConversations(dashboardData.conversations);
  renderCustomers(dashboardData.customers); renderReports(dashboardData.reports); renderPromotions(dashboardData.promotions);
  setStatus('Datos sincronizados con MongoDB Atlas');
}

// Inicia la sesión administrativa con la contraseña guardada fuera del código, en .env.
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  adminMessage.textContent = '';
  try {
    await adminApi('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: document.querySelector('#admin-password').value }) });
    loggedIn = true; loginForm.hidden = true; dashboard.hidden = false;
    await refreshDashboard(true);
  } catch (error) { adminMessage.textContent = error.message; }
});

// Cierra la sesión de administración en el servidor.
document.querySelector('#admin-logout').addEventListener('click', async () => {
  try { await adminApi('/api/admin/logout', { method: 'POST' }); } catch {}
  loggedIn = false; dashboard.hidden = true; loginForm.hidden = false; loginForm.reset();
});

// Los botones de actualizar vuelven a consultar el tablero en Atlas.
document.querySelectorAll('[data-refresh]').forEach((button) => button.addEventListener('click', () => refreshDashboard(true).catch((error) => setStatus(error.message, true))));

// Guarda los borradores de promoción en Atlas sin enviar correos automáticamente.
document.querySelector('#promotion-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#promotion-message');
  try {
    const result = await adminApi('/api/admin/promotions', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    message.textContent = `Campaña guardada para ${result.promotion.recipientCount} persona(s) que aceptaron promociones. Esta versión no envía correos.`;
    form.reset(); await refreshDashboard(true);
  } catch (error) { message.textContent = error.message; }
});

// Descarga solo correos de personas con consentimiento para recibir promociones.
document.querySelector('#export-subscribers')?.addEventListener('click', async () => {
  const message = document.querySelector('#promotion-message');
  try {
    const { customers } = await adminApi('/api/admin/subscribers');
    if (!customers.length) { message.textContent = 'Todavía no hay clientes que hayan aceptado recibir promociones.'; return; }
    const escapeCsv = (value) => `"${String(value || '').replaceAll('"', '""')}"`;
    const rows = [['Nombre', 'Correo'], ...customers.map((customer) => [customer.name, customer.email])];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
    const file = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const download = document.createElement('a'); download.href = file; download.download = 'clientes-que-aceptan-promociones.csv'; download.click(); URL.revokeObjectURL(file);
    message.textContent = `Se descargó la lista de ${customers.length} contacto(s) con permiso.`;
  } catch (error) { message.textContent = error.message; }
});

// Abre un borrador de correo con destinatarios ocultos; la persona revisa y envía.
document.querySelector('#open-campaign-email')?.addEventListener('click', async () => {
  const form = document.querySelector('#promotion-form');
  if (!form.reportValidity()) return;
  const fields = Object.fromEntries(new FormData(form));
  const message = document.querySelector('#promotion-message');
  try {
    const { customers } = await adminApi('/api/admin/subscribers');
    if (!customers.length) { message.textContent = 'Todavía no hay clientes que hayan aceptado recibir promociones.'; return; }
    const bcc = customers.map((customer) => customer.email).join(',');
    const body = `${fields.message.trim()}\n\nJossy’s Berry PTY · Frescura y dulzura`;
    const mailto = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(fields.subject.trim())}&body=${encodeURIComponent(body)}`;
    if (mailto.length > 1800) { message.textContent = 'Hay muchos destinatarios; exporta la lista autorizada para usarla en tu servicio de correo.'; return; }
    const link = document.createElement('a'); link.href = mailto; link.click();
    message.textContent = `Se preparó un borrador con ${customers.length} destinatario(s) ocultos. Revísalo y pulsa Enviar.`;
  } catch (error) { message.textContent = error.message; }
});

// Si la persona recarga el panel, vuelve a mostrarlo cuando la sesión siga vigente.
adminApi('/api/admin/session')
  .then(() => { loggedIn = true; loginForm.hidden = true; dashboard.hidden = false; return refreshDashboard(true); })
  .catch(() => {});

// Mantiene el panel al día sin redibujarlo mientras se escribe una respuesta.
window.setInterval(() => refreshDashboard().catch((error) => setStatus(error.message, true)), 3000);

// Panel local para presentación. No se conecta a un servidor ni protege datos reales.
const ADMIN_PASSWORD = 'ADMINPTY507'; // Cambia esta clave solo para la demostración; está visible en este archivo.
const STORAGE_KEY = 'jossysBerryDemoData';
const loginForm = document.querySelector('#admin-login');
const dashboard = document.querySelector('#admin-dashboard');
const adminMessage = document.querySelector('#admin-message');

function readData() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { orders: value.orders || [], customers: value.customers || [], conversations: value.conversations || [] };
  } catch { return { orders: [], customers: [], conversations: [] }; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('jossys-data-changed'));
}

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderOrders(data) {
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
      saveData(latest); refreshDashboard();
    });
    card.append(details, remove); list.append(card);
  });
}

function renderConversations(data) {
  const list = document.querySelector('#conversations-list');
  list.replaceChildren();
  if (!data.conversations.length) { list.append(makeElement('p', 'empty-orders', 'Todavía no hay preguntas en la bandeja.')); return; }
  data.conversations.forEach((conversation) => {
    const card = makeElement('article', 'conversation-card');
    const heading = makeElement('div', 'conversation-title');
    heading.append(makeElement('h3', '', `Chat ${conversation.id.slice(-8)}`));
    heading.append(makeElement('span', 'status-pill', conversation.status === 'closed' ? 'Cerrada' : conversation.handoff ? (conversation.status === 'answered' ? 'Respondida' : 'Necesita asesor') : 'Chatbot'));
    const log = makeElement('div', 'chat-log');
    conversation.messages.forEach((message) => {
      const who = message.role === 'customer' ? 'Cliente' : message.role === 'human' ? 'Asesor' : 'Berry';
      const kind = message.role === 'customer' ? 'chat-customer' : message.role === 'human' ? 'chat-human' : 'chat-assistant';
      log.append(makeElement('p', kind, `${who}: ${message.text}`));
    });
    card.append(heading, log);
    if (conversation.status !== 'closed') {
      const replyForm = makeElement('form', 'conversation-reply');
      const input = makeElement('input'); input.name = 'reply'; input.placeholder = 'Escribe una respuesta para el cliente…'; input.maxLength = 1200; input.required = true;
      const send = makeElement('button', '', 'Responder'); send.type = 'submit';
      replyForm.append(input, send);
      replyForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const latest = readData();
        const item = latest.conversations.find((entry) => entry.id === conversation.id);
        if (!item) return;
        item.messages.push({ role: 'human', text: input.value.trim(), createdAt: new Date().toISOString() });
        item.handoff = true; item.status = 'answered'; item.updatedAt = new Date().toISOString();
        saveData(latest); refreshDashboard();
      });
      const close = makeElement('button', 'button button-outline', 'Cerrar conversación'); close.type = 'button';
      close.addEventListener('click', () => {
        const latest = readData();
        const item = latest.conversations.find((entry) => entry.id === conversation.id);
        if (item) { item.status = 'closed'; saveData(latest); refreshDashboard(); }
      });
      card.append(replyForm, close);
    }
    list.append(card);
  });
}

function renderCustomers(data) {
  const list = document.querySelector('#customers-list');
  list.replaceChildren();
  if (!data.customers.length) { list.append(makeElement('p', 'empty-orders', 'Aún no hay registros de clientes en este navegador.')); return; }
  data.customers.forEach((customer) => {
    const item = makeElement('article', 'customer-item');
    item.append(makeElement('b', '', customer.name), makeElement('p', '', `WhatsApp: ${customer.phone} · ${customer.createdAt}`));
    list.append(item);
  });
}

function refreshDashboard() {
  const data = readData();
  renderOrders(data); renderConversations(data); renderCustomers(data);
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const password = document.querySelector('#admin-password').value;
  if (password !== ADMIN_PASSWORD) { adminMessage.textContent = 'La contraseña no coincide.'; return; }
  adminMessage.textContent = '';
  loginForm.hidden = true; dashboard.hidden = false; refreshDashboard();
});

document.querySelector('#admin-logout').addEventListener('click', () => {
  dashboard.hidden = true; loginForm.hidden = false; loginForm.reset();
});
document.querySelectorAll('[data-refresh]').forEach((button) => button.addEventListener('click', refreshDashboard));
window.addEventListener('storage', refreshDashboard);
window.addEventListener('jossys-data-changed', refreshDashboard);
window.setInterval(() => { if (!dashboard.hidden) refreshDashboard(); }, 1500);

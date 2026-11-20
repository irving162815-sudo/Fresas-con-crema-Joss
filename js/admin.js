// Panel de administración: consulta MongoDB y protege las herramientas con sesión privada.
const loginForm = document.querySelector('#admin-login');
const dashboard = document.querySelector('#admin-dashboard');
const adminMessage = document.querySelector('#admin-message');
let dashboardData = { orders: [], conversations: [], customers: [], reports: [], promotions: [], offers: [] };
let loggedIn = false;
// Precios de lista usados para validar el precio promocional antes de enviarlo.
const offerProductPrices = { 'La Clásica': 2.99, 'La Crocantita': 3.99, 'La Consentida': 4.99 };
// Nombres visibles que corresponden a los cuatro estados que ve el cliente.
const orderStatusLabels = {
  received: 'Recibido', preparing: 'En proceso', waiting_courier: 'Esperando el repartidor', sent: 'Enviado'
};

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
    if (order.quantity > 1) details.append(makeElement('p', 'order-current-status', `Cantidad: ${order.quantity} porciones · ${order.offerType === 'two_for_one' ? 'Promoción 2 x 1' : 'Oferta aplicada'}`));
    details.append(makeElement('p', '', order.basePrice == null ? 'Precio base: No especificado' : `${order.offerTitle ? 'Precio de oferta' : 'Precio base'}: $${Number(order.basePrice).toFixed(2)}`));
    if (order.offerTitle) details.append(makeElement('p', 'order-current-status', `Oferta aplicada: ${order.offerTitle} · Precio regular $${Number(order.regularPrice || 0).toFixed(2)}`));
    if (order.toppings?.length) details.append(makeElement('p', '', `Toppings por porción: ${order.toppings.join(', ')} ($${Number(order.toppingUnitPrice ?? 0.5).toFixed(2)} cada topping${order.quantity > 1 ? ` × ${order.quantity} porciones` : ''})`));
    details.append(makeElement('p', '', order.totalPrice == null ? 'Total: No especificado' : `Total del pedido: $${Number(order.totalPrice).toFixed(2)}`));
    details.append(makeElement('p', '', `Dirección: ${order.address}`));
    details.append(makeElement('p', '', `Método de pago elegido: ${order.paymentMethod || 'No especificado'}`));
    details.append(makeElement('p', 'order-current-status', `Estado para el cliente: ${orderStatusLabels[order.status] || orderStatusLabels.received}`));
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
    const statusControls = makeElement('label', 'order-status-controls', 'Actualizar estado del pedido');
    const statusSelect = makeElement('select');
    statusSelect.setAttribute('aria-label', `Estado de pedido de ${order.name}`);
    Object.entries(orderStatusLabels).forEach(([value, label]) => {
      const option = makeElement('option', '', label);
      option.value = value;
      option.selected = (order.status || 'received') === value;
      statusSelect.append(option);
    });
    statusSelect.addEventListener('change', async () => {
      statusSelect.disabled = true;
      try {
        await adminApi(`/api/admin/orders/${order._id}/status`, { method: 'PATCH', body: JSON.stringify({ status: statusSelect.value }) });
        setStatus(`Estado del pedido de ${order.name} actualizado.`);
        await refreshDashboard(true);
      } catch (error) { setStatus(error.message, true); statusSelect.value = order.status || 'received'; }
      finally { statusSelect.disabled = false; }
    });
    statusControls.append(statusSelect);
    card.append(details, statusControls, remove); list.append(card);
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
      card.append(replyForm);
    }
    // Finalizar la atención elimina todo el registro de Atlas, incluidos los mensajes.
    const erase = makeElement('button', 'button button-outline', 'Finalizar y borrar chat'); erase.type = 'button';
    erase.addEventListener('click', async () => {
      if (!window.confirm('¿Finalizar y borrar permanentemente este chat y todos sus mensajes?')) return;
      erase.disabled = true;
      try {
        await adminApi(`/api/admin/chats/${conversation._id}`, { method: 'DELETE' });
        await refreshDashboard(true);
      } catch (error) { setStatus(error.message, true); erase.disabled = false; }
    });
    card.append(erase);
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

// Dibuja las promociones públicas y permite retirarlas sin editar archivos del sitio.
function renderOffers(offers) {
  const list = document.querySelector('#offers-list');
  if (!list) return;
  list.replaceChildren();
  if (!offers.length) { list.append(makeElement('p', 'empty-orders', 'Todavía no hay promociones publicadas.')); return; }
  offers.forEach((offer) => {
    const card = makeElement('article', 'offer-admin-card');
    if (offer.imageData) {
      const image = makeElement('img');
      image.src = offer.imageData;
      image.alt = `Imagen de ${offer.title}`;
      card.append(image);
    }
    const details = makeElement('div');
    details.append(makeElement('h3', '', offer.title), makeElement('p', '', offer.description));
    if (offer.product && Number.isFinite(offer.price) && ['discount', 'two_for_one'].includes(offer.offerType))
      details.append(makeElement('p', 'order-current-status', offer.offerType === 'two_for_one'
        ? `2 x 1 · ${offer.product} · Dos por $${Number(offer.price).toFixed(2)}`
        : `${offer.product} · Oferta $${Number(offer.price).toFixed(2)} (regular $${offerProductPrices[offer.product]?.toFixed(2) || '—'})`));
    else details.append(makeElement('p', 'order-meta', 'Esta promoción anterior no tiene un producto y precio canjeables. Retírala y publícala nuevamente para habilitar el canje.'));
    if (offer.conditions) details.append(makeElement('p', '', `Condiciones: ${offer.conditions}`));
    if (offer.expiresAt) details.append(makeElement('p', 'order-meta', `Válida hasta: ${new Date(offer.expiresAt).toLocaleDateString('es-PA')}`));
    details.append(makeElement('p', 'order-meta', `Publicada: ${new Date(offer.createdAt).toLocaleString('es-PA')}`));
    const remove = makeElement('button', 'delete-order', 'Retirar promoción');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      try { await adminApi(`/api/admin/offers/${offer._id}`, { method: 'DELETE' }); await refreshDashboard(true); }
      catch (error) { setStatus(error.message, true); }
    });
    card.append(details, remove);
    list.append(card);
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
  if (!loggedIn || (!force && document.activeElement?.closest('.conversation-reply,.order-status-controls'))) return;
  dashboardData = await adminApi('/api/admin/dashboard');
  renderAdminSummary(dashboardData);
  renderOrders(dashboardData.orders); renderConversations(dashboardData.conversations);
  renderCustomers(dashboardData.customers); renderReports(dashboardData.reports); renderPromotions(dashboardData.promotions); renderOffers(dashboardData.offers || []);
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

// Configura el precio de una rebaja o fija el precio normal para la promoción 2 x 1.
function updateOfferPriceControls() {
  const price = document.querySelector('#offer-price');
  const product = document.querySelector('#offer-product')?.value;
  const offerType = document.querySelector('#offer-type')?.value;
  const regularPrice = offerProductPrices[product];
  const label = document.querySelector('#offer-price-label');
  const help = document.querySelector('#offer-price-help');
  if (!price) return;
  if (offerType === 'two_for_one') {
    price.readOnly = true;
    price.min = regularPrice ? regularPrice.toFixed(2) : '0.01';
    price.max = regularPrice ? regularPrice.toFixed(2) : '4.99';
    price.value = regularPrice ? regularPrice.toFixed(2) : '';
    if (label) label.textContent = 'Precio que pagará por las dos porciones (USD)';
    if (help) help.textContent = regularPrice
      ? `El cliente recibe 2 porciones de ${product} y paga el precio regular de una. Los toppings se cobran por porción.`
      : 'Selecciona un producto para fijar el precio de una porción.';
    return;
  }
  price.readOnly = false;
  price.min = '0.01';
  price.max = regularPrice ? (regularPrice - 0.01).toFixed(2) : '2.98';
  if (regularPrice && Number(price.value) >= regularPrice) price.value = '';
  if (label) label.textContent = 'Precio promocional por porción (USD)';
  if (help) help.textContent = regularPrice
    ? `Debe ser menor que el precio regular de $${regularPrice.toFixed(2)}. Los toppings se cobran aparte.`
    : 'El precio debe ser menor al precio regular del producto. Los toppings se cobran aparte.';
}
document.querySelector('#offer-product')?.addEventListener('change', updateOfferPriceControls);
document.querySelector('#offer-type')?.addEventListener('change', updateOfferPriceControls);
updateOfferPriceControls();

// Reduce la imagen seleccionada en el navegador antes de enviarla a Atlas.
async function compressOfferImage(file) {
  if (!file || !file.name) return '';
  if (file.type && !file.type.startsWith('image/')) throw new Error('Selecciona un archivo de imagen.');
  let bitmap = null;
  let sourceUrl = '';
  try {
    // El decodificador del navegador acepta más formatos que el selector JPG/PNG/WebP.
    let source;
    if (typeof createImageBitmap === 'function') {
      try { bitmap = await createImageBitmap(file); source = bitmap; } catch { /* Continúa con el decodificador de imagen tradicional. */ }
    }
    if (!source) {
      sourceUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = sourceUrl;
      await image.decode();
      source = image;
    }

    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error('La imagen no tiene dimensiones que el navegador pueda leer.');

    // Convierte cualquier formato decodificable a JPEG y reduce tamaño y calidad hasta el límite de Atlas.
    const maxImageDataLength = 340000;
    const maxDimensions = [1600, 1280, 1024, 800, 640, 480];
    const qualities = [0.82, 0.68, 0.54, 0.4, 0.28, 0.18];
    for (const maxDimension of maxDimensions) {
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('El navegador no pudo preparar la imagen. Prueba con otro formato.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      // El fondo blanco conserva una apariencia limpia si el archivo tenía transparencia.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob) continue;
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('No se pudo leer la imagen convertida.'));
          reader.readAsDataURL(blob);
        });
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length <= maxImageDataLength)
          return dataUrl;
      }
    }
    throw new Error('La imagen es demasiado compleja para procesarla en este navegador. Prueba exportarla como JPG o PNG y vuelve a subirla.');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('La imagen es demasiado compleja')) throw error;
    throw new Error('No se pudo abrir esta imagen. Prueba con JPG, PNG o WebP y vuelve a intentarlo.');
  } finally {
    bitmap?.close();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }
}

// Enseña una vista previa local de la imagen que se va a publicar.
let offerPreviewUrl = '';
document.querySelector('#offer-image')?.addEventListener('change', (event) => {
  const file = event.currentTarget.files[0];
  const preview = document.querySelector('#offer-image-preview');
  const message = document.querySelector('#offer-message');
  if (offerPreviewUrl) URL.revokeObjectURL(offerPreviewUrl);
  offerPreviewUrl = '';
  preview.hidden = !file;
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    preview.hidden = true;
    message.textContent = 'Elige un archivo de imagen. Se convertirá y reducirá automáticamente al publicarlo.';
    return;
  }
  offerPreviewUrl = URL.createObjectURL(file);
  preview.src = offerPreviewUrl;
  message.textContent = 'Imagen seleccionada. Se optimizará automáticamente al publicar.';
});

// Publica el contenido y la imagen desde el panel, sin modificar código fuente.
document.querySelector('#offer-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#offer-message');
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(form));
    message.textContent = fields.image?.name ? 'Convirtiendo y optimizando la imagen…' : 'Publicando la promoción…';
    const imageData = await compressOfferImage(fields.image);
    const result = await adminApi('/api/admin/offers', { method: 'POST', body: JSON.stringify({ title: fields.title, description: fields.description,
      conditions: fields.conditions, product: fields.product, offerType: fields.offerType, price: Number(fields.price), expiresAt: fields.expiresAt, imageData }) });
    message.textContent = `La promoción “${result.offer.title}” ya está publicada en la sección Promociones.`;
    form.reset();
    document.querySelector('#offer-type')?.dispatchEvent(new Event('change'));
    document.querySelector('#offer-product')?.dispatchEvent(new Event('change'));
    const preview = document.querySelector('#offer-image-preview');
    preview.removeAttribute('src'); preview.hidden = true;
    if (offerPreviewUrl) URL.revokeObjectURL(offerPreviewUrl);
    offerPreviewUrl = '';
    await refreshDashboard(true);
  } catch (error) { message.textContent = error.message; }
  finally { submit.disabled = false; }
});

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

// Backend privado: conecta los formularios con MongoDB y protege el panel del equipo.
require('dotenv').config();

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
const mongoUri = process.env.MONGO_URI;
const sessionSecret = process.env.SESSION_SECRET;
const adminPassword = process.env.ADMIN_PASSWORD;

// Modelo de clientes: las contraseñas se guardan como hash bcrypt, nunca como texto.
const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 60, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, maxlength: 25, trim: true },
  passwordHash: { type: String, required: true, select: false },
  marketingConsent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Customer = mongoose.model('Customer', customerSchema);

// Pedidos: guarda el contacto y la dirección que se necesitan para coordinar la entrega.
const orderSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 60, trim: true },
  phone: { type: String, required: true, maxlength: 25, trim: true },
  flavor: { type: String, required: true, enum: ['La Clásica', 'La Crocantita', 'La Consentida'] },
  address: { type: String, required: true, maxlength: 250, trim: true },
  latitude: { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// Reportes de fallas: conserva la información necesaria para que el equipo investigue.
const reportSchema = new mongoose.Schema({
  category: { type: String, required: true, maxlength: 80 },
  page: { type: String, required: true, maxlength: 80 },
  description: { type: String, required: true, minlength: 8, maxlength: 1200 },
  steps: { type: String, maxlength: 800, default: '' },
  contact: { type: String, maxlength: 120, default: '' },
  resolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Report = mongoose.model('Report', reportSchema);

// Conversaciones: un identificador aleatorio permite al visitante volver a su chat.
const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['customer', 'assistant', 'human'], required: true },
  text: { type: String, required: true, maxlength: 1200 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });
const conversationSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  status: { type: String, enum: ['open', 'waiting', 'answered', 'closed'], default: 'open' },
  handoff: { type: Boolean, default: false },
  messages: { type: [messageSchema], default: [] },
  updatedAt: { type: Date, default: Date.now }
});
const Conversation = mongoose.model('Conversation', conversationSchema);

// Campañas: guarda borradores y cuántos clientes autorizaron recibir promociones.
const promotionSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 80 },
  subject: { type: String, required: true, maxlength: 120 },
  message: { type: String, required: true, maxlength: 1500 },
  recipientCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const Promotion = mongoose.model('Promotion', promotionSchema);

// Ajusta la política del navegador para los estilos y el mapa que usa la página.
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"],
    scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"], frameSrc: ["'self'", 'https://www.openstreetmap.org'],
    formAction: ["'self'"], frameAncestors: ["'self'"]
  } }
}));
app.disable('x-powered-by');
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(express.json({ limit: '20kb' }));
app.use((request, _response, next) => { if (!request.body) request.body = {}; next(); });

// Conserva las sesiones del navegador en Atlas y marca la cookie como privada.
app.use(session({
  name: 'jossys.sid',
  secret: sessionSecret,
  store: MongoStore.create({ mongoUrl: mongoUri, collectionName: 'sessions', ttl: 60 * 60 * 8 }),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));

// Reduce intentos automatizados de crear cuentas o probar contraseñas.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });
const publicFormLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false });

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

function safeCustomer(customer) {
  return { id: String(customer._id), name: customer.name, email: customer.email, phone: customer.phone,
    marketingConsent: customer.marketingConsent, createdAt: customer.createdAt };
}

function regenerateSession(request) {
  return new Promise((resolve, reject) => request.session.regenerate((error) => error ? reject(error) : resolve()));
}

function requireAdmin(request, response, next) {
  if (request.session.isAdmin) return next();
  return response.status(401).json({ message: 'Inicia sesión como administrador para continuar.' });
}

function validObjectId(value) {
  return mongoose.isValidObjectId(value);
}

// Responde con reglas del negocio y pasa a una persona si falta un dato confirmado.
function brandReply(question) {
  const textValue = question.toLowerCase();
  if (/\b(persona|asesor|humano|alguien real|representante|encargad[oa])\b/.test(textValue))
    return { reply: 'Claro, dejaré tu pregunta en la bandeja para que una persona te ayude por aquí. 🍓', handoff: true };
  if (/men[uú]|sabor|producto|cl[aá]sica|crocantita|consentida/.test(textValue))
    return { reply: 'Nuestro menú tiene La Clásica, La Crocantita y La Consentida. Puedes ver los detalles en la página Menú 🍓', handoff: false };
  if (/pedido|comprar|orden|entrega|direcci[oó]n|ubicaci[oó]n|gps/.test(textValue))
    return { reply: 'Para pedir, abre la página Pedidos, elige tu sabor y escribe la dirección. También puedes compartir tu ubicación GPS.', handoff: false };
  if (/whats ?app|tel[eé]fono|contacto|n[uú]mero/.test(textValue))
    return { reply: 'Puedes escribirnos por WhatsApp al 6434-7297 o al 6626-0366. ¡Con gusto te atendemos! ♡', handoff: false };
  if (/precio|precios|cu[aá]nto cuesta|cu[aá]nto vale|costo|pago|horario|zona|repart|ingrediente|alerg/.test(textValue))
    return { reply: 'No tengo ese dato confirmado. Dejaré tu consulta al equipo para que te responda con la información correcta.', handoff: true };
  if (/qui[eé]nes son|sobre ustedes|historia|emprendimiento|qu[eé] hacen/.test(textValue))
    return { reply: 'Somos Jossy’s Berry PTY. Preparamos fresas con crema con frutas frescas y cuidamos la higiene, el servicio y la experiencia de cada cliente.', handoff: false };
  if (/hola|buenas|saludos/.test(textValue))
    return { reply: '¡Hola! Qué gusto tenerte en Jossy’s Berry 🍓 ¿Quieres conocer el menú o hacer un pedido?', handoff: false };
  return { reply: 'No tengo esa respuesta confirmada. Dejaré tu pregunta al equipo para que una persona te ayude.', handoff: true };
}

// Confirma que la base siga conectada sin devolver nombres, pedidos ni credenciales.
app.get('/api/health', (_request, response) => response.json({ status: 'connected', database: 'MongoDB Atlas' }));

// Crea una cuenta y una sesión; el hash de contraseña nunca se devuelve al navegador.
app.post('/api/customers/register', authLimiter, async (request, response) => {
  const name = text(request.body.name, 60);
  const email = text(request.body.email, 120).toLowerCase();
  const phone = text(request.body.phone, 25);
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  if (!name || !isValidEmail(email) || !phone || password.length < 8 || password.length > 100 || request.body.consent !== true)
    return response.status(400).json({ message: 'Revisa tu nombre, correo, teléfono y contraseña (mínimo 8 caracteres).' });
  try {
    const customer = await Customer.create({ name, email, phone, passwordHash: await bcrypt.hash(password, 12),
      marketingConsent: request.body.marketingConsent === true });
    await regenerateSession(request);
    request.session.customerId = String(customer._id);
    return response.status(201).json({ customer: safeCustomer(customer) });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ message: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
    throw error;
  }
});

// Comprueba las credenciales en el servidor usando el hash bcrypt almacenado en Atlas.
app.post('/api/customers/login', authLimiter, async (request, response) => {
  const email = text(request.body.email, 120).toLowerCase();
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  if (!isValidEmail(email) || !password) return response.status(400).json({ message: 'Escribe un correo y contraseña válidos.' });
  const customer = await Customer.findOne({ email }).select('+passwordHash');
  if (!customer || !(await bcrypt.compare(password, customer.passwordHash)))
    return response.status(401).json({ message: 'El correo o la contraseña no coinciden.' });
  await regenerateSession(request);
  request.session.customerId = String(customer._id);
  return response.json({ customer: safeCustomer(customer) });
});

// Recupera el perfil conectado o informa que el visitante todavía no inició sesión.
app.get('/api/session', async (request, response) => {
  if (!request.session.customerId) return response.json({ customer: null });
  const customer = await Customer.findById(request.session.customerId);
  if (!customer) { delete request.session.customerId; return response.json({ customer: null }); }
  return response.json({ customer: safeCustomer(customer) });
});

// Cierra sesión en el servidor y elimina la cookie de sesión del navegador.
app.post('/api/customers/logout', (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie('jossys.sid');
    return response.json({ ok: true });
  });
});

// Recibe pedidos y datos de entrega, incluido GPS solo si el visitante lo compartió.
app.post('/api/orders', publicFormLimiter, async (request, response) => {
  const name = text(request.body.name, 60);
  const phone = text(request.body.phone, 25);
  const flavor = text(request.body.flavor, 40);
  const typedAddress = text(request.body.address, 250);
  const address = typedAddress || 'Ubicación GPS compartida';
  const latitude = request.body.latitude === '' || request.body.latitude == null ? undefined : Number(request.body.latitude);
  const longitude = request.body.longitude === '' || request.body.longitude == null ? undefined : Number(request.body.longitude);
  if (!name || !phone || !['La Clásica', 'La Crocantita', 'La Consentida'].includes(flavor) || request.body.consent !== true)
    return response.status(400).json({ message: 'Completa los datos del pedido y acepta que usemos la información para atenderlo.' });
  if ((latitude === undefined) !== (longitude === undefined) || (latitude !== undefined && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)))
    return response.status(400).json({ message: 'La ubicación GPS no es válida. Escribe tu dirección o vuelve a compartirla.' });
  if (!typedAddress && latitude === undefined) return response.status(400).json({ message: 'Escribe la dirección o comparte una ubicación GPS.' });
  const order = await Order.create({ name, phone, flavor, address, latitude, longitude,
    customerId: request.session.customerId || undefined });
  return response.status(201).json({ id: String(order._id), message: 'Tu pedido quedó registrado. El equipo te contactará para coordinar la entrega.' });
});

// Recibe reportes públicos con límites de texto para reducir abuso y datos innecesarios.
app.post('/api/reports', publicFormLimiter, async (request, response) => {
  const category = text(request.body.category, 80);
  const page = text(request.body.page, 80);
  const description = text(request.body.description, 1200);
  if (!category || !page || description.length < 8)
    return response.status(400).json({ message: 'Completa la categoría, página y una descripción de al menos 8 caracteres.' });
  const report = await Report.create({ category, page, description, steps: text(request.body.steps, 800), contact: text(request.body.contact, 120) });
  return response.status(201).json({ id: String(report._id), message: 'Gracias. Tu reporte quedó registrado para revisión.' });
});

// Lee los mensajes de una conversación identificada con una llave aleatoria del navegador.
app.get('/api/chats/:key', publicFormLimiter, async (request, response) => {
  if (!/^[a-f0-9-]{30,40}$/i.test(request.params.key)) return response.status(400).json({ message: 'Identificador de chat inválido.' });
  const conversation = await Conversation.findOne({ key: request.params.key }).lean();
  return response.json({ conversation });
});

// Guarda el mensaje del cliente y la respuesta del bot en Atlas; deriva dudas al equipo.
app.post('/api/chats/:key/messages', publicFormLimiter, async (request, response) => {
  if (!/^[a-f0-9-]{30,40}$/i.test(request.params.key)) return response.status(400).json({ message: 'Identificador de chat inválido.' });
  const message = text(request.body.message, 1200);
  if (!message) return response.status(400).json({ message: 'Escribe tu pregunta antes de enviarla.' });
  let conversation = await Conversation.findOne({ key: request.params.key });
  if (!conversation) conversation = new Conversation({ key: request.params.key });
  conversation.messages.push({ role: 'customer', text: message });
  const answer = conversation.handoff
    ? { reply: 'Tu mensaje ya está en la bandeja del equipo. Una persona te responderá por aquí.', handoff: true }
    : brandReply(message);
  conversation.messages.push({ role: 'assistant', text: answer.reply });
  conversation.handoff = conversation.handoff || answer.handoff;
  // Un nuevo mensaje del cliente vuelve a poner el chat en espera, aunque ya se hubiera respondido antes.
  if (conversation.handoff) conversation.status = 'waiting';
  conversation.updatedAt = new Date();
  await conversation.save();
  return response.json({ conversation });
});

// Inicia la sesión de administración; la clave privada vive únicamente en .env.
app.post('/api/admin/login', authLimiter, async (request, response) => {
  if (!adminPassword) return response.status(503).json({ message: 'Configura ADMIN_PASSWORD en .env para habilitar el acceso del equipo.' });
  const candidate = typeof request.body.password === 'string' ? request.body.password : '';
  const candidateHash = crypto.createHash('sha256').update(candidate).digest();
  const expectedHash = crypto.createHash('sha256').update(adminPassword).digest();
  if (!crypto.timingSafeEqual(candidateHash, expectedHash)) return response.status(401).json({ message: 'La contraseña no coincide.' });
  await regenerateSession(request);
  request.session.isAdmin = true;
  return response.json({ ok: true });
});

// Permite que el panel reconozca una sesión de administrador después de recargar.
app.get('/api/admin/session', requireAdmin, (_request, response) => response.json({ ok: true }));

app.post('/api/admin/logout', requireAdmin, (request, response) => {
  request.session.isAdmin = false;
  return request.session.save((error) => error ? response.status(500).json({ message: 'No se pudo cerrar la sesión.' }) : response.json({ ok: true }));
});

// Entrega al equipo solo los datos necesarios para atender pedidos y conversaciones.
app.get('/api/admin/dashboard', requireAdmin, async (_request, response) => {
  const [orders, conversations, customers, reports, promotions] = await Promise.all([
    Order.find().sort({ createdAt: -1 }).limit(500).lean(),
    Conversation.find().sort({ updatedAt: -1 }).limit(500).lean(),
    Customer.find().select('-passwordHash').sort({ createdAt: -1 }).limit(1000).lean(),
    Report.find().sort({ createdAt: -1 }).limit(500).lean(),
    Promotion.find().sort({ createdAt: -1 }).limit(100).lean()
  ]);
  return response.json({ orders, conversations, customers, reports, promotions });
});

// Permite responder en un chat persistente y que el cliente vea la respuesta al actualizar.
app.post('/api/admin/chats/:id/reply', requireAdmin, async (request, response) => {
  const message = text(request.body.message, 1200);
  const conversation = await Conversation.findById(request.params.id);
  if (!conversation || !message) return response.status(404).json({ message: 'No encontramos el chat o la respuesta está vacía.' });
  conversation.messages.push({ role: 'human', text: message });
  conversation.handoff = true; conversation.status = 'answered'; conversation.updatedAt = new Date();
  await conversation.save();
  return response.json({ ok: true });
});

app.post('/api/admin/chats/:id/close', requireAdmin, async (request, response) => {
  const conversation = await Conversation.findByIdAndUpdate(request.params.id, { status: 'closed', updatedAt: new Date() });
  return conversation ? response.json({ ok: true }) : response.status(404).json({ message: 'No encontramos esa conversación.' });
});

app.delete('/api/admin/orders/:id', requireAdmin, async (request, response) => {
  if (!validObjectId(request.params.id)) return response.status(400).json({ message: 'Identificador inválido.' });
  await Order.findByIdAndDelete(request.params.id); return response.json({ ok: true });
});

app.patch('/api/admin/reports/:id/resolve', requireAdmin, async (request, response) => {
  if (!validObjectId(request.params.id)) return response.status(400).json({ message: 'Identificador inválido.' });
  await Report.findByIdAndUpdate(request.params.id, { resolved: true }); return response.json({ ok: true });
});

app.delete('/api/admin/reports/:id', requireAdmin, async (request, response) => {
  if (!validObjectId(request.params.id)) return response.status(400).json({ message: 'Identificador inválido.' });
  await Report.findByIdAndDelete(request.params.id); return response.json({ ok: true });
});

app.patch('/api/admin/customers/:id/unsubscribe', requireAdmin, async (request, response) => {
  if (!validObjectId(request.params.id)) return response.status(400).json({ message: 'Identificador inválido.' });
  await Customer.findByIdAndUpdate(request.params.id, { marketingConsent: false }); return response.json({ ok: true });
});

// Guarda una campaña y cuenta únicamente las personas que aceptaron recibir correos.
app.post('/api/admin/promotions', requireAdmin, async (request, response) => {
  const title = text(request.body.title, 80);
  const subject = text(request.body.subject, 120);
  const message = text(request.body.message, 1500);
  if (!title || !subject || !message) return response.status(400).json({ message: 'Completa el nombre, asunto y texto de la campaña.' });
  const recipientCount = await Customer.countDocuments({ marketingConsent: true });
  const promotion = await Promotion.create({ title, subject, message, recipientCount });
  return response.status(201).json({ promotion });
});

// Exporta correos solo al administrador para preparar las campañas autorizadas.
app.get('/api/admin/subscribers', requireAdmin, async (_request, response) => {
  const customers = await Customer.find({ marketingConsent: true }).select('name email').lean();
  return response.json({ customers });
});

// Devuelve errores de API sin incluir contraseñas, URI o detalles internos de Atlas.
app.use('/api', (error, _request, response, _next) => {
  console.error(`Error de API: ${error.name || 'Error'}`);
  return response.status(500).json({ message: 'No se pudo completar la solicitud. Intenta de nuevo más tarde.' });
});

// Publica únicamente las páginas y recursos del sitio; nunca comparte .env ni node_modules.
app.use('/assets', express.static(path.join(__dirname, 'assets'), { dotfiles: 'deny', index: false }));
app.use('/css', express.static(path.join(__dirname, 'css'), { dotfiles: 'deny', index: false }));
app.use('/js', express.static(path.join(__dirname, 'js'), { dotfiles: 'deny', index: false }));
for (const file of ['index.html', 'menu.html', 'sobre-nosotros.html', 'redes.html', 'registro.html',
  'iniciar-sesion.html', 'pedido.html', 'reportar.html', 'admin.html']) {
  app.get(file === 'index.html' ? ['/', '/index.html'] : `/${file}`, (_request, response) => {
    response.sendFile(path.join(__dirname, file));
  });
}

// Inicia el sitio solo tras conectar Atlas y crear los índices de la base.
async function startServer() {
  if (!mongoUri || !sessionSecret) throw new Error('Completa MONGO_URI y SESSION_SECRET en .env.');
  await mongoose.connect(mongoUri);
  await Promise.all([Customer.init(), Conversation.init()]);
  app.listen(port, host, () => console.log(`Sitio conectado con MongoDB Atlas: http://localhost:${port}`));
}

startServer().catch((error) => {
  const safeDetails = String(error.message || 'Error desconocido')
    .replaceAll(mongoUri || '', '[URI oculto]')
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi, '[URI oculto]');
  console.error(`No se pudo iniciar el servidor (${error.name || 'Error'}): ${safeDetails}`);
  process.exit(1);
});

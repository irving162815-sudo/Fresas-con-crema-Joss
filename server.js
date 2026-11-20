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
// Catálogo del servidor: los precios se calculan aquí para que el navegador no pueda cambiarlos.
const productPrices = new Map([['La Clásica', 2.99], ['La Crocantita', 3.99], ['La Consentida', 4.99]]);
const allowedToppings = ['Extra de crema', 'Chispitas de chocolate', 'Chispitas de colores', 'Galletas Oreo', 'Extra de fresas'];
const toppingPrice = 0.50;

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
  basePrice: { type: Number, required: true, min: 0 },
  toppingUnitPrice: { type: Number, default: toppingPrice, min: 0 },
  totalPrice: { type: Number, required: true, min: 0 },
  toppings: { type: [{ type: String, enum: allowedToppings }], default: [] },
  paymentMethod: { type: String, enum: ['Efectivo', 'Yappy', 'Tarjeta Visa'], default: 'Efectivo' },
  status: { type: String, enum: ['received', 'preparing', 'waiting_courier', 'sent'], default: 'received' },
  statusUpdatedAt: { type: Date, default: Date.now },
  trackingTokenHash: { type: String, select: false },
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
  link: { type: String, enum: ['', 'menu.html', 'pedido.html', 'promociones.html', 'redes.html', 'sobre-nosotros.html', 'registro.html', 'iniciar-sesion.html', 'reportar.html'], default: '' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });
const conversationSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  status: { type: String, enum: ['open', 'waiting', 'answered', 'closed'], default: 'open' },
  handoff: { type: Boolean, default: false },
  messages: { type: [messageSchema], default: [] },
  updatedAt: { type: Date, default: Date.now }
});
// Limpia chats abandonados después de 30 días como límite adicional de retención.
conversationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
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

// Promociones del sitio; las imágenes pequeñas se guardan en Atlas y no en el disco efímero de Render.
const offerSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 80, trim: true },
  description: { type: String, required: true, maxlength: 600, trim: true },
  imageData: { type: String, maxlength: 350000, default: '', select: false },
  createdAt: { type: Date, default: Date.now }
});
const Offer = mongoose.model('Offer', offerSchema);

// Ajusta la política del navegador para los estilos y el mapa que usa la página.
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"],
    scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    connectSrc: ["'self'"], frameSrc: ["'self'", 'https://www.openstreetmap.org'],
    formAction: ["'self'"], frameAncestors: ["'self'"]
  } }
}));
app.disable('x-powered-by');
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
// Mantiene pequeños los formularios normales; solo el administrador puede enviar una imagen comprimida.
const smallJsonParser = express.json({ limit: '20kb' });
const offerJsonParser = express.json({ limit: '400kb' });
app.use((request, response, next) => {
  const parser = request.method === 'POST' && request.path === '/api/admin/offers' ? offerJsonParser : smallJsonParser;
  parser(request, response, next);
});
app.use((request, _response, next) => { if (!request.body) request.body = {}; next(); });
// Evita que navegadores o intermediarios guarden respuestas con chats y datos privados.
app.use('/api', (_request, response, next) => { response.set('Cache-Control', 'no-store, private'); next(); });

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
const chatReadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false });
const chatMessageLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: 'draft-8', legacyHeaders: false });
const orderTrackingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false });

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

// Elige una respuesta distinta para cada tema conocido, sin enviar mensajes a servicios externos.
function answerBusinessQuestion(question) {
  const normalized = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const includesAny = (...terms) => terms.some((term) => normalized.includes(term));
  const choose = (answers) => answers[crypto.randomInt(answers.length)];
  const response = (answers, link = '') => ({ reply: choose(answers), handoff: false, link });

  if (includesAny('asesor', 'persona real', 'humano', 'administrador', 'administradores', 'alguien del equipo', 'hablar con alguien', 'hablar con una persona', 'persona del equipo'))
    return { reply: '¡Claro! Ya envié tu consulta a nuestro equipo. Una persona te responderá por este chat cuando esté disponible.', handoff: true };
  if (/^(hola|hey|saludos|buenas|buenas tardes|buenas noches|buenos dias)[!.?,\s]*$/.test(normalized))
    return response(['¡Hola! 🍓 Soy Berry. Puedo ayudarte con el menú, los precios, toppings, pedidos, pagos y contacto.', '¡Hola, qué gusto tenerte por aquí! Pregúntame por sabores, precios, entregas o formas de pago.', '¡Holaaa! Bienvenido a Jossy’s Berry PTY. ¿Quieres conocer el menú o necesitas ayuda con un pedido?']);
  if (/^(gracias|muchas gracias|te agradezco)[!.?,\s]*$/.test(normalized))
    return response(['¡Con gusto! 🍓 Aquí estoy si te surge otra pregunta.', '¡Gracias a ti por escribirnos! Será un gusto atenderte.', '¡Para eso estamos! Puedes preguntarme por el menú o cómo hacer tu pedido.']);
  if (includesAny('adios', 'hasta luego', 'chao', 'bye'))
    return response(['¡Hasta pronto! Que tengas un día delicioso 🍓', '¡Gracias por visitar Jossy’s Berry PTY! Aquí estaremos cuando se te antojen fresas con crema.', '¡Nos vemos! Puedes volver a escribirnos cuando quieras.']);

  if (includesAny('que puedes hacer', 'que te puedo preguntar', 'que sabes', 'necesito ayuda', 'como me ayudas', 'opciones tienes'))
    return response(['Puedo orientarte sobre sabores y precios, toppings, pedidos, pagos, horario, entregas, promociones, registro y contacto. Si no tengo el dato, se lo paso al equipo.', 'Pregúntame sobre el menú, cómo pedir, Yappy, efectivo, horarios o nuestras redes. Para algo especial, te conecto con el equipo.', 'Te ayudo a encontrar secciones del sitio y contestar dudas comunes. También puedo enviar preguntas que no conozca al personal.']);

  if (includesAny('quienes son', 'quien es jossy', 'sobre ustedes', 'sobre nosotros', 'su historia', 'que hacen', 'emprendimiento'))
    return response(['Somos Jossy’s Berry PTY, un emprendimiento dedicado a preparar fresas con crema frescas y deliciosas, con buena atención y precios accesibles.', 'En Jossy’s Berry PTY preparamos fresas con crema con fruta fresca y cuidamos la presentación, la higiene y la atención a cada cliente.', 'Nuestro emprendimiento ofrece fresas con crema para disfrutar en cualquier ocasión. Nos importa la frescura, el buen servicio y una experiencia rica y accesible.'], 'sobre-nosotros.html');

  if (includesAny('oreo', 'galleta', 'galletas', 'topping', 'toppings', 'chispita', 'chispitas', 'extra de crema', 'extra de fresa', 'extra de fresas'))
    return response(['Puedes agregar Extra de crema, Chispitas de chocolate, Chispitas de colores, Galletas Oreo o Extra de fresas. Cada topping cuesta $0.50.', '¡Personaliza tu postre! Tenemos cinco toppings: crema extra, chispitas de chocolate o colores, Oreo y fresas extra. Cada uno vale $0.50.', 'Los toppings disponibles cuestan $0.50 cada uno: crema extra, chispitas de chocolate, chispitas de colores, Oreo y fresas extra.'], 'menu.html');

  if (includesAny('personalizar', 'combinacion', 'combinación', 'escoger extras', 'agregar extras'))
    return response(['Sí, puedes escoger tus toppings al hacer el pedido. Cada extra cuesta $0.50.', 'Puedes personalizar tu postre con los toppings del menú y elegirlos en el formulario de Pedidos.', '¡Claro! Selecciona los extras que quieras en el formulario de pedido; cada topping tiene un costo de $0.50.'], 'pedido.html');

  if (includesAny('imagen', 'imagenes', 'foto', 'fotos', 'ilustrativa'))
    return response(['Las imágenes del menú son ilustrativas y ayudan a mostrar nuestros productos. Puedes ver los sabores disponibles en Menú.', 'Las fotos son ilustrativas; la presentación puede variar. Revisa los productos en la sección Menú.'], 'menu.html');

  if (includesAny('precio', 'precios', 'cuanto cuesta', 'cuanto vale', 'cuestan', 'costo', 'menu', 'menú', 'clasica', 'crocantita', 'consentida', 'producto', 'productos', 'sabores', 'sabor')) {
    if (includesAny('clasica')) return response(['La Clásica cuesta $2.99. Puedes añadir los toppings que quieras por $0.50 cada uno.', 'La Clásica vale $2.99 antes de toppings. Cada extra cuesta $0.50.', 'Nuestro sabor La Clásica cuesta $2.99. ¿Quieres que te cuente sobre los otros sabores?'], 'menu.html');
    if (includesAny('crocantita')) return response(['La Crocantita cuesta $3.99 y puedes personalizarla con toppings a $0.50 cada uno.', 'La Crocantita vale $3.99 antes de agregar toppings.', 'La Crocantita tiene un precio base de $3.99. Cada topping adicional cuesta $0.50.'], 'menu.html');
    if (includesAny('consentida')) return response(['La Consentida cuesta $4.99 antes de toppings. Cada extra cuesta $0.50.', 'La Consentida vale $4.99 y puedes elegir toppings por $0.50 cada uno.', 'Nuestro sabor La Consentida cuesta $4.99.'], 'menu.html');
    return response(['Tenemos tres opciones: La Clásica $2.99, La Crocantita $3.99 y La Consentida $4.99. Cada topping adicional cuesta $0.50.', 'El menú empieza en $2.99: La Clásica $2.99, La Crocantita $3.99 y La Consentida $4.99. Los toppings cuestan $0.50 cada uno.', 'Puedes escoger La Clásica ($2.99), La Crocantita ($3.99) o La Consentida ($4.99), y agregar toppings por $0.50 cada uno.'], 'menu.html');
  }

  if (includesAny('yappy', 'efectivo', 'visa', 'tarjeta', 'pago', 'pagar', 'transferencia'))
    return response(['Aceptamos efectivo al recibir o Yappy al 6434-7297 después de confirmar el pedido. Para pagar con Visa, coordina con el equipo; el sitio no procesa tarjetas.', 'Puedes pagar en efectivo al recibir o por Yappy al 6434-7297 una vez confirmado. Si prefieres Visa, te ayudamos a coordinarlo con una persona.', 'Para pagar tienes efectivo al recibir y Yappy al 6434-7297 después de confirmar. Las tarjetas Visa se coordinan con el equipo y no se ingresan en esta página.'], 'pedido.html');

  if (includesAny('gratis', 'gratuita', 'costo de envio', 'costo de entrega', 'cuanto cuesta el envio', 'cuanto cuesta la entrega', 'cuanto cuesta el delivery', 'precio de la entrega', 'cuanto cuesta el domicilio', 'cuanto cobran por entregar', 'tamaño', 'tamano', 'porciones', 'porcion'))
    return { reply: 'No tengo ese costo o tamaño confirmado. Ya pasé tu pregunta al equipo para que te dé la información correcta.', handoff: true, link: 'redes.html' };

  if (includesAny('entrega', 'delivery', 'domicilio', 'direccion', 'dirección', 'ubicacion', 'ubicación', 'gps', 'mapa', 'recoger', 'envio', 'envío'))
    return response(['En la página Pedidos puedes escribir tu dirección o compartir tu ubicación GPS para indicar dónde entregar. El equipo confirmará los detalles del pedido.', 'Para indicar la entrega, abre Pedidos y escribe tu dirección o usa el botón de ubicación GPS. Si tienes dudas sobre cobertura, te paso con el equipo.', 'Puedes enviar tu pedido desde la sección Pedidos e incluir una dirección escrita o tu ubicación del GPS.'], 'pedido.html');

  if (includesAny('pedido', 'ordenar', 'comprar', 'quiero una', 'quiero pedir', 'hacer un pedido', 'como pido', 'cómo pido'))
    return response(['¡Qué rico! Entra a la sección Pedidos, elige tu sabor y toppings, completa tus datos y selecciona cómo pagar.', 'Puedes pedir desde la pestaña Pedidos: selecciona el producto, personalízalo y completa la información de entrega.', 'Para comprar, abre Pedidos en el menú. Allí escoges sabor, toppings, método de pago y dirección.'], 'pedido.html');

  if (includesAny('instagram', 'instagran', 'insta', 'redes sociales', 'whatsapp', 'wsp', 'contacto', 'contactar', 'contactarnos', 'contacto al equipo', 'telefono', 'teléfono', 'numero', 'número'))
    return response(['Estamos en Instagram como Fresamania: instagram.com/fresa_mania01. También puedes escribirnos por WhatsApp al 6434-7297 o 6626-0366.', 'Encuéntranos en Instagram como Fresamania y contáctanos por WhatsApp: 6434-7297 o 6626-0366.', 'Para contactarnos, escríbenos al WhatsApp 6434-7297 o 6626-0366. En Instagram estamos como Fresamania.'], 'redes.html');

  if (includesAny('promocion', 'promoción', 'promociones', 'oferta', 'ofertas', 'descuento', 'descuentos'))
    return response(['Las promociones vigentes aparecen en la sección Promociones de la página. Si quieres confirmar una oferta específica, puedo pasar tu consulta al equipo.', 'Revisa la pestaña Promociones para ver las ofertas publicadas. No quiero inventarte una promoción que ya haya terminado.', 'Puedes consultar las promociones actuales en la sección Promociones.'], 'promociones.html');

  if (includesAny('ingrediente', 'ingredientes', 'alergia', 'alergico', 'alérgico', 'intolerancia', 'higiene', 'fresca', 'frescas', 'conservacion', 'conservación', 'vegetariano', 'vegano'))
    return { reply: 'Para confirmar ingredientes, alérgenos o condiciones de conservación con precisión, prefiero que te responda una persona del equipo. Ya envié tu consulta a Admin.', handoff: true };

  if (includesAny('feriado', 'festivo', 'dia festivo', 'días festivos'))
    return { reply: 'Nuestro horario habitual es de lunes a domingo, de 10:00 a. m. a 6:00 p. m. Para confirmar atención en un feriado específico, ya pasé tu consulta al equipo.', handoff: true, link: 'redes.html' };

  if (includesAny('que dias', 'domingo', 'sabado', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'todos los dias', 'fin de semana', 'fines de semana', 'hoy', 'mañana', 'manana'))
    return response(['Atendemos de lunes a domingo, de 10:00 a. m. a 6:00 p. m. 🍓', '¡Estamos para atenderte todos los días! Nuestro horario es de 10:00 AM a 6:00 PM.', 'Abrimos de lunes a domingo, de 10:00 a. m. a 6:00 p. m. Puedes consultar nuestras redes para contactarnos.'], 'redes.html');

  if (includesAny('horario', 'hora', 'abierto', 'abren', 'cierran', 'atienden', 'atencion', 'atención'))
    return response(['Nuestro horario es de lunes a domingo, de 10:00 a. m. a 6:00 p. m. ¡Con gusto te atendemos!', 'Atendemos todos los días de 10:00 AM a 6:00 PM.', 'Jossy’s Berry PTY atiende de lunes a domingo, de 10:00 a. m. a 6:00 p. m.'], 'redes.html');

  if (includesAny('disponibilidad', 'hoy', 'zona', 'cobertura', 'cuanto demora', 'cuánto demora', 'tiempo de entrega', 'fecha'))
    return { reply: 'No tengo ese dato confirmado y no quiero darte información incorrecta. Ya envié tu pregunta a nuestro equipo para que te ayude por aquí.', handoff: true };

  if (includesAny('iniciar sesion', 'iniciar sesión', 'entrar a mi cuenta', 'ingresar a mi cuenta'))
    return response(['Inicia sesión con el correo y la contraseña que usaste al registrarte.', 'La opción Iniciar sesión está en la navegación del sitio; entra con tu correo y contraseña.', 'Para entrar a tu cuenta, abre Iniciar sesión desde el encabezado.'], 'iniciar-sesion.html');

  if (includesAny('registrar', 'registro', 'crear cuenta', 'cliente fiel', 'beneficios', 'beneficio'))
    return response(['Puedes crear tu cuenta desde Registrarse y luego iniciar sesión con tu correo y contraseña.', 'En el menú encontrarás Registrarse para crear tu cuenta de cliente fiel.', 'Para unirte como cliente fiel, abre Registrarse y completa tus datos.'], 'registro.html');

  if (includesAny('falla', 'error', 'problema en la pagina', 'reportar', 'no funciona'))
    return response(['Puedes reportar el problema en la sección Reportar una falla. El equipo revisará los detalles.', 'Abre Reportar una falla y cuéntanos qué ocurrió para que podamos revisarlo.', 'Para avisarnos de un error del sitio, utiliza el formulario Reportar una falla.'], 'reportar.html');

  return { reply: 'No tengo una respuesta confirmada para esa consulta. Ya la envié al equipo de Jossy’s Berry PTY y una persona podrá responderte por este chat. 🍓', handoff: true };
}

// Confirma que la base siga conectada sin devolver nombres, pedidos ni credenciales.
app.get('/api/health', (_request, response) => response.json({ status: 'connected', database: 'MongoDB Atlas' }));

// Muestra únicamente las promociones publicadas, con campos seguros para el catálogo público.
app.get('/api/promotions', async (_request, response) => {
  const offers = await Offer.find().select('title description createdAt +imageData').sort({ createdAt: -1 }).limit(12).lean();
  return response.json({ offers });
});

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
  const toppings = Array.isArray(request.body.toppings) ? [...new Set(request.body.toppings.map((item) => text(item, 40)))] : [];
  const paymentMethod = text(request.body.paymentMethod, 30);
  const typedAddress = text(request.body.address, 250);
  const address = typedAddress || 'Ubicación GPS compartida';
  const latitude = request.body.latitude === '' || request.body.latitude == null ? undefined : Number(request.body.latitude);
  const longitude = request.body.longitude === '' || request.body.longitude == null ? undefined : Number(request.body.longitude);
  if (!name || !phone || !productPrices.has(flavor) || toppings.some((item) => !allowedToppings.includes(item)) || !['Efectivo', 'Yappy', 'Tarjeta Visa'].includes(paymentMethod) || request.body.consent !== true)
    return response.status(400).json({ message: 'Completa tus datos, selecciona producto y método de pago, y acepta que usemos la información para atenderte.' });
  if ((latitude === undefined) !== (longitude === undefined) || (latitude !== undefined && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)))
    return response.status(400).json({ message: 'La ubicación GPS no es válida. Escribe tu dirección o vuelve a compartirla.' });
  if (!typedAddress && latitude === undefined) return response.status(400).json({ message: 'Escribe la dirección o comparte una ubicación GPS.' });
  const basePrice = productPrices.get(flavor);
  const totalPrice = Number((basePrice + toppings.length * toppingPrice).toFixed(2));
  // El cliente recibe una llave privada; en Atlas solo guardamos su huella cifrada con SHA-256.
  const trackingToken = crypto.randomBytes(32).toString('hex');
  const order = await Order.create({ name, phone, flavor, basePrice, toppingUnitPrice: toppingPrice, totalPrice, toppings, paymentMethod, address, latitude, longitude,
    trackingTokenHash: crypto.createHash('sha256').update(trackingToken).digest('hex'),
    customerId: request.session.customerId || undefined });
  const paymentInstructions = {
    Efectivo: 'Pagarás al recibir; el equipo confirmará el total y la entrega por WhatsApp.',
    Yappy: 'Espera la confirmación del total del equipo antes de enviar tu pago Yappy al 6434-7297.',
    'Tarjeta Visa': 'El equipo coordinará contigo una forma segura de completar el pago. No envíes datos de tarjeta por este formulario.'
  };
  const extraNotice = toppings.length ? ` Incluye ${toppings.length} topping(s) a $${toppingPrice.toFixed(2)} cada uno.` : '';
  return response.status(201).json({ id: String(order._id), trackingToken, status: order.status, statusUpdatedAt: order.statusUpdatedAt, totalPrice,
    message: `Pedido registrado. Total: $${totalPrice.toFixed(2)} (producto $${basePrice.toFixed(2)}).${extraNotice} ${paymentInstructions[paymentMethod]}` });
});

// Devuelve solo el progreso del pedido si el visitante presenta su llave privada de seguimiento.
app.get('/api/orders/:id/status', orderTrackingLimiter, async (request, response) => {
  const token = request.get('x-order-tracking-token') || '';
  if (!validObjectId(request.params.id) || !/^[a-f0-9]{64}$/i.test(token))
    return response.status(404).json({ message: 'No encontramos ese pedido. Usa el mismo navegador donde lo realizaste.' });
  const order = await Order.findById(request.params.id).select('+trackingTokenHash').lean();
  if (!order?.trackingTokenHash) return response.status(404).json({ message: 'No encontramos ese pedido. Usa el mismo navegador donde lo realizaste.' });
  const suppliedHash = crypto.createHash('sha256').update(token).digest();
  const savedHash = Buffer.from(order.trackingTokenHash, 'hex');
  if (savedHash.length !== suppliedHash.length || !crypto.timingSafeEqual(savedHash, suppliedHash))
    return response.status(404).json({ message: 'No encontramos ese pedido. Usa el mismo navegador donde lo realizaste.' });
  return response.json({ id: String(order._id), flavor: order.flavor, status: order.status || 'received', statusUpdatedAt: order.statusUpdatedAt || order.createdAt });
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
app.get('/api/chats/:key', chatReadLimiter, async (request, response) => {
  if (!/^[a-f0-9-]{30,40}$/i.test(request.params.key)) return response.status(400).json({ message: 'Identificador de chat inválido.' });
  const conversation = await Conversation.findOne({ key: request.params.key }).lean();
  return response.json({ conversation });
});

// Borra permanentemente de Atlas el chat que el cliente decide finalizar.
app.delete('/api/chats/:key', chatReadLimiter, async (request, response) => {
  if (!/^[a-f0-9-]{30,40}$/i.test(request.params.key)) return response.status(400).json({ message: 'Identificador de chat inválido.' });
  await Conversation.deleteOne({ key: request.params.key });
  return response.json({ ok: true });
});

// Guarda el mensaje y usa respuestas locales; las preguntas desconocidas pasan al equipo.
app.post('/api/chats/:key/messages', chatMessageLimiter, async (request, response) => {
  if (!/^[a-f0-9-]{30,40}$/i.test(request.params.key)) return response.status(400).json({ message: 'Identificador de chat inválido.' });
  const message = text(request.body.message, 1200);
  if (!message) return response.status(400).json({ message: 'Escribe tu pregunta antes de enviarla.' });
  let conversation = await Conversation.findOne({ key: request.params.key });
  if (!conversation) conversation = new Conversation({ key: request.params.key });
  conversation.messages.push({ role: 'customer', text: message });
  const answer = conversation.handoff
    ? { reply: 'Tu consulta ya está en la bandeja del equipo. Una persona te responderá por aquí.', handoff: true }
    : answerBusinessQuestion(message);
  conversation.messages.push({ role: 'assistant', text: answer.reply, link: answer.link || '' });
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
  const [orders, conversations, customers, reports, promotions, offers] = await Promise.all([
    Order.find().sort({ createdAt: -1 }).limit(500).lean(),
    Conversation.find().sort({ updatedAt: -1 }).limit(500).lean(),
    Customer.find().select('-passwordHash').sort({ createdAt: -1 }).limit(1000).lean(),
    Report.find().sort({ createdAt: -1 }).limit(500).lean(),
    Promotion.find().sort({ createdAt: -1 }).limit(100).lean(),
    Offer.find().select('title description createdAt').sort({ createdAt: -1 }).limit(100).lean()
  ]);
  return response.json({ orders, conversations, customers, reports, promotions, offers });
});

// Publica una promoción desde Admin y limita imágenes a JPEG comprimido para cuidar Atlas.
app.post('/api/admin/offers', requireAdmin, publicFormLimiter, async (request, response) => {
  const title = text(request.body.title, 80);
  const description = text(request.body.description, 600);
  const imageData = typeof request.body.imageData === 'string' ? request.body.imageData : '';
  if (!title || !description) return response.status(400).json({ message: 'Escribe el título y la descripción de la promoción.' });
  if (imageData && (imageData.length > 350000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(imageData)))
    return response.status(400).json({ message: 'La imagen no pudo prepararse para publicarla. Elige otra imagen y vuelve a intentarlo.' });
  const offer = await Offer.create({ title, description, imageData });
  return response.status(201).json({ offer: { id: String(offer._id), title: offer.title } });
});

// Permite retirar del sitio una promoción desde el panel protegido.
app.delete('/api/admin/offers/:id', requireAdmin, async (request, response) => {
  if (!validObjectId(request.params.id)) return response.status(400).json({ message: 'Identificador inválido.' });
  await Offer.findByIdAndDelete(request.params.id);
  return response.json({ ok: true });
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

// Permite al equipo borrar el chat de Atlas cuando ya no hace falta conservarlo.
app.delete('/api/admin/chats/:id', requireAdmin, async (request, response) => {
  if (!validObjectId(request.params.id)) return response.status(400).json({ message: 'Identificador de conversación inválido.' });
  await Conversation.findByIdAndDelete(request.params.id);
  return response.json({ ok: true });
});

app.delete('/api/admin/orders/:id', requireAdmin, async (request, response) => {
  if (!validObjectId(request.params.id)) return response.status(400).json({ message: 'Identificador inválido.' });
  await Order.findByIdAndDelete(request.params.id); return response.json({ ok: true });
});

// El administrador actualiza el estado que aparece en el seguimiento privado del cliente.
app.patch('/api/admin/orders/:id/status', requireAdmin, async (request, response) => {
  if (!validObjectId(request.params.id)) return response.status(400).json({ message: 'Identificador de pedido inválido.' });
  const status = text(request.body.status, 30);
  if (!['received', 'preparing', 'waiting_courier', 'sent'].includes(status))
    return response.status(400).json({ message: 'Elige uno de los estados disponibles para el pedido.' });
  const order = await Order.findByIdAndUpdate(request.params.id, { status, statusUpdatedAt: new Date() }, { new: true, runValidators: true }).select('status statusUpdatedAt');
  return order ? response.json({ status: order.status, statusUpdatedAt: order.statusUpdatedAt })
    : response.status(404).json({ message: 'No encontramos ese pedido.' });
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
for (const file of ['index.html', 'menu.html', 'promociones.html', 'sobre-nosotros.html', 'redes.html', 'registro.html',
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

# Jossy’s Berry PTY

Sitio estático en HTML, CSS y JavaScript para abrir y editar en Visual Studio Code. No utiliza un servidor propio ni llama a una IA externa.

## Abrir en Visual Studio Code

1. Abre la carpeta `Fresas-con-crema-Joss` en Visual Studio Code.
2. En el explorador del proyecto, abre `index.html` en la raíz del proyecto.
3. Pulsa **Go Live** en la barra inferior de VS Code para previsualizar el sitio. La carpeta ya tiene configurado el puerto 5501 para Live Server.
4. El panel separado está en `http://127.0.0.1:5501/admin.html`.

No hay un servidor Node independiente ni se instala nada con npm. La vista previa de VS Code mantiene todas las páginas bajo la misma dirección para que compartan el almacenamiento local.

## Páginas

- `index.html`: bienvenida y página principal; está en la raíz para que GitHub Pages la encuentre.
- `menu.html`: productos y enlaces para elegir un sabor.
- `sobre-nosotros.html`: descripción del emprendimiento y galería.
- `redes.html`: Instagram y WhatsApp.
- `registro.html`: formulario de cliente fiel.
- `iniciar-sesion.html`: inicio de sesión con correo y contraseña de demostración.
- `pedido.html`: pedido con dirección escrita o ubicación GPS.
- `reportar.html`: formulario para avisar de una falla o error.
- `admin.html`: página administrativa separada, no enlazada en la navegación pública.
- Las páginas públicas tienen un botón flotante **Acceso admin** en la esquina inferior izquierda.
- `assets/favicon.png`: versión pequeña del logo usada como icono de pestaña.
- `css/estilos.css`: diseño, colores, adaptación móvil y animaciones.
- `js/site.js`: encabezado, pie y diseño compartido entre páginas; también muestra el nombre del usuario conectado y permite cerrar sesión.
- `js/public-app.js`: pedidos, cuentas, consentimiento de promociones, reportes y respuestas del chatbot.
- `js/google-config.js`: espacio para configurar el ID público de Google Sign-In.
- `js/admin.js`: bandeja de pedidos, chats, fallas, clientes y campañas promocionales.

## Publicar en GitHub Pages

El sitio ya tiene `index.html` y todas sus páginas, estilos, scripts e imágenes en la raíz del repositorio. El flujo de GitHub Actions de `.github/workflows/static.yml` publica esa raíz automáticamente al subir cambios a la rama `main`. Después de confirmar y subir los archivos a GitHub, revisa la pestaña **Actions** para ver la publicación y configura **Settings → Pages** para usar **GitHub Actions** como origen.

Si Pages todavía muestra 404, confirma que los cambios estén subidos a la rama `main` y que la ejecución **Deploy static content to Pages** haya terminado correctamente.

La bandeja de administración muestra estos reportes y permite marcarlos como atendidos. El chat ya no se vuelve a dibujar mientras escribes una respuesta; al enviarla, se guarda en la conversación local.

## Chatbot y respuestas humanas

El chatbot responde con reglas y respuestas preparadas, usando el tono de Jossy’s Berry PTY. Conoce la descripción de la marca, los sabores y los teléfonos. No inventa precios, horarios, zonas de entrega ni ingredientes no confirmados. Si no reconoce una consulta o le piden una persona, la guarda en la bandeja de administración; el administrador puede contestar desde la página de chat.

## Cuentas y promociones por correo

El encabezado tiene **Iniciar sesión**. Las cuentas incluyen nombre, correo, teléfono y contraseña de demostración; el encabezado muestra el nombre después de iniciar sesión. La casilla para recibir promociones es opcional y no viene marcada. En Admin se puede redactar una campaña, preparar un borrador en el programa de correo con las direcciones de clientes suscritos en copia oculta y exportar una lista CSV de quienes aceptaron recibir ofertas. La persona administradora debe revisar y enviar el correo manualmente.

Como no hay servidor, las cuentas y los correos solo están en el navegador donde se registraron. El inicio de sesión no protege una cuenta real y el borrador por correo depende de que el equipo tenga una aplicación de correo configurada. Para cuentas compartidas y envíos automáticos haría falta un servicio seguro de cuentas y correo.

El registro normal está en `registro.html` y el enlace **Registrarse** aparece en el menú. También se agregó el botón de Google en registro e inicio de sesión. Para mostrarlo, crea un ID de cliente de tipo aplicación web en Google Cloud Console, autoriza el dominio de GitHub Pages y coloca el ID en `js/google-config.js`. El acceso de Google de esta versión guarda el perfil en el navegador; para autenticar cuentas reales de manera segura y compartirlas entre dispositivos hace falta un servidor que verifique los tokens. La casilla de promociones sigue desmarcada por defecto, incluso con Google.

Instagram: [Fresamania (@fresa_mania01)](https://www.instagram.com/fresa_mania01?dmpr=ZWQxOHFnbTQ0Z3Rw).

## Alcance de esta versión

Pedidos, registros, cuentas, preferencias de promociones, conversaciones, campañas y reportes se guardan en el almacenamiento local del navegador para la demostración. Conviene abrir todas las páginas bajo la misma vista previa de Visual Studio Code para que compartan ese almacenamiento. Si se abre cada HTML directamente como archivo, el navegador puede no compartir datos entre ellos.

El acceso `ADMINPTY507` es únicamente una barrera visual de demostración: la clave está en JavaScript y se puede ver. No protege datos reales ni sirve para atender pedidos de clientes por Internet. GitHub puede alojar esta versión estática, pero pedidos compartidos entre clientes, una bandeja central segura y cuentas protegidas requieren un backend y almacenamiento seguro, que esta versión no incluye.

Si el cliente comparte GPS, las coordenadas se utilizan para mostrar un mapa de OpenStreetMap. La ubicación solo se solicita después de pulsar el botón y aceptar el permiso del navegador.

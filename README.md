# Jossy’s Berry PTY

Sitio web de demostración para el emprendimiento de fresas con crema.

## Abrir la página

Abre `Fresasconcrema.html` en un navegador. La función de ubicación puede requerir que el sitio se abra mediante HTTPS o un servidor local y que la persona autorice el permiso de ubicación.

## Archivos

- `Fresasconcrema.html`: contenido y secciones del sitio.
- `css/estilos.css`: estilos, diseño adaptable y animaciones.
- `js/app.js`: bienvenida, menú móvil, pedidos de muestra, panel y asistente virtual.
- `Imagenes de la pagina/`: logo, fotos y GIF usados en la página.

## Alcance de esta primera versión

Esta versión funciona como prototipo de presentación. Los pedidos y registros se guardan en el almacenamiento local del navegador que los creó, por lo que no se sincronizan entre dispositivos. La clave `ADMINPTY507` está escrita en JavaScript y se puede ver desde el navegador; el panel no protege información real. La ubicación solo se solicita después de pulsar el botón y aceptar el permiso. El asistente responde preguntas frecuentes con reglas sencillas; no se conecta a una inteligencia artificial externa.

Para aceptar pedidos reales y proteger nombres, teléfonos, direcciones y credenciales se necesita un servidor con autenticación y una base de datos segura.

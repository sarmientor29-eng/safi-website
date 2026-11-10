# SAFI - Evidencias de obra con persistencia local

Fecha: 10 de noviembre de 2026. Rama: dev/safi-audit-finance-core.
Base: 965b503a154f47ac242ca6e83f0707c52d7fc2c9.

## Cambio implementado

El servidor de demostracion admite almacenamiento SQLite optativo en una carpeta dedicada fuera del repositorio. En este modo conserva los originales de las fotografias, su asociacion con avances/gastos, los comprobantes de recepcion y las decisiones de revision. El modo anterior en memoria sigue disponible.

Las fotografias se pueden consultar desde el panel local: miniatura desplegable y apertura del original. El servidor comprueba longitud y SHA-256 antes de entregar una imagen. Los archivos de base de datos no se sirven por HTTP. Las escrituras se confirman despues del commit de una transaccion; no se reemplazan respuestas ya recibidas ni decisiones anteriores.

Se limita a conexiones del propio equipo, comprueba Host y origen, restringe las rutas, impone limites de almacenamiento y no elimina datos anteriores al alcanzar la cuota. La carpeta y el archivo usan permisos restrictivos POSIX. Estos controles NO equivalen a autenticacion por trabajador, cifrado ni autorizacion de produccion.

## Resultados ejecutados

- Baseline local: 21 pruebas Node aprobadas, 0 fallos.
- Version actual: 32 pruebas Node aprobadas, 0 fallos, 0 omitidas. Incluye las 21 existentes y 11 nuevas.
- Interfaz de trabajador: 12 comprobaciones aprobadas.
- Interfaz de evidencias/revision: 13 comprobaciones aprobadas.
- Sintaxis: 12 comprobaciones aprobadas.

Las 11 pruebas nuevas cubren recuperacion de fotos/comprobantes/revision tras reinicio, recuperacion despues de terminar abruptamente un proceso ya confirmado, reintento tras perder la confirmacion, ocho envios simultaneos identicos, vinculacion a avances y gastos, cuota de fotos, rollback transaccional, rutas privadas y origen, imagen no asociada, bytes alterados y rechazo de una base de datos ajena.

Pruebas ejecutadas con Node.js 22.16.0 y SQLite 3.49.1. El modulo node:sqlite muestra una advertencia experimental en ese runtime. No hay paquetes de terceros para ejecutar el servidor.

## Alcance real

Las pruebas Node utilizan HTTP real en 127.0.0.1, una base SQLite temporal real y PNG sinteticos. La recuperacion se verifico tambien terminando un proceso con SIGKILL despues de confirmar un registro. No se simulo una perdida fisica de energia del disco ni se certifican garantias de hardware.

Las 25 comprobaciones de interfaz ejecutan JavaScript en Chromium con respuestas HTTP y almacenamiento cliente simulados. Las fotos visibles en las capturas son dibujos sinteticos de recibos, no datos de clientes. Se comprobaron anchuras de 320, 390, 768 y 1280 pixeles CSS sin desbordamiento horizontal. No son pruebas en iPhone o Android ni una certificacion de IndexedDB, camara o sincronizacion real entre dispositivos.

## Reproducir

```sh
node --test audit/field-demo-server.test.mjs audit/field-correction-client.test.mjs audit/field-evidence-store.test.mjs
python audit/qa/worker-corrections-ui.py
python audit/qa/evidence-review-ui.py
```

Las pruebas UI requieren Playwright, Chromium y Pillow instalados. La ilustracion sintetica utiliza una fuente del sistema; no se incluyen fuentes en el paquete. Los scripts generan capturas y archivos JSON de resultados.

Para probar persistencia local, con Node.js 22.16 o compatible:

```sh
node audit/start-field-evidence-demo.mjs
```

El lanzador crea datos SOLO en la carpeta local `.safi-local-demo/evidence` del directorio personal, o en SAFI_DEMO_DATA_DIR si esta variable esta configurada. No utilizar carpetas de informacion real. Para conservar el modo en memoria, ejecutar `node audit/field-demo-server.mjs` sin esa variable.

## Limites pendientes

No hay login, permisos por trabajador, TLS, cifrado en reposo, backups, sincronizacion multi-dispositivo, OCR ni analisis completo de imagenes. La deteccion de formato sigue basada en cabeceras; no es un escaneo antimalware. La solicitud de correccion es fija y ficticia y no admite varias rondas completas. El historial almacenado no es una bitacora independiente resistente a un usuario local con acceso a los archivos.

El visor muestra avances/gastos recibidos por la API, pero no conecta automaticamente los otros prototipos independientes. No se modificaron Firebase, main, el sitio publicado ni datos reales. No se activaron servicios facturables. No se debe exponer este servidor a una red ni usarlo con trabajadores reales.

Los resultados de esta bateria focalizada no certifican toda la plataforma SAFI. El workflow existente puede ejecutar todas las pruebas del repositorio; su resultado debe confirmarse por commit, no inferirse de esta ejecucion local.

## Reversion

Revertir este cambio solo en la rama de desarrollo. Conservar y respaldar los datos locales antes de cualquier limpieza. No borrar la carpeta de evidencias ni restablecer main como parte de una reversion de codigo.

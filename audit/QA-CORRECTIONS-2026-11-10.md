# SAFI - Correcciones moviles verificadas

Fecha: 2026-11-10.
Rama: dev/safi-audit-finance-core.
Base inspeccionada: d9cf50b4278de64b586d423defc7e009b7f9ad13.

## Resultado ejecutado, no solo pruebas escritas

- Node.js 22.16.0: 21 pruebas aprobadas, 0 fallos, 0 omitidas. Incluye las 8 pruebas HTTP existentes y 13 pruebas nuevas del cliente, reintentos y servidor.
- Chromium 144 / Playwright 1.57: 12 comprobaciones de interfaz aprobadas, incluidas 4 anchuras de 320, 390, 768 y 1280 pixeles CSS.
- Sintaxis de los scripts de las tres pantallas del paquete local: 3 comprobaciones aprobadas.
- Los archivos originales reconstituidos localmente se cotejaron mediante su SHA de blob Git antes de modificarlos. Los blobs nuevos de codigo enviados a GitHub coinciden con los archivos probados.

## Cambios

1. El guardado local espera a la finalizacion de la transaccion IndexedDB. Un aborto posterior al exito de una solicitud ya no produce un falso mensaje de guardado.
2. La respuesta conserva tanto la fotografia local como su identificador temporal al guardar el comprobante del servidor.
3. Los reintentos conservan la misma identidad de respuesta y fotografia. Una confirmacion perdida no crea una segunda respuesta.
4. Los controles se bloquean durante una operacion y despues de una recepcion confirmada; la respuesta intentada no se puede sobrescribir accidentalmente. Se usan Web Locks entre pestanas cuando estan disponibles; la alternativa solo serializa la pestana actual.
5. Se exige estado received y comprobante no vacio, no solamente una respuesta HTTP exitosa.
6. Se recupera una vez un identificador de fotografia expirado en el servidor de demostracion, manteniendo la identidad de la respuesta.
7. La pantalla permite consultar la decision del supervisor. Si el servidor local perdio el registro, lo informa sin reenviar automaticamente.
8. El servidor conserva correctamente caracteres UTF-8 divididos entre paquetes y restringe los archivos servidos a propiedades propias de su lista permitida.
9. Se conserva el diseno aprobado y se evita desbordamiento horizontal en las anchuras comprobadas.

## Alcance exacto de las pruebas

Las pruebas Node abren un servidor HTTP real en 127.0.0.1 y usan datos ficticios. El almacenamiento cliente se inyecta en memoria; dos pruebas modelan eventos de transaccion. No certifican IndexedDB real de Safari o Android.

Las pruebas de interfaz ejecutan los scripts de la pantalla en Chromium con almacenamiento y respuestas HTTP simulados. La navegacion de Chromium hacia localhost fue bloqueada por la politica del entorno (ERR_BLOCKED_BY_ADMINISTRATOR); no se modifico ni eludio esa politica. Se comprobó la interfaz sin navegacion de red, y el HTTP por separado desde Node. Esto NO es una prueba completa en un telefono real.

## Reproduccion

Desde la raiz del repositorio:

```sh
node --test audit/field-demo-server.test.mjs audit/field-correction-client.test.mjs
```

Para las comprobaciones de interfaz, con Playwright y Chromium ya instalados:

```sh
python audit/qa/worker-corrections-ui.py
```

El workflow existente descubre automaticamente los nuevos archivos .test.mjs. Su resultado debe consultarse por commit; este informe documenta los resultados locales.

## Limites que siguen pendientes

- Solo demostracion local sin autenticacion. No exponer el servidor a internet o a una red de trabajadores.
- Los registros del servidor siguen en memoria y se pierden al reiniciarlo.
- El servidor sigue descartando los archivos originales de las fotos; los tokens y la comprobacion de cabeceras no equivalen a almacenamiento privado ni a analisis completo de imagenes.
- No hay sincronizacion automatica ni notificaciones reales.
- La solicitud es fija y ficticia. La revision de multiples proyectos y las rondas adicionales de correccion siguen pendientes de integracion.
- Falta validar IndexedDB real, almacenamiento insuficiente real, recarga, camara, iPhone/Safari y Android. Las pruebas aprobadas no certifican el resto de SAFI ni su seguridad para produccion.
- No se modifico main, Firebase, el sitio publicado, credenciales ni datos reales. No se activaron servicios facturables.

## Reversion

Revertir este cambio en la rama de desarrollo o restaurar estos archivos desde el commit base. No restablecer main ni sobrescribir trabajo ajeno.

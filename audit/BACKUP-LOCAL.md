# SAFI - Respaldos cifrados del entorno local

Solo para el modulo de evidencias y correcciones. No es un respaldo de todo SAFI, Firebase, el correo o los borradores que siguen solamente en el navegador. No se activa ningun servicio ni envio automatico.

## Crear una copia

Desde la carpeta del proyecto, con Node.js 22.16 o compatible:

```sh
node audit/field-backup-cli.mjs create
```

El comando usa las evidencias de `~/.safi-local-demo/evidence`, creadas por `start-field-evidence-demo.mjs`. Guarda un archivo nuevo `.safibak` en `~/.safi-local-demo/backups` y lo verifica antes de anunciar el resultado.

La terminal pide una frase de acceso dos veces, sin mostrarla. Utilizar una frase larga, unica y dificil de adivinar; no hay clave predeterminada. No compartirla en el chat, GitHub, capturas o scripts. Perderla significa perder la posibilidad de descifrar ese respaldo. La herramienta no administra ni recupera contrasenas.

Con rutas explicitas:

```sh
node audit/field-backup-cli.mjs create "/ruta/evidencias" "/ruta/respaldos"
```

Las carpetas explicitas deben existir, estar fuera del repositorio y tener permisos privados. En macOS/Linux se exige 0700 para directorios y 0600 para archivos de datos. La herramienta no cambia los permisos de carpetas existentes ni acepta enlaces simbolicos. El limite de esta version es 128 MiB por base de datos.

## Comprobar la copia sin restaurar

```sh
node audit/field-backup-cli.mjs verify "/ruta/respaldos/archivo.safibak"
```

Comprueba la autenticidad del archivo cifrado, la integridad de SQLite, el formato SAFI, los originales de las fotos y sus asociaciones. Muestra solo cantidades, no el contenido de registros.

## Recuperar sin sobrescribir originales

```sh
node audit/field-backup-cli.mjs restore "/ruta/respaldos/archivo.safibak" "$HOME/.safi-local-demo/evidence-restored"
```

`evidence-restored` debe ser una carpeta NUEVA; su directorio padre debe existir y ser privado. Si ya existe, el comando se detiene incluso si esta vacia. No restaura encima de la base de datos activa, no borra registros, no inicia el servidor ni cambia su configuracion.

Para comprobar posteriormente esa copia, detener el servidor local de prueba y, desde la carpeta del proyecto, usar explicitamente:

```sh
SAFI_DEMO_DATA_DIR="$HOME/.safi-local-demo/evidence-restored" node audit/field-demo-server.mjs
```

Abrir el panel de prueba en el mismo equipo y comprobar registros y fotos antes de elegir que copia conservar. Esta instruccion no publica el sitio y no permite acceso desde otro telefono por Wi-Fi.

## Que contiene

La copia incluye todos los registros de la base local en el momento del snapshot: fotos originales, avances/gastos recibidos, cada version de respuesta de correccion, comprobantes y revisiones guardadas. Incluye tambien fotos subidas que aun no se vincularon a un registro. No modifica la fuente ni mezcla un respaldo con datos mas nuevos. No es una migracion de esquema.

El snapshot se realiza con la API de backup de SQLite, no copiando un archivo abierto a ciegas. Despues se valida y cifra con AES-256-GCM, derivando la clave con scrypt (N=131072, r=8, p=1), sal aleatoria de 32 bytes e IV aleatorio de 12 bytes. Version del formato: SAFIBK01. La frase y la clave no se guardan en el archivo. Se valida la etiqueta de autenticacion antes de escribir una base descifrada.

## Limites importantes

- Solo el archivo de respaldo esta cifrado. La base activa y la copia restaurada NO estan cifradas por esta herramienta.
- Un respaldo en el mismo disco no protege frente a robo o perdida del disco. No se configuro almacenamiento externo ni copia remota; trasladar copias verificadas a un medio separado sera una decision posterior autorizada.
- Durante la creacion/verificacion se usa un snapshot temporal sin cifrar dentro de una carpeta 0700. Se elimina al terminar normalmente o fallar, pero no se garantiza borrado seguro en SSD ni limpieza tras SIGKILL, corte electrico o fallo del sistema. Un administrador local puede acceder a archivos/memoria. No es proteccion contra un equipo comprometido.
- El respaldo puede contener registros personales. Nunca incorporarlo al repositorio ni al ZIP de codigo. Las pruebas entregadas usan exclusivamente datos ficticios; los respaldos de prueba no se incluyen.
- Las fotos se verifican por su huella y vinculo, no mediante antivirus ni decodificacion completa. La autenticacion criptografica no demuestra veracidad contable o legal.
- La fase local sigue sin autenticacion de trabajadores, permisos de produccion, cifrado de la base activa ni certificacion iPhone/Android. La restauracion se probo en Linux; no en macOS/Windows fisicos.
- Una ejecucion interrumpida puede dejar una carpeta `.safi-backup-tmp-*` o `.safi-restore-tmp-*`. No hay limpieza automatica de otras carpetas. Revisar manualmente antes de retirar un temporal; nunca borrar evidencias originales por analogia con su nombre.

## Pruebas reproducibles

```sh
node --test audit/*.test.mjs
python audit/qa/backup-cli.py
```

El segundo comando usa una pseudoterminal POSIX y datos ficticios. No instala paquetes. Ver QA-BACKUP-2026-11-10.md para el alcance de esta ejecucion.

## Referencias tecnicas

Node 22.16 SQLite backup: https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html#sqlitebackupsourceDb-destination-options
Node 22.16 Crypto: https://nodejs.org/download/release/v22.16.0/docs/api/crypto.html

/** Local administration only; password is read from the terminal, never argv. */
import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {mkdirSync, lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createEvidenceBackup,verifyEvidenceBackup,restoreEvidenceBackup,inspectEvidenceDatabase} from './field-evidence-backup.mjs';
const HELP=`SAFI - Respaldos locales de prueba (Node.js 22.16 o compatible)

  node audit/field-backup-cli.mjs create [carpeta-evidencias] [carpeta-respaldos]
  node audit/field-backup-cli.mjs verify archivo.safibak
  node audit/field-backup-cli.mjs restore archivo.safibak carpeta-NUEVA

Sin rutas, create usa ~/.safi-local-demo/evidence y ~/.safi-local-demo/backups.
Con rutas explicitas, las carpetas deben existir y tener permisos privados.
La restauracion exige una carpeta nueva cuyo directorio padre ya exista.
La frase de acceso se pide sin mostrarla. No existe clave predeterminada.
Nunca pase una clave por argumentos, mensajes, GitHub o archivos del proyecto.

Solo pruebas locales. No cifra la base de datos activa ni transmite archivos.
Una copia en el mismo disco no protege contra perder ese disco.
Perder la frase de acceso impide recuperar el respaldo.
`;
export function readHidden(prompt) {
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Ejecute en una terminal interactiva; la clave no se lee por argumentos ni tuberias.');
  return new Promise((resolve,reject)=>{
    const silent=new Writable({write(_chunk,_encoding,done){done();}});
    const rl=createInterface({input:process.stdin,output:silent,terminal:true});
    let done=false;
    process.stdout.write(prompt);
    rl.once('SIGINT',()=>{if(done)return;done=true;rl.close();process.stdout.write('\n');reject(new Error('Operacion cancelada.'));});
    rl.once('close',()=>{if(!done){done=true;reject(new Error('Terminal cerrada antes de recibir la clave.'));}});
    rl.question('',answer=>{if(done)return;done=true;rl.close();process.stdout.write('\n');resolve(answer);});
  });
}
export async function main(args=process.argv.slice(2)) {
  if(!args.length||args[0]==='--help'){console.log(HELP);return;}
  const [command,...values]=args;
  if(!['create','verify','restore'].includes(command)||values.some(x=>x.startsWith('--'))||
      (command==='create'&&values.length>2)||(command==='verify'&&values.length!==1)||(command==='restore'&&values.length!==2))throw new Error('Comando invalido. Use --help.');
  const passphrase=await readHidden(command==='create'?'Nueva frase de acceso (minimo 16 caracteres; no visible): ':'Frase de acceso (no visible): ');
  if(command==='create'&&passphrase!==await readHidden('Repita la frase de acceso: '))throw new Error('Las frases no coinciden. No se creo ningun respaldo.');
  let result;
  if(command==='create'){
    const sourceDir=values[0]||join(homedir(),'.safi-local-demo','evidence');
    const backupDir=values[1]||join(homedir(),'.safi-local-demo','backups');
    // Only the fixed default backup directory is created automatically, after
    // source validation. Explicit paths are checked without changing permissions.
    if(!values[1]){
      inspectEvidenceDatabase(join(sourceDir,'field-demo.sqlite'));
      try{lstatSync(backupDir);}catch(error){if(error.code!=='ENOENT')throw error;mkdirSync(backupDir,{mode:0o700});}
    }
    console.log('Creando y comprobando una copia cifrada...');
    result=await createEvidenceBackup({sourceDir,backupDir,passphrase});
    await verifyEvidenceBackup({backupFile:result.backupFile,passphrase});
    console.log('Respaldo cifrado y verificado: '+result.backupFile);
  }else if(command==='verify'){
    result=await verifyEvidenceBackup({backupFile:values[0],passphrase});
    console.log('Respaldo verificado; no se restauro ni cambio la base de datos.');
  }else{
    result=await restoreEvidenceBackup({backupFile:values[0],destinationDir:values[1],passphrase});
    console.log('Copia restaurada en: '+result.restoredDir+'\nEl servidor no se inicio ni se cambio su configuracion.');
  }
  const i=result.inventory;
  console.log('Contenido: '+i.photos+' fotos, '+i.records+' avances/gastos, '+i.correctionResponses+' respuestas, '+i.reviews+' revisiones.');
  console.log('No se modificaron Firebase, GitHub, produccion ni los originales.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error('SAFI: '+error.message);process.exitCode=1;});
}

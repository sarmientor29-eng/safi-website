/** Encrypted LOCAL-DEMO backups. Not a production vault or a network endpoint.
 * Sources: Node 22.16 node:sqlite backup and node:crypto AES-GCM/scrypt docs.
 * Restore never overwrites a destination; no source file is deleted or migrated.
 */
import {DatabaseSync, backup as sqliteBackup} from 'node:sqlite';
import {randomBytes, randomUUID, createHash, createCipheriv, createDecipheriv, scrypt} from 'node:crypto';
import {promisify} from 'node:util';
import {openSync, closeSync, readFileSync, writeFileSync, lstatSync, fstatSync, realpathSync,
  mkdirSync, mkdtempSync, rmSync, rmdirSync, linkSync, unlinkSync, fsyncSync, constants} from 'node:fs';
import {dirname, resolve, relative, isAbsolute, join, parse, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const APP_ID = 0x53414649;
const MAGIC = Buffer.from('SAFIBK01');
const HEADER_BYTES = 8 + 32 + 12;
const TAG_BYTES = 16;
export const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
const derive = promisify(scrypt);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (parent, child) => { const rel=relative(parent,child);return rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)); };
const bad = message => { throw new Error(message); };
const maybeStat = path => { try { return lstatSync(path); } catch (e) { if(e.code==='ENOENT')return null;throw e; } };

/** Reject symlink components, even if a dangling final symlink exists. Local
 * same-user filesystem replacement attacks are outside this prototype's scope.
 */
function externalPath(path) {
  if (typeof path!=='string'||!path.trim()) bad('An explicit local path is required.');
  const full=resolve(path);
  if(within(REPO,full)) bad('Backup data must remain outside the code repository.');
  const parts=relative(parse(full).root,full).split(sep); let current=parse(full).root;
  for(const part of parts){current=join(current,part);const stat=maybeStat(current);if(stat?.isSymbolicLink())bad('Symbolic links are not allowed in backup paths.');}
  return full;
}
function privateDirectory(path) {
  const full=externalPath(path), stat=lstatSync(full);
  if(!stat.isDirectory())bad('A dedicated private directory is required.');
  if(process.platform!=='win32'&&((stat.mode&0o077)||stat.uid!==process.getuid()))bad('Directory must belong to this user and have mode 0700.');
  return realpathSync(full);
}
function privateFile(path, maxSize=MAX_BACKUP_BYTES+HEADER_BYTES+TAG_BYTES) {
  const full=externalPath(path); privateDirectory(dirname(full));
  const stat=lstatSync(full);
  if(!stat.isFile()||stat.nlink!==1||stat.size<1||stat.size>maxSize)bad('Invalid or oversized backup/database file.');
  if(process.platform!=='win32'&&((stat.mode&0o077)||stat.uid!==process.getuid()))bad('File must belong to this user and have mode 0600.');
  return full;
}
function readBounded(path,maxSize) {
  const file=privateFile(path,maxSize), fd=openSync(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {const st=fstatSync(fd);if(!st.isFile()||st.size>maxSize)bad('File changed or exceeds the size limit.');return readFileSync(fd);}
  finally{closeSync(fd);}
}
function syncFile(path){const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));try{fsyncSync(fd);}finally{closeSync(fd);}}
function syncDirectory(path){if(process.platform==='win32')return;const fd=openSync(path,constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
function secretBytes(value){
  if(typeof value!=='string'&&!Buffer.isBuffer(value))bad('A passphrase is required.');
  const bytes=Buffer.from(value);
  if(bytes.length<16||bytes.length>1024){bytes.fill(0);bad('Use a strong passphrase of 16 to 1024 UTF-8 bytes.');}
  return bytes;
}
async function keyFor(secret,salt){return derive(secret,salt,32,{N:131072,r:8,p:1,maxmem:256*1024*1024});}
function openReadOnly(file){const db=new DatabaseSync(file,{readOnly:true,allowExtension:false});db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=3000;');return db;}

/** Validate the format and every stored photo/reference, not merely the archive
 * checksum. Image digests are not a malware scan or a claim of legal validity.
 */
export function inspectEvidenceDatabase(filename) {
  const file=privateFile(filename,MAX_BACKUP_BYTES), db=openReadOnly(file);
  try {
    if(db.prepare('PRAGMA application_id').get().application_id!==APP_ID||db.prepare('PRAGMA user_version').get().user_version!==1)bad('Unrecognized SAFI database. No migration performed.');
    const check=db.prepare('PRAGMA integrity_check').all();
    if(check.length!==1||Object.values(check[0])[0]!=='ok')bad('Database integrity check failed.');
    const schema=db.prepare("SELECT type,name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if(JSON.stringify(schema.map(x=>[x.type,x.name]))!==JSON.stringify([['table','entries'],['table','photos']]))bad('Unexpected database schema.');
    for(const [table,expected] of [['entries',['bucket','key','payload']],['photos',['token','bytes']]]){
      const actual=db.prepare('PRAGMA table_info('+table+')').all().map(x=>x.name);
      if(JSON.stringify(actual)!==JSON.stringify(expected))bad('Unexpected database columns.');
    }
    const count=db.prepare('SELECT COUNT(*) AS n FROM entries').get().n;
    const usage=db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(length(bytes)),0) AS bytes FROM photos').get();
    if(count>2000||usage.n>100||usage.bytes>MAX_BACKUP_BYTES)bad('Database exceeds local demo limits.');
    const groups={records:new Map(),photoTokens:new Map(),correctionReplies:new Map()};
    for(const row of db.prepare('SELECT bucket,key,payload FROM entries').all()){
      if(!Object.hasOwn(groups,row.bucket)||row.payload.length>100000)bad('Invalid record bucket or payload.');
      let value;try{value=JSON.parse(row.payload);}catch{bad('Invalid record JSON.');}
      if(!value||typeof value!=='object'||Array.isArray(value))bad('Invalid record payload.');
      groups[row.bucket].set(row.key,value);
    }
    const photos=new Set();
    for(const row of db.prepare('SELECT token,bytes FROM photos').iterate()){
      const meta=groups.photoTokens.get(row.token),bytes=Buffer.from(row.bytes);
      if(!meta||!['image/png','image/jpeg','image/webp'].includes(meta.type)||!Number.isSafeInteger(meta.size)||meta.size<1||meta.size>5*1024*1024||meta.size!==bytes.length||hash(bytes)!==meta.digest)bad('Photo integrity check failed.');
      photos.add(row.token);
    }
    if(photos.size!==groups.photoTokens.size)bad('Missing original photo bytes.');
    const used=new Set(),receipts=new Set();
    let reviews=0;
    for(const [bucket,records] of Object.entries(groups)){
      if(bucket==='photoTokens')continue;
      for(const [key,record] of records){
        if(typeof record.receiptId!=='string'||!record.receiptId||receipts.has(record.receiptId))bad('Invalid or duplicate receipt.');
        receipts.add(record.receiptId);
        if(record.review)reviews++;
        const tokens=bucket==='records'?record.photoTokens:(record.photoToken?[record.photoToken]:[]);
        if(!Array.isArray(tokens)||new Set(tokens).size!==tokens.length)bad('Invalid photo association.');
        if(bucket==='records'&&(!Array.isArray(record.photos)||!Array.isArray(record.photoDigests)||tokens.length!==record.photos.length||tokens.length!==record.photoDigests.length))bad('Invalid field photo references.');
        if(bucket==='correctionReplies'&&record.photoCount!==tokens.length)bad('Invalid correction photo references.');
        for(const [i,token] of tokens.entries()){
          const meta=groups.photoTokens.get(token);
          if(!photos.has(token)||used.has(token)||!meta?.boundKey)bad('Missing or reused evidence association.');
          const expected=bucket==='records'?[key]:['correction:'+record.requestId+':round:'+(record.round??1),...((record.round??1)===1?['correction:'+record.requestId]:[])];
          if(!expected.includes(meta.boundKey))bad('Photo is bound to a different record.');
          if(bucket==='records'&&(record.photoDigests[i]!==meta.digest||record.photos[i]?.type!==meta.type||record.photos[i]?.size!==meta.size))bad('Photo metadata does not match its record.');
          used.add(token);
        }
      }
    }
    for(const [token,meta] of groups.photoTokens)if(meta.boundKey&&!used.has(token))bad('Photo binding refers to a missing record.');
    return {schemaVersion:1,records:groups.records.size,correctionResponses:groups.correctionReplies.size,
      reviews,photos:photos.size,photoBytes:usage.bytes,unattachedPhotos:photos.size-used.size};
  } finally {db.close();}
}

/** Creates a consistent SQLite snapshot, validates it, encrypts it, then publishes
 * the complete archive without overwriting anything. Temporary plaintext is in
 * a 0700 directory and removed on normal completion/failure, not secure-erased.
 */
export async function createEvidenceBackup({sourceDir,backupDir,passphrase}) {
  const secret=secretBytes(passphrase);let temp=null,db=null,plain=null,key=null;
  try {
    const source=join(privateDirectory(sourceDir),'field-demo.sqlite'); privateFile(source,MAX_BACKUP_BYTES);
    const destination=privateDirectory(backupDir);
    if(destination===privateDirectory(sourceDir))bad('Keep backups in a separate directory.');
    temp=mkdtempSync(join(destination,'.safi-backup-tmp-'));
    const snapshot=join(temp,'snapshot.sqlite');writeFileSync(snapshot,Buffer.alloc(0),{flag:'wx',mode:0o600});
    db=openReadOnly(source);
    const start=Date.now();
    await sqliteBackup(db,snapshot,{rate:100,progress:({totalPages})=>{
      if(totalPages*4096>MAX_BACKUP_BYTES*16||Date.now()-start>30000)bad('Snapshot exceeded its safe execution limit. Retry with the demo server stopped.');
    }});
    db.close();db=null;
    const inventory=inspectEvidenceDatabase(snapshot);
    plain=readBounded(snapshot,MAX_BACKUP_BYTES);
    const salt=randomBytes(32),iv=randomBytes(12),header=Buffer.concat([MAGIC,salt,iv]);
    key=await keyFor(secret,salt);
    const cipher=createCipheriv('aes-256-gcm',key,iv,{authTagLength:TAG_BYTES});cipher.setAAD(header);
    const encrypted=Buffer.concat([header,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
    const staging=join(temp,'archive.safibak');writeFileSync(staging,encrypted,{flag:'wx',mode:0o600});syncFile(staging);
    const backupFile=join(destination,'safi-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.safibak');
    linkSync(staging,backupFile);unlinkSync(staging);syncDirectory(destination);
    return {backupFile,bytes:encrypted.length,sha256:hash(encrypted),inventory,encrypted:true};
  } finally {secret.fill(0);key?.fill(0);plain?.fill(0);if(db)db.close();if(temp)rmSync(temp,{recursive:true,force:true});}
}

async function openBackup({backupFile,passphrase,workDir},callback){
  const secret=secretBytes(passphrase);let temp=null,key=null,plain=null;
  try{
    const data=readBounded(backupFile,MAX_BACKUP_BYTES+HEADER_BYTES+TAG_BYTES);
    if(data.length<HEADER_BYTES+TAG_BYTES+100||!data.subarray(0,8).equals(MAGIC))bad('Unsupported or truncated SAFI backup.');
    const header=data.subarray(0,HEADER_BYTES),salt=header.subarray(8,40),iv=header.subarray(40,52);
    key=await keyFor(secret,salt);
    const decipher=createDecipheriv('aes-256-gcm',key,iv,{authTagLength:TAG_BYTES});
    decipher.setAAD(header);decipher.setAuthTag(data.subarray(-TAG_BYTES));
    let pending;
    try{pending=decipher.update(data.subarray(HEADER_BYTES,-TAG_BYTES));plain=Buffer.concat([pending,decipher.final()]);}
    catch{bad('Backup authentication failed: wrong passphrase or damaged file.');}
    finally{pending?.fill(0);}
    // Write no decrypted bytes until the GCM tag has been authenticated.
    temp=mkdtempSync(join(privateDirectory(workDir),'.safi-restore-tmp-'));
    const snapshot=join(temp,'field-demo.sqlite');writeFileSync(snapshot,plain,{flag:'wx',mode:0o600});syncFile(snapshot);
    const inventory=inspectEvidenceDatabase(snapshot);
    return await callback({snapshot,inventory});
  }finally{secret.fill(0);key?.fill(0);plain?.fill(0);if(temp)rmSync(temp,{recursive:true,force:true});}
}
export async function verifyEvidenceBackup({backupFile,passphrase}){
  return openBackup({backupFile,passphrase,workDir:dirname(resolve(backupFile))},async({inventory})=>({valid:true,inventory}));
}
export async function restoreEvidenceBackup({backupFile,destinationDir,passphrase}){
  const destination=externalPath(destinationDir),parent=privateDirectory(dirname(destination));
  if(maybeStat(destination))bad('Restore destination already exists. Originals will never be overwritten.');
  return openBackup({backupFile,passphrase,workDir:parent},async({snapshot,inventory})=>{
    // mkdir is exclusive; it also catches a destination created during decryption.
    mkdirSync(destination,{mode:0o700});let linked=false;
    try{
      const restoredFile=join(destination,'field-demo.sqlite');
      linkSync(snapshot,restoredFile);linked=true;unlinkSync(snapshot);
      syncDirectory(destination);syncDirectory(parent);
      return {restoredDir:destination,inventory,serverStarted:false,sourceUnchanged:true};
    }catch(error){
      if(linked)try{unlinkSync(join(destination,'field-demo.sqlite'));}catch{}
      try{rmdirSync(destination);}catch{}
      throw error;
    }
  });
}

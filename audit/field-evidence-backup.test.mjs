import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,readdirSync,existsSync,chmodSync,symlinkSync,lstatSync,truncateSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createDemoServer} from './field-demo-server.mjs';
import {openEvidenceStore} from './field-evidence-store.mjs';
import {createEvidenceBackup,verifyEvidenceBackup,restoreEvidenceBackup,inspectEvidenceDatabase,MAX_BACKUP_BYTES} from './field-evidence-backup.mjs';
const password='SYNTHETIC TEST ONLY blue timber river 2026';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLBsAAAAASUVORK5CYII=','base64');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function running(storageDir){
  const server=createDemoServer({storageDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  return {base,server,get:p=>fetch(base+p),post:(p,value)=>fetch(base+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)}),
    upload:()=>fetch(base+'/api/demo-photo',{method:'POST',body:png}),stop:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function fixture(fn){const root=mkdtempSync(join(tmpdir(),'safi-backup-test-'));const sourceDir=join(root,'source'),backupDir=join(root,'backups');mkdirSync(sourceDir,{mode:0o700});mkdirSync(backupDir,{mode:0o700});
  const initial=openEvidenceStore({storageDir:sourceDir});initial.close();
  try{await fn({root,sourceDir,backupDir,destinationDir:join(root,'restored'),passphrase:password});}finally{rmSync(root,{recursive:true,force:true});}}
async function seed(s){
  const p1=await(await s.upload()).json();const first=await s.post('/api/demo-correction-replies',{requestId:'demo-correction-001',responseId:'demo-backup-first-001',notes:'Synthetic backup room A',photoToken:p1.photoToken});assert.equal(first.status,201);
  const receipt1=(await first.json()).receiptId;
  assert.equal((await s.post('/api/demo-correction-review',{requestId:'demo-correction-001',receiptId:receipt1,decision:'needs-more-information',note:'Synthetic second photo needed'})).status,201);
  const p2=await(await s.upload()).json();const second=await s.post('/api/demo-correction-replies',{requestId:'demo-correction-001',responseId:'demo-backup-second-002',round:2,parentReceiptId:receipt1,notes:'Synthetic backup room B',photoToken:p2.photoToken});assert.equal(second.status,201);
  const receipt2=(await second.json()).receiptId;
  assert.equal((await s.post('/api/demo-correction-review',{requestId:'demo-correction-001',receiptId:receipt2,decision:'accepted',note:'Synthetic review complete'})).status,201);
  const p3=await(await s.upload()).json();
  assert.equal((await s.post('/api/submissions',{id:'backup-expense-001',workerId:'demo-worker',projectId:'demo-project',kind:'expense',notes:'Synthetic parking',amountCents:1250,photos:[{type:'image/png',size:png.length}],photoTokens:[p3.photoToken]})).status,201);
  // A valid but not yet submitted image must also survive backup.
  assert.equal((await s.upload()).status,200);
}

test('live SQLite snapshot restores photo bytes, every response version, receipts and reviews',()=>fixture(async f=>{
 const s=await running(f.sourceDir);let copy;
 try{
  await seed(s);
  const beforeReplies=await(await s.get('/api/demo-correction-replies')).json(),beforeRecords=await(await s.get('/api/submissions')).json();
  const original=readFileSync(join(f.sourceDir,'field-demo.sqlite'));
  copy=await createEvidenceBackup(f);
  assert.deepEqual(copy.inventory,{schemaVersion:1,records:1,correctionResponses:2,reviews:2,photos:4,photoBytes:png.length*4,unattachedPhotos:1});
  assert.deepEqual(readFileSync(join(f.sourceDir,'field-demo.sqlite')),original);
  const verified=await verifyEvidenceBackup({backupFile:copy.backupFile,passphrase:password});assert.deepEqual(verified.inventory,copy.inventory);
  const result=await restoreEvidenceBackup({...f,backupFile:copy.backupFile});assert.equal(result.serverStarted,false);
  const restored=await running(f.destinationDir);
  try{
   assert.deepEqual(await(await restored.get('/api/demo-correction-replies')).json(),beforeReplies);
   assert.deepEqual(await(await restored.get('/api/submissions')).json(),beforeRecords);
   for(const row of [...beforeReplies.replies,...beforeRecords.items])for(const url of row.evidenceUrls){const r=await restored.get(url);assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);}
   assert.equal((await(await restored.get('/api/demo-corrections')).json()).requests[0].state,'accepted');
  }finally{await restored.stop();}
  assert.deepEqual(readFileSync(join(f.sourceDir,'field-demo.sqlite')),original);
 }finally{await s.stop();}
}));

test('archives hide database and notes, randomize each encryption and use private permissions',()=>fixture(async f=>{
 const s=await running(f.sourceDir);try{await seed(s);}finally{await s.stop();}
 const one=await createEvidenceBackup(f),two=await createEvidenceBackup(f);
 assert.notEqual(one.backupFile,two.backupFile);assert.notEqual(one.sha256,two.sha256);
 const b=readFileSync(one.backupFile);assert.equal(b.subarray(0,8).toString(),'SAFIBK01');
 assert.equal(b.includes(Buffer.from('SQLite format 3')),false);assert.equal(b.includes(Buffer.from('Synthetic backup room A')),false);assert.equal(b.includes(png),false);
 if(process.platform!=='win32')assert.equal(lstatSync(one.backupFile).mode&0o077,0);
 assert.equal(lstatSync(one.backupFile).nlink,1);
 assert.equal(readdirSync(f.backupDir).some(x=>x.startsWith('.safi-')),false);
}));

test('wrong passphrase neither creates restore directory nor changes originals or archive',()=>fixture(async f=>{
 const one=await createEvidenceBackup(f),archive=readFileSync(one.backupFile),original=readFileSync(join(f.sourceDir,'field-demo.sqlite'));
 await assert.rejects(restoreEvidenceBackup({...f,backupFile:one.backupFile,passphrase:'WRONG SYNTHETIC PASSWORD VALUE'}),/authentication failed/);
 assert.equal(existsSync(f.destinationDir),false);assert.deepEqual(readFileSync(one.backupFile),archive);assert.deepEqual(readFileSync(join(f.sourceDir,'field-demo.sqlite')),original);
 assert.equal(readdirSync(f.root).some(x=>x.startsWith('.safi-restore')),false);
}));

test('altered salt, IV, ciphertext or authentication tag is refused before any restoration',()=>fixture(async f=>{
 const one=await createEvidenceBackup(f),original=readFileSync(one.backupFile);
 for(const index of [8,40,70,original.length-1]){
  const bytes=Buffer.from(original);bytes[index]^=1;const path=join(f.backupDir,'damaged-'+index+'.safibak');writeFileSync(path,bytes,{mode:0o600});
  await assert.rejects(restoreEvidenceBackup({...f,backupFile:path}),/authentication failed/);assert.equal(existsSync(f.destinationDir),false);
 }
}));

test('truncated, oversized and unknown format backups are refused',()=>fixture(async f=>{
 const one=await createEvidenceBackup(f),bytes=readFileSync(one.backupFile),path=join(f.backupDir,'broken.safibak');
 for(const value of [bytes.subarray(0,30),bytes.subarray(0,bytes.length-10),Buffer.from('unrecognized format')]){
  writeFileSync(path,value,{mode:0o600});await assert.rejects(verifyEvidenceBackup({backupFile:path,passphrase:password}));
 }
 truncateSync(path,MAX_BACKUP_BYTES+1024);await assert.rejects(verifyEvidenceBackup({backupFile:path,passphrase:password}),/oversized/);
}));

test('restore refuses an existing directory, even empty; existing data is never overwritten',()=>fixture(async f=>{
 const one=await createEvidenceBackup(f);mkdirSync(f.destinationDir,{mode:0o700});
 await assert.rejects(restoreEvidenceBackup({...f,backupFile:one.backupFile}),/already exists/);
 const marker=join(f.destinationDir,'keep.txt');writeFileSync(marker,'original');
 await assert.rejects(restoreEvidenceBackup({...f,backupFile:one.backupFile}),/already exists/);assert.equal(readFileSync(marker,'utf8'),'original');
 await assert.rejects(restoreEvidenceBackup({...f,backupFile:one.backupFile,destinationDir:f.sourceDir}),/already exists/);
}));

test('backup verifies every photo digest and refuses damaged stored evidence',()=>fixture(async f=>{
 const s=await running(f.sourceDir);try{await seed(s);}finally{await s.stop();}
 const db=new DatabaseSync(join(f.sourceDir,'field-demo.sqlite'));db.exec("UPDATE photos SET bytes=X'0011' WHERE token=(SELECT token FROM photos LIMIT 1)");db.close();
 const original=readFileSync(join(f.sourceDir,'field-demo.sqlite'));
 await assert.rejects(createEvidenceBackup(f),/Photo integrity/);assert.deepEqual(readFileSync(join(f.sourceDir,'field-demo.sqlite')),original);
 assert.deepEqual(readdirSync(f.backupDir),[]);
}));

test('missing photo bytes or a missing association fail verification rather than create incomplete backups',()=>fixture(async f=>{
 const s=await running(f.sourceDir);try{await seed(s);}finally{await s.stop();}
 const db=new DatabaseSync(join(f.sourceDir,'field-demo.sqlite'));db.exec('DELETE FROM photos WHERE token=(SELECT token FROM photos LIMIT 1)');db.close();
 await assert.rejects(createEvidenceBackup(f),/Missing original/);assert.deepEqual(readdirSync(f.backupDir),[]);
}));

test('a foreign database and an unexpected schema are rejected without migrations',()=>fixture(async f=>{
 let db=new DatabaseSync(join(f.sourceDir,'field-demo.sqlite'));db.exec('PRAGMA application_id=1');db.close();const original=readFileSync(join(f.sourceDir,'field-demo.sqlite'));
 await assert.rejects(createEvidenceBackup(f),/Unrecognized/);assert.deepEqual(readFileSync(join(f.sourceDir,'field-demo.sqlite')),original);
 db=new DatabaseSync(join(f.sourceDir,'field-demo.sqlite'));db.exec('PRAGMA application_id=1396786761; CREATE TABLE extra(x TEXT)');db.close();
 await assert.rejects(createEvidenceBackup(f),/Unexpected database schema/);
}));

test('repo paths and symlink paths cannot become evidence or backup destinations',()=>fixture(async f=>{
 const repo=resolve(dirname(new URL(import.meta.url).pathname),'..');
 await assert.rejects(createEvidenceBackup({...f,backupDir:repo}),/outside/);
 await assert.rejects(createEvidenceBackup({...f,backupDir:join(repo,'..hidden-backups')}),/outside/);
 await assert.rejects(restoreEvidenceBackup({...f,backupFile:'unused',destinationDir:join(repo,'forbidden-backup')}),/outside/);
 const link=join(f.root,'link');symlinkSync(f.backupDir,link,'dir');await assert.rejects(createEvidenceBackup({...f,backupDir:link}),/Symbolic links/);
 const dangling=join(f.root,'dangling');symlinkSync(join(f.root,'not-here'),dangling,'dir');
 await assert.rejects(restoreEvidenceBackup({...f,backupFile:'unused',destinationDir:dangling}),/Symbolic links/);
}));

test('insecure directory and file permissions are refused, not silently changed',{skip:process.platform==='win32'},()=>fixture(async f=>{
 chmodSync(f.backupDir,0o755);await assert.rejects(createEvidenceBackup(f),/0700/);assert.equal(lstatSync(f.backupDir).mode&0o777,0o755);chmodSync(f.backupDir,0o700);
 const file=join(f.sourceDir,'field-demo.sqlite');chmodSync(file,0o644);await assert.rejects(createEvidenceBackup(f),/0600/);assert.equal(lstatSync(file).mode&0o777,0o644);
}));

test('private restored copy is independent and originals are unchanged when it receives new records',()=>fixture(async f=>{
 const one=await createEvidenceBackup(f);await restoreEvidenceBackup({...f,backupFile:one.backupFile});
 const original=readFileSync(join(f.sourceDir,'field-demo.sqlite'));
 if(process.platform!=='win32'){assert.equal(lstatSync(f.destinationDir).mode&0o077,0);assert.equal(lstatSync(join(f.destinationDir,'field-demo.sqlite')).mode&0o077,0);}
 const s=await running(f.destinationDir);try{await seed(s);}finally{await s.stop();}
 assert.deepEqual(readFileSync(join(f.sourceDir,'field-demo.sqlite')),original);
 assert.equal(inspectEvidenceDatabase(join(f.destinationDir,'field-demo.sqlite')).photos,4);assert.equal(inspectEvidenceDatabase(join(f.sourceDir,'field-demo.sqlite')).photos,0);
}));

test('two backup operations produce independent complete archives with no overwrite',()=>fixture(async f=>{
 const copies=await Promise.all([createEvidenceBackup(f),createEvidenceBackup(f)]);assert.notEqual(copies[0].backupFile,copies[1].backupFile);
 for(const copy of copies)assert.equal((await verifyEvidenceBackup({backupFile:copy.backupFile,passphrase:password})).valid,true);
 assert.equal(readdirSync(f.backupDir).length,2);
}));

test('passphrase constraints and absent source fail before changing source data',()=>fixture(async f=>{
 for(const passphrase of ['',null,'short','x'.repeat(1025)])await assert.rejects(createEvidenceBackup({...f,passphrase}));
 const missing=join(f.root,'missing');await assert.rejects(createEvidenceBackup({...f,sourceDir:missing}));assert.equal(existsSync(missing),false);assert.deepEqual(readdirSync(f.backupDir),[]);
}));

test('backup files and CLI are not exposed through the demo HTTP server',()=>fixture(async f=>{
 const copy=await createEvidenceBackup(f);const s=await running(f.sourceDir);try{
 for(const p of ['/field-evidence-backup.mjs','/field-backup-cli.mjs','/'+copy.backupFile.split('/').at(-1),'/field-demo.sqlite'])assert.equal((await s.get(p)).status,404);
 }finally{await s.stop();}
}));

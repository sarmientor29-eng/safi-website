import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, stat, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createDemoServer} from './field-demo-server.mjs';
import {openEvidenceStore} from './field-evidence-store.mjs';
import {sendSavedCorrection} from './field-correction-client.mjs';
const root=dirname(fileURLToPath(import.meta.url));
// Valid synthetic 2x2 PNG only; never real company data.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGMUCUhhYGBgYmBgYGBgAAAJOgDMzB9kygAAAABJRU5ErkJggg==','base64');
const digest=x=>createHash('sha256').update(x).digest('hex');
async function running(options={}) {
  const server=createDemoServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  return {base, server, get:p=>fetch(base+p), post:(p,data)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
    upload:data=>fetch(base+'/api/demo-photo',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:data}),
    stop:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function isolated(fn) {const dir=await mkdtemp(join(tmpdir(),'safi-evidence-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
const reply=(token=null)=>({requestId:'demo-correction-001',responseId:'demo-evidence-000001',notes:'Synthetic room test',photoToken:token});

test('photo, correction receipt and review survive restart with identical bytes',()=>isolated(async storageDir=>{
  let s=await running({storageDir});let receipt;
  try {
    const photo=await(await s.upload(png)).json();assert.equal(photo.stored,true);
    const res=await s.post('/api/demo-correction-replies',reply(photo.photoToken));assert.equal(res.status,201);receipt=(await res.json()).receiptId;
    assert.equal((await s.post('/api/demo-correction-review',{requestId:reply().requestId,decision:'accepted',note:'Checked synthetic photo'})).status,201);
    await s.stop();s=await running({storageDir});
    const replies=(await(await s.get('/api/demo-correction-replies')).json()).replies;
    assert.equal(replies.length,1);assert.equal(replies[0].receiptId,receipt);assert.equal(replies[0].review.decision,'accepted');
    assert.equal('photoToken' in replies[0],false);const url=replies[0].evidenceUrls[0];assert.ok(url);
    const evidence=await s.get(url);assert.equal(evidence.status,200);assert.equal(evidence.headers.get('content-type'),'image/png');
    assert.equal(digest(Buffer.from(await evidence.arrayBuffer())),digest(png));
    const retry=await s.post('/api/demo-correction-replies',reply(photo.photoToken));assert.equal(retry.status,200);assert.equal((await retry.json()).receiptId,receipt);
    assert.equal((await(await s.get('/api/demo-corrections')).json()).requests[0].state,'accepted');
  } finally {await s.stop();}
}));

test('evidence survives a killed process, not only an orderly shutdown',()=>isolated(async storageDir=>{
  const child=spawn(process.execPath,['--input-type=module','-e',`import {createDemoServer} from ${JSON.stringify(new URL('./field-demo-server.mjs',import.meta.url).href)};const s=createDemoServer({storageDir:process.env.DATA});s.listen(0,'127.0.0.1',()=>console.log(s.address().port));`],{env:{...process.env,DATA:storageDir},stdio:['ignore','pipe','pipe']});
  let text='';const base=await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\n'))resolve('http://127.0.0.1:'+text.trim());});child.once('error',reject);child.once('exit',code=>{if(!text)reject(Error('Child did not start '+code));});});
  let receipt;
  try {
    const p=await(await fetch(base+'/api/demo-photo',{method:'POST',body:png})).json();
    const r=await fetch(base+'/api/demo-correction-replies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reply(p.photoToken))});
    assert.equal(r.status,201);receipt=(await r.json()).receiptId;
  } finally {const done=once(child,'exit');child.kill('SIGKILL');await done;}
  const s=await running({storageDir});try{const row=(await(await s.get('/api/demo-correction-replies')).json()).replies[0];assert.equal(row.receiptId,receipt);assert.equal(Buffer.from(await(await s.get(row.evidenceUrls[0])).arrayBuffer()).compare(png),0);}finally{await s.stop();}
}));

test('lost acknowledgement after restart retries same response without a second photo',()=>isolated(async storageDir=>{
  let s=await running({storageDir}),saved={id:reply().requestId,responseId:reply().responseId,notes:'Restart test',photo:new Blob([png],{type:'image/png'}),receiptId:null};
  const local={readDraft:async()=>structuredClone(saved),writeDraft:async r=>{saved=structuredClone(r);}};
  try{
    await assert.rejects(sendSavedCorrection({...local,fetchImpl:async(p,o)=>{const res=await fetch(s.base+p,o);if(p==='/api/demo-correction-replies'){await res.json();throw Error('Lost acknowledgement');}return res;}}),/Lost/);
    const token=saved.photoToken;assert.ok(token);await s.stop();s=await running({storageDir});
    let uploads=0;const result=await sendSavedCorrection({...local,fetchImpl:(p,o)=>{if(p==='/api/demo-photo')uploads++;return fetch(s.base+p,o);}});
    assert.ok(result.receiptId);assert.equal(saved.photoToken,token);assert.equal(uploads,0);
    assert.equal((await(await s.get('/api/demo-correction-replies')).json()).replies.length,1);
  }finally{await s.stop();}
}));

test('concurrent identical submissions return one receipt and one evidence link',()=>isolated(async storageDir=>{
  const s=await running({storageDir});try{
    const photo=await(await s.upload(png)).json();
    const results=await Promise.all(Array.from({length:8},()=>s.post('/api/demo-correction-replies',reply(photo.photoToken))));
    assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===200).length,7);
    const ids=await Promise.all(results.map(async r=>(await r.json()).receiptId));assert.equal(new Set(ids).size,1);
    assert.equal((await(await s.get('/api/demo-storage')).json()).photos,1);
  }finally{await s.stop();}
}));

test('field expense and progress keep evidence bound to their received records',()=>isolated(async storageDir=>{
  const s=await running({storageDir});try{
    for(const kind of ['expense','progress']){
      const p=await(await s.upload(png)).json();
      const value={id:'submission-'+kind+'-001',workerId:'demo-worker',projectId:'demo-project',kind,notes:'Synthetic '+kind,amountCents:1250,photos:[{type:'image/png',size:png.length}],photoTokens:[p.photoToken]};
      assert.equal((await s.post('/api/submissions',value)).status,201);
      assert.equal((await s.post('/api/submissions',{...value,id:value.id+'other'})).status,409);
    }
    const list=(await(await s.get('/api/submissions')).json()).items;assert.equal(list.length,2);
    for(const row of list){assert.equal('photoTokens' in row,false);assert.equal('photoDigests' in row,false);assert.equal((await s.get(row.evidenceUrls[0])).status,200);}
  }finally{await s.stop();}
}));

test('storage quota rejects an extra photo without deleting existing data',()=>isolated(async storageDir=>{
  const s=await running({storageDir,maxPhotoBytes:png.length,maxPhotos:1});try{
    assert.equal((await s.upload(png)).status,200);assert.equal((await s.upload(png)).status,507);
    const usage=await(await s.get('/api/demo-storage')).json();assert.equal(usage.photos,1);assert.equal(usage.bytes,png.length);
  }finally{await s.stop();}
}));

test('transaction rollback leaves no orphaned photo or half-confirmed submission',()=>isolated(async storageDir=>{
  const store=openEvidenceStore({storageDir});try{
    assert.throws(()=>store.transaction(()=>{store.addPhoto('token',png);store.photoTokens.set('token',{size:png.length});store.correctionReplies.set('request',{receiptId:'must-not-commit'});throw Error('Simulated interruption');}));
    assert.equal(store.usage().photos,0);assert.equal(store.photoTokens.has('token'),false);assert.equal(store.correctionReplies.has('request'),false);
  }finally{store.close();}
}));

test('data files are outside the served tree, private on POSIX and unavailable over HTTP',()=>isolated(async storageDir=>{
  assert.throws(()=>createDemoServer({storageDir:resolve(root,'local-data')}),/outside/);
  const s=await running({storageDir});try{
    if(process.platform!=='win32'){assert.equal((await stat(storageDir)).mode&0o077,0);assert.equal((await stat(join(storageDir,'field-demo.sqlite'))).mode&0o077,0);}
    for(const p of ['/field-demo.sqlite','/field-evidence-store.mjs','/constructor','/../field-demo.sqlite'])assert.equal((await s.get(p)).status,404);
    assert.equal((await fetch(s.base+'/api/demo-storage',{headers:{Origin:'https://untrusted.example'}})).status,403);
    const badHost=await new Promise((resolve,reject)=>{const req=httpRequest(s.base+'/api/demo-storage',{headers:{Host:'untrusted.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});assert.equal(badHost,403);
  }finally{await s.stop();}
}));

test('unattached or unknown photo cannot be fetched by a token URL',()=>isolated(async storageDir=>{
  const s=await running({storageDir});try{
    const p=await(await s.upload(png)).json();assert.equal((await s.get('/api/demo-evidence/'+p.photoToken+'/0')).status,404);
    assert.equal((await s.get('/api/demo-evidence/00000000-0000-0000-0000-000000000000/0')).status,404);
  }finally{await s.stop();}
}));

test('modified stored image bytes are rejected on retrieval',()=>isolated(async storageDir=>{
  const s=await running({storageDir});try{
    const p=await(await s.upload(png)).json();await s.post('/api/demo-correction-replies',reply(p.photoToken));
    const row=(await(await s.get('/api/demo-correction-replies')).json()).replies[0];
    const db=new DatabaseSync(join(storageDir,'field-demo.sqlite'));db.prepare('UPDATE photos SET bytes=? WHERE token=?').run(Buffer.from('tampered'),p.photoToken);db.close();
    const res=await s.get(row.evidenceUrls[0]);assert.equal(res.status,500);assert.match((await res.json()).error,/integrity/);
  }finally{await s.stop();}
}));

test('an unrelated database is refused without repurposing it',()=>isolated(async storageDir=>{
  const file=join(storageDir,'field-demo.sqlite');const db=new DatabaseSync(file);db.exec('CREATE TABLE unrelated(value TEXT)');db.close();await chmod(file,0o600);
  assert.throws(()=>createDemoServer({storageDir}),/Unrecognized/);
}));

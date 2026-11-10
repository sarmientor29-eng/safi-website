import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createDemoServer} from './field-demo-server.mjs';
const ID='demo-correction-001';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLBsAAAAASUVORK5CYII=','base64');
async function start(storageDir) {
 const server=createDemoServer({storageDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const call=async(path,data)=>{const res=await fetch(base+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:res.status,body:await res.json()};};
 const post=data=>call('/api/demo-correction-replies',data);
 const review=(receiptId,decision='needs-more-information',note='Please add a wider view')=>call('/api/demo-correction-review',{requestId:ID,receiptId,decision,note});
 return {base,call,post,review,stop:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};
}
const payload=(round=1,parentReceiptId=null,extra={})=>({requestId:ID,responseId:'demo-round-response-'+round,notes:'Test clarification '+round,round,parentReceiptId,...extra});
async function setup(fn,disk=false) {const dir=disk?mkdtempSync(join(tmpdir(),'safi-rounds-')):undefined;const s=await start(dir);try{await fn(s,dir);}finally{await s.stop();if(dir)rmSync(dir,{recursive:true,force:true});}}

test('more-information decision opens round two; original reply and review remain unchanged',()=>setup(async s=>{
 const first=await s.post(payload());assert.equal(first.status,201);const receipt=first.body.receiptId;
 await s.review(receipt);const request=(await s.call('/api/demo-corrections')).body.requests[0];
 assert.equal(request.nextRound,2);assert.equal(request.latestReceiptId,receipt);assert.equal(request.reason,'Please add a wider view');
 const original=structuredClone((await s.call('/api/demo-correction-replies')).body.replies[0]);
 const second=await s.post(payload(2,receipt));assert.equal(second.status,201);
 const all=(await s.call('/api/demo-correction-replies')).body.replies;
 assert.equal(all.length,2);assert.deepEqual(all[0],original);assert.equal(all[1].parentReceiptId,receipt);assert.equal(all[1].round,2);
 const accepted=await s.review(second.body.receiptId,'accepted','All clear');assert.equal(accepted.status,201);
 const closed=(await s.call('/api/demo-corrections')).body.requests[0];assert.equal(closed.state,'accepted');assert.equal(closed.nextRound,null);
}));

test('new round requires prior more-information review and exact parent receipt',()=>setup(async s=>{
 const first=(await s.post(payload())).body;
 assert.equal((await s.post(payload(2,first.receiptId))).status,409);
 await s.review(first.receiptId);
 assert.equal((await s.post(payload(2,'wrong-receipt'))).status,409);
 assert.equal((await s.post(payload(3,first.receiptId))).status,409);
 assert.equal((await s.post(payload(2,null))).status,409);
 assert.equal((await s.post(payload(2,first.receiptId))).status,201);
}));

test('lost acknowledgement and late retry reuse each round receipt without duplicating versions',()=>setup(async s=>{
 const a=await s.post(payload());await s.review(a.body.receiptId);
 const second=payload(2,a.body.receiptId),b=await s.post(second);
 assert.equal((await s.post(second)).body.receiptId,b.body.receiptId);
 assert.equal((await s.post(payload())).body.receiptId,a.body.receiptId);
 assert.equal((await s.post({...second,notes:'Changed sent content'})).status,409);
 assert.equal((await s.post({...second,responseId:'demo-another-response'})).status,409);
 assert.equal((await s.call('/api/demo-correction-replies')).body.replies.length,2);
}));

test('concurrent identical replies for next round produce a single committed version',()=>setup(async s=>{
 const a=await s.post(payload());await s.review(a.body.receiptId);const body=payload(2,a.body.receiptId);
 const results=await Promise.all(Array.from({length:8},()=>s.post(body)));
 assert.equal(results.filter(x=>x.status===201).length,1);assert.equal(results.filter(x=>x.status===200).length,7);
 assert.equal(new Set(results.map(x=>x.body.receiptId)).size,1);
}));

test('review targets a specific version and cannot overwrite an earlier decision',()=>setup(async s=>{
 const a=await s.post(payload());await s.review(a.body.receiptId);
 const b=await s.post(payload(2,a.body.receiptId));
 assert.equal((await s.call('/api/demo-correction-review',{requestId:ID,decision:'accepted',note:''})).status,409);
 assert.equal((await s.review(a.body.receiptId,'accepted','Changed mind')).status,409);
 assert.equal((await s.review('unknown-receipt','accepted','')).status,404);
 assert.equal((await s.review(b.body.receiptId,'accepted','')).status,201);
 assert.equal((await s.post(payload(3,b.body.receiptId))).status,409);
}));

test('round validation rejects invalid version numbers without storing them',()=>setup(async s=>{
 for(const round of [0,-1,1.5,'2',null,101])assert.equal((await s.post(payload(round))).status,400,String(round));
 assert.equal((await s.post(payload(1,'unexpected-parent'))).status,400);
 assert.equal((await s.call('/api/demo-correction-replies')).body.replies.length,0);
}));

test('all versions and their original photos survive restart and remain retrievable',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'safi-rounds-disk-'));let s=await start(dir);
 try {
  const upload=async bytes=>(await(await fetch(s.base+'/api/demo-photo',{method:'POST',body:bytes})).json()).photoToken;
  const t1=await upload(png),a=await s.post(payload(1,null,{photoToken:t1}));await s.review(a.body.receiptId);
  const t2=await upload(png),b=await s.post(payload(2,a.body.receiptId,{photoToken:t2}));await s.review(b.body.receiptId,'accepted','Checked both versions');
  const before=(await s.call('/api/demo-correction-replies')).body.replies;
  await s.stop();s=await start(dir);
  const after=(await s.call('/api/demo-correction-replies')).body.replies;assert.deepEqual(after,before);
  for(const reply of after){assert.equal('photoToken' in reply,false);const bytes=await(await fetch(s.base+reply.evidenceUrls[0])).arrayBuffer();assert.deepEqual(Buffer.from(bytes),png);}
  assert.equal((await s.post(payload(2,a.body.receiptId,{photoToken:t2}))).body.receiptId,b.body.receiptId);
 }finally{await s.stop();rmSync(dir,{recursive:true,force:true});}
});

test('existing single-round database works without deleting or migrating prior replies',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'safi-rounds-legacy-'));let s=await start(dir);
 try{
  const first=await s.post(payload());await s.review(first.body.receiptId);await s.stop();
  const db=new DatabaseSync(join(dir,'field-demo.sqlite'));const row=db.prepare('SELECT payload FROM entries WHERE bucket=? AND key=?').get('correctionReplies',ID);const old=JSON.parse(row.payload);delete old.round;delete old.parentReceiptId;
  db.prepare('UPDATE entries SET payload=? WHERE bucket=? AND key=?').run(JSON.stringify(old),'correctionReplies',ID);db.close();
  s=await start(dir);assert.equal((await s.call('/api/demo-corrections')).body.requests[0].nextRound,2);
  assert.equal((await s.post(payload(2,first.body.receiptId))).status,201);
  const original=(await s.call('/api/demo-correction-replies')).body.replies.find(x=>x.round===1);assert.equal(original.notes,old.notes);assert.deepEqual(original.review,old.review);
 }finally{await s.stop();rmSync(dir,{recursive:true,force:true});}
});

import {prepareNextCorrection, sendSavedCorrection} from './field-correction-client.mjs';
const receivedDraft=()=>({id:ID,responseId:'demo-client-round-one',notes:'First version',round:1,photo:new Blob([png],{type:'image/png'}),photoToken:'existing-token',receiptId:'first-receipt',at:100});
const openRequest=()=>({id:ID,state:'needs-more-information',reason:'Show room C too',latestRound:1,nextRound:2,latestReceiptId:'first-receipt'});
test('next client draft keeps prior response untouched and starts with a fresh evidence selection',()=>{
 const old=receivedDraft(),next=prepareNextCorrection(old,openRequest(),'demo-client-round-two',200);
 assert.equal(next.round,2);assert.equal(next.parentReceiptId,old.receiptId);assert.equal(next.photo,null);assert.equal(next.receiptId,null);
 assert.equal(next.notes,'');assert.equal(next.supervisorReason,'Show room C too');assert.equal(old.notes,'First version');assert.equal(old.photo.size,png.length);assert.equal(old.receiptId,'first-receipt');
});
test('client cannot start another version against stale or accepted supervisor request',()=>{
 for(const changes of [{state:'accepted'},{nextRound:3},{latestReceiptId:'different'},{latestRound:0},{id:'other-request'}]){
  assert.throws(()=>prepareNextCorrection(receivedDraft(),{...openRequest(),...changes},'demo-client-round-two'));
 }
 assert.throws(()=>prepareNextCorrection(receivedDraft(),openRequest(),'demo-client-round-one'));
});
test('real client round-two retry after lost acknowledgement retains response and photo identity',()=>setup(async s=>{
 const a=await s.post(payload());await s.review(a.body.receiptId);
 const original={...receivedDraft(),responseId:payload().responseId,receiptId:a.body.receiptId};
 const req=(await s.call('/api/demo-corrections')).body.requests[0];
 let draft={...prepareNextCorrection(original,req,'demo-client-second-round'),notes:'Clearer room view',photo:new Blob([png],{type:'image/png'})};
 const storage={readDraft:async()=>structuredClone(draft),writeDraft:async d=>{draft=structuredClone(d);}};
 let lose=true,uploads=0;
 const network=async(url,options)=>{if(url==='/api/demo-photo')uploads++;const r=await fetch(s.base+url,options);if(url==='/api/demo-correction-replies'&&lose){lose=false;await r.json();throw Error('Lost acknowledgement');}return r;};
 await assert.rejects(sendSavedCorrection({...storage,fetchImpl:network}),/Lost acknowledgement/);
 const token=draft.photoToken;assert.equal(draft.round,2);assert.equal(draft.receiptId,null);
 const received=await sendSavedCorrection({...storage,fetchImpl:network});assert.equal(received.photoToken,token);assert.ok(received.receiptId);assert.equal(uploads,1);
 assert.equal((await s.call('/api/demo-correction-replies')).body.replies.length,2);
}));
test('second-round client rejects a receipt for a different version',async()=>{
 let draft={...prepareNextCorrection(receivedDraft(),openRequest(),'demo-client-round-two'),notes:'More details'};
 await assert.rejects(sendSavedCorrection({readDraft:async()=>draft,writeDraft:async x=>{draft=x;},fetchImpl:async()=>new Response(JSON.stringify({status:'received',receiptId:'wrong-round-receipt',round:1}))}),/Receipt not confirmed/);
 assert.equal(draft.receiptId,null);
});

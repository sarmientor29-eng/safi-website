import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {createDemoServer} from './field-demo-server.mjs';
import {sendSavedCorrection, transactionResult, requestJson} from './field-correction-client.mjs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLBsAAAAASUVORK5CYII=', 'base64');
const draft = () => ({id:'demo-correction-001',responseId:'demo-test-response-0001',notes:'Rooms A and B complete',photo:new Blob([png],{type:'image/png'}),receiptId:null,photoToken:null,at:100});
function storage(initial=draft()) {
  let saved=structuredClone(initial);
  return {readDraft:async()=>structuredClone(saved),writeDraft:async value=>{saved=structuredClone(value);},get:()=>structuredClone(saved)};
}
async function withServer(fn) {
  const server=createDemoServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try { await fn({base, fetchImpl:(url,options)=>fetch(base+url,options)}); }
  finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
}

test('correction photo token and receipt are committed together; repeated send does not call server',async()=>withServer(async({base,fetchImpl})=>{
  const store=storage();let uploads=0;
  const network=(url,options)=>{if(url==='/api/demo-photo')uploads++;return fetchImpl(url,options);};
  const result=await sendSavedCorrection({...store,fetchImpl:network});
  assert.ok(result.receiptId);assert.ok(store.get().photoToken);assert.equal(store.get().responseId,draft().responseId);
  assert.equal(store.get().photo.size,png.length);
  const again=await sendSavedCorrection({...store,fetchImpl:()=>{throw Error('Unexpected network call');}});
  assert.equal(again.receiptId,result.receiptId);assert.equal(uploads,1);
  assert.equal((await (await fetch(base+'/api/demo-correction-replies')).json()).replies.length,1);
}));

test('lost acknowledgement retries same ID and same photo without duplicate response',async()=>withServer(async({base,fetchImpl})=>{
  const store=storage();let lose=true,uploads=0;
  const network=async(url,options)=>{if(url==='/api/demo-photo')uploads++;const res=await fetchImpl(url,options);if(url==='/api/demo-correction-replies'&&lose){lose=false;await res.json();throw Error('Simulated lost acknowledgement');}return res;};
  await assert.rejects(sendSavedCorrection({...store,fetchImpl:network}),/lost acknowledgement/);
  const token=store.get().photoToken;assert.ok(token);assert.equal(store.get().receiptId,null);
  const result=await sendSavedCorrection({...store,fetchImpl:network});
  assert.ok(result.receiptId);assert.equal(result.photoToken,token);assert.equal(uploads,1);
  const replies=(await(await fetch(base+'/api/demo-correction-replies')).json()).replies;
  assert.equal(replies.length,1);assert.equal(replies[0].receiptId,result.receiptId);
}));

test('offline send keeps draft notes and original photograph for reconnection',async()=>withServer(async({fetchImpl})=>{
  const store=storage();
  await assert.rejects(sendSavedCorrection({...store,fetchImpl:async()=>{throw Error('Offline');}}),/Offline/);
  assert.equal(store.get().notes,draft().notes);assert.equal(store.get().photo.size,png.length);assert.ok(store.get().attemptedAt);
  assert.ok((await sendSavedCorrection({...store,fetchImpl})).receiptId);
}));

test('failure saving receipt locally is recoverable without a second photo upload',async()=>withServer(async({fetchImpl})=>{
  const store=storage();let fail=true,uploads=0;
  const network=(url,options)=>{if(url==='/api/demo-photo')uploads++;return fetchImpl(url,options);};
  const write=async record=>{if(record.receiptId&&fail){fail=false;throw Error('Simulated quota failure');}return store.writeDraft(record);};
  await assert.rejects(sendSavedCorrection({...store,writeDraft:write,fetchImpl:network}),/quota failure/);
  assert.ok(store.get().photoToken);assert.equal(store.get().receiptId,null);
  assert.ok((await sendSavedCorrection({...store,writeDraft:write,fetchImpl:network})).receiptId);
  assert.equal(uploads,1);
}));

test('malformed receipt does not mark a response as received',async()=>{
  const store=storage({...draft(),photo:null});
  await assert.rejects(sendSavedCorrection({...store,fetchImpl:async()=>new Response(JSON.stringify({status:'received'}))}),/Receipt not confirmed/);
  assert.equal(store.get().receiptId,null);
});

test('5 MB limit and MIME validation reject invalid photographs before networking',async()=>{
  for(const photo of [new Blob([Buffer.alloc(5*1024*1024+1)],{type:'image/png'}),new Blob(['text'],{type:'text/html'}),new Blob([],{type:'image/png'})]) {
    const store=storage({...draft(),photo});
    await assert.rejects(sendSavedCorrection({...store,fetchImpl:()=>{throw Error('Network must not run');}}),/Select a JPEG/);
    assert.equal(store.get().attemptedAt,undefined);
  }
});

test('expired upload token after a demo server restart is replaced once, preserving response identity',async()=>withServer(async({fetchImpl})=>{
  const store=storage({...draft(),photoToken:'expired-token',attemptedAt:1000});
  const result=await sendSavedCorrection({...store,fetchImpl});
  assert.ok(result.receiptId);assert.notEqual(result.photoToken,'expired-token');assert.equal(result.responseId,draft().responseId);assert.equal(result.attemptedAt,1000);
}));

test('conflicting response leaves the original server record unchanged',async()=>withServer(async({base,fetchImpl})=>{
  const first=storage({...draft(),photo:null});await sendSavedCorrection({...first,fetchImpl});
  const second=storage({...draft(),photo:null,responseId:'demo-other-response-0002',notes:'Different'});
  await assert.rejects(sendSavedCorrection({...second,fetchImpl}),/already answered/);
  assert.equal(second.get().receiptId,null);
  const replies=(await(await fetch(base+'/api/demo-correction-replies')).json()).replies;
  assert.equal(replies.length,1);assert.equal(replies[0].notes,draft().notes);
}));

test('local write is not successful until transaction completion',async()=>{
  const tx={},req={result:'saved'};let settled=false;
  const promise=transactionResult(tx,req).then(value=>{settled=true;return value;});
  req.onsuccess();await Promise.resolve();assert.equal(settled,false);
  tx.oncomplete();assert.equal(await promise,'saved');
});

test('abort after request success is surfaced rather than reporting a saved draft',async()=>{
  const tx={},req={result:'saved'};const promise=transactionResult(tx,req);
  req.onsuccess();tx.onabort();await assert.rejects(promise,/cancelled/);
});

test('network timeout preserves an unresolved send rather than hanging indefinitely',async()=>{
  const never=async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Timed out'))));
  await assert.rejects(requestJson(never,'/api/test',{},10),/Timed out/);
});

test('allowlist rejects inherited Object property paths rather than exposing internal data',async()=>withServer(async({base})=>{
  for(const path of ['/constructor','/toString','/__proto__','/field-demo-server.mjs']) assert.equal((await fetch(base+path)).status,404,path);
}));

test('UTF-8 correction notes remain unchanged across a multibyte network chunk split',async()=>withServer(async({base})=>{
  const notes='Correcci\u00f3n recibida';
  const bytes=Buffer.from(JSON.stringify({requestId:'demo-correction-001',responseId:'demo-utf8-00000001',notes}));
  const split=bytes.indexOf(Buffer.from('\u00f3'))+1;
  const response=await new Promise((resolve,reject)=>{
    const req=httpRequest(base+'/api/demo-correction-replies',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{
      let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,body:text}));
    });req.on('error',reject);req.write(bytes.subarray(0,split));setTimeout(()=>req.end(bytes.subarray(split)),15);
  });
  assert.equal(response.status,201);
  const replies=(await(await fetch(base+'/api/demo-correction-replies')).json()).replies;assert.equal(replies[0].notes,notes);
}));

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDemoServer} from './field-demo-server.mjs';

const routes=[
  '/','/staging-safi-unified.html','/staging-dashboard.html','/staging-documents.html',
  '/staging-expenses.html','/staging-finance.html','/staging-accounting.html','/staging-projects.html',
  '/staging-labor.html','/staging-flha.html','/staging-worker-mobile.html','/staging-field-transfer.html',
  '/staging-worker-corrections.html','/staging-correction-review-local.html',
  '/finance-core.mjs','/document-adapter.mjs','/accounting-core.mjs','/field-correction-core.mjs','/field-correction-client.mjs'
];

test('unified shell exposes all finished staging modules without Firebase', async()=>{
  const html=await readFile(new URL('./staging-safi-unified.html',import.meta.url),'utf8');
  for(const route of routes.filter(x=>x.endsWith('.html')&&x!=='/')) assert.ok(html.includes(route.slice(1)),route+' missing from unified shell');
  assert.equal(/firebase/i.test(html),true,'shell should explicitly explain Firebase is disconnected');
  assert.equal(/firebase-config\.js|initializeApp\s*\(/i.test(html),false,'shell must not initialize Firebase');
});

test('loopback demo serves unified shell and every embedded module', async()=>{
  const server=createDemoServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    for(const route of routes){
      const res=await fetch(base+route);
      assert.equal(res.status,200,route);
      const content=await res.arrayBuffer();
      assert.ok(content.byteLength>0,route+' empty');
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});

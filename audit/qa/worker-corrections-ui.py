"""DOM/CSS checks with mocked storage and HTTP. No browser network navigation.
Does not certify actual IndexedDB, Safari, camera access or real devices.
Requires Playwright and an installed Chromium, separate from runtime modules.
"""
from pathlib import Path
import json, os, re, shutil
from playwright.sync_api import sync_playwright, expect
BASE=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('SAFI_QA_OUTPUT',str(BASE/'qa'/'evidence')))
OUT.mkdir(parents=True,exist_ok=True)
html=(BASE/'staging-worker-corrections.html').read_text()
script=re.search(r'<script type="module">(.*?)</script>',html,re.S).group(1)
script=re.sub(r'^import .*?;\n','',script,flags=re.M)
core=(BASE/'field-correction-core.mjs').read_text().replace('export ','')
client=(BASE/'field-correction-client.mjs').read_text().replace('export ','')
markup=re.sub(r'<script.*?</script>','',html,flags=re.S)
fake=r'''
(() => {
 const memory=new Map();window.__demoMemory=memory;
 window.__abortWrite=false;window.__offline=false;window.__delay=0;
 window.__requests=[];
 let seq=0;
 if (!crypto.randomUUID) crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++seq).padStart(12,'0');
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(name,mode){
  const tx={error:null};
  tx.objectStore=()=>{
   const operation=(type,value)=>{
    const req={};setTimeout(()=>{
     req.result=type==='get'?structuredClone(memory.get(value)):value?.id;
     req.onsuccess?.();
     setTimeout(()=>{
      if(type!=='get'&&window.__abortWrite){tx.error=new Error('Simulated transaction abort');tx.onabort?.();return;}
      if(type==='put')memory.set(value.id,structuredClone(value));
      if(type==='delete')memory.delete(value);
      tx.oncomplete?.();
     },0);
    },0);return req;
   };return {get:key=>operation('get',key),put:value=>operation('put',value),delete:key=>operation('delete',key)};
  };return tx;
 }};
 Object.defineProperty(window,'indexedDB',{value:{open(){const req={};setTimeout(()=>{req.result=db;req.onsuccess?.();},0);return req;}}});
 window.fetch=async(url,options={})=>{
   window.__requests.push(url);
   if(window.__offline)throw Error('Simulated offline connection');
   if(window.__delay)await new Promise(resolve=>setTimeout(resolve,window.__delay));
   if(url==='/api/demo-photo')return new Response(JSON.stringify({photoToken:'photo-test-token',bytes:options.body.size,detectedType:options.body.type}));
   if(url==='/api/demo-correction-replies'&&options.method==='POST')return new Response(JSON.stringify({status:'received',receiptId:'receipt-test-0001'}));
   const saved=window.__demoMemory.get('demo-correction-001');
   return new Response(JSON.stringify({replies:[{requestId:saved.id,responseId:saved.responseId,receiptId:saved.receiptId,review:{decision:'accepted',note:'Reviewed in demo'}}]}));
 };
})();
'''
results=[]
def record(name,condition):
 results.append({'name':name,'passed':bool(condition)});assert condition,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844})
 page.set_content(markup)
 page.add_script_tag(content=fake)
 page.add_script_tag(content='(function(){\n'+core+'\n'+client+'\n'+script+'\n})();')
 expect(page.locator('#save')).to_be_enabled()
 expect(page.locator('#send')).to_be_disabled()
 record('initial send disabled until a committed draft exists',page.locator('#send').is_disabled())
 page.locator('#notes').fill('Demo: work completed in rooms A and B.')
 page.evaluate('window.__abortWrite=true')
 page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Unable to save:')
 record('transaction abort is shown as an error, not saved',page.evaluate('window.__demoMemory.size===0'))
 page.evaluate('window.__abortWrite=false')
 page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved on this device')
 record('successful save enables send',page.locator('#send').is_enabled())
 page.evaluate('window.__offline=true')
 page.locator('#send').click();expect(page.locator('#send-status')).to_contain_text('Not confirmed:')
 record('offline failure keeps the draft and offers retry',page.evaluate('window.__demoMemory.size===1') and page.locator('#send').is_enabled())
 record('attempted response cannot be edited accidentally',page.locator('#save').is_disabled() and page.locator('#notes').is_disabled())
 page.evaluate('window.__offline=false;window.__delay=150')
 page.locator('#send').click();expect(page.locator('#send-status')).to_contain_text('Sending')
 record('buttons lock while a request is running',page.locator('#delete').is_disabled() and page.locator('#send').is_disabled())
 expect(page.locator('#send-status')).to_contain_text('Received in server memory only')
 expect(page.locator('#send')).to_be_disabled();expect(page.locator('#save')).to_be_disabled()
 record('receipt keeps send and save disabled',page.locator('#send').is_disabled() and page.locator('#save').is_disabled())
 page.locator('#check-review').click();expect(page.locator('#send-status')).to_contain_text('accepted')
 record('worker can read the simulated supervisor decision','accepted' in page.locator('#send-status').inner_text())
 for width in [320,390,768,1280]:
  page.set_viewport_size({'width':width,'height':844})
  record(f'no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  if width in [390,1280]:page.screenshot(path=str(OUT/f'worker-corrections-{width}.png'),full_page=True)
 browser.close()
out={'scope':'Chromium DOM/CSS with in-memory storage and HTTP fixtures; no browser network navigation','passed':len(results),'failed':0,'checks':results}
(OUT/'browser-fixture-checks.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))

"""Multi-round UI checks using mocked HTTP and IndexedDB transaction events.
Not a real-phone, camera, IndexedDB implementation or network-navigation test.
"""
from pathlib import Path
import os, json, re, shutil
from playwright.sync_api import sync_playwright, expect
BASE=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('SAFI_QA_OUTPUT', str(BASE/'qa'/'evidence')))
OUT.mkdir(parents=True,exist_ok=True)
html=(BASE/'staging-worker-corrections.html').read_text()
script=re.search(r'<script type="module">(.*?)</script>',html,re.S).group(1)
script=re.sub(r'^import .*?;\n','',script,flags=re.M)
source='\n'.join((BASE/n).read_text().replace('export ','') for n in ['field-correction-core.mjs','field-correction-client.mjs'])
markup=re.sub(r'<script.*?</script>','',html,flags=re.S)
fixture=r'''
(()=>{
 const memory=new Map();window.__memory=memory;window.__replies=[];window.__abortWrite=false;
 let seq=0;
 if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++seq).padStart(12,'0');
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
  let pending=0,aborted=false,finished=false;const writes=[];
  const tx={error:null,abort(){if(finished||aborted)return;aborted=true;tx.error=new Error('Simulated abort');setTimeout(()=>tx.onabort?.(),0);}};
  const op=(type,value)=>{pending++;const req={};setTimeout(()=>{
   if(aborted)return;
   req.result=type==='get'?structuredClone(memory.get(value)):type==='getAll'?structuredClone([...memory.values()]):value?.id;
   if(type==='put')writes.push(()=>memory.set(value.id,structuredClone(value)));
   if(type==='delete')writes.push(()=>memory.delete(value));
   req.onsuccess?.();pending--;
   setTimeout(()=>{if(aborted||finished||pending)return;if(window.__abortWrite&&writes.length){tx.abort();return;}finished=true;writes.forEach(fn=>fn());tx.oncomplete?.();},0);
  },0);return req;};
  tx.objectStore=()=>({get:key=>op('get',key),getAll:()=>op('getAll'),put:value=>op('put',value),delete:key=>op('delete',key)});return tx;
 }};
 Object.defineProperty(window,'indexedDB',{value:{open(){const req={};setTimeout(()=>{req.result=db;req.onsuccess?.();},0);return req;}}});
 window.fetch=async(url,options={})=>{
  if(url==='/api/demo-correction-replies'&&options.method==='POST'){
   const data=JSON.parse(options.body),round=data.round||1;
   const old=window.__replies.find(x=>x.responseId===data.responseId);
   if(old)return new Response(JSON.stringify({status:'received',receiptId:old.receiptId,round}));
   const reply={...data,round,receiptId:'receipt-demo-'+round,receivedAt:Date.now(),photoCount:data.photoToken?1:0,review:null};
   window.__replies.push(reply);return new Response(JSON.stringify({status:'received',receiptId:reply.receiptId,round,persistent:true}));
  }
  if(url==='/api/demo-correction-replies')return new Response(JSON.stringify({replies:window.__replies}));
  if(url==='/api/demo-corrections'){
   const last=window.__replies.at(-1);
   return new Response(JSON.stringify({requests:[{id:'demo-correction-001',state:last?.review?.decision||'responded',reason:last?.review?.note||'',latestRound:last?.round||0,latestReceiptId:last?.receiptId,nextRound:last?.review?.decision==='needs-more-information'?last.round+1:null}]}));
  }
  if(url==='/api/demo-photo')return new Response(JSON.stringify({photoToken:'photo-'+(++seq),bytes:options.body.size,detectedType:options.body.type}));
  throw Error('Unexpected fixture URL '+url);
 };
})();
'''
checks=[]
def check(name,condition):
 checks.append({'name':name,'passed':bool(condition)});assert condition,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(markup);page.add_script_tag(content=fixture);page.add_script_tag(content='(function(){\n'+source+'\n'+script+'\n})();')
 expect(page.locator('#save')).to_be_enabled()
 check('next response hidden before supervisor review',not page.locator('#next-round').is_visible())
 page.locator('#notes').fill('Round one: rooms A and B completed.')
 page.locator('#save').click();expect(page.locator('#send')).to_be_enabled();page.locator('#send').click()
 expect(page.locator('#send-status')).to_contain_text('Received and saved')
 check('round one locked after confirmed receipt',page.locator('#notes').is_disabled())
 page.evaluate("window.__replies[0].review={decision:'needs-more-information',note:'Please clarify room C and attach its photo.'}")
 page.locator('#check-review').click();expect(page.locator('#next-round')).to_be_enabled()
 check('supervisor request enables preparation of next version',page.locator('#next-round').is_visible())
 page.evaluate('window.__abortWrite=true');page.locator('#next-round').click();expect(page.locator('#status')).to_contain_text('Unable to save:')
 check('archive transaction abort leaves original active draft intact',page.evaluate("window.__memory.size===1 && window.__memory.get('demo-correction-001').receiptId==='receipt-demo-1'"))
 page.evaluate('window.__abortWrite=false');page.locator('#next-round').click();expect(page.locator('#status')).to_contain_text('previous version is preserved')
 check('new draft is round two and editable',page.evaluate("window.__memory.get('demo-correction-001').round===2") and page.locator('#notes').is_enabled())
 check('previous response archived without overwriting text',page.evaluate("[...window.__memory.values()].some(x=>x.archive && x.notes==='Round one: rooms A and B completed.' && x.receiptId==='receipt-demo-1')"))
 check('new response carries the supervisor instruction','clarify room C' in page.locator('#supervisor-reason').inner_text())
 check('empty round two cannot be sent',page.locator('#send').is_disabled())
 page.locator('#notes').fill('Round two: room C is complete. Additional evidence retained.')
 page.locator('#save').click();expect(page.locator('#send')).to_be_enabled();page.locator('#send').click()
 expect(page.locator('#send-status')).to_contain_text('Received and saved')
 expect(page.locator('#send')).to_be_disabled()
 check('confirmation replaces the earlier local-only save message','Confirmed by the local demo server' in page.locator('#status').inner_text())
 check('second response linked to original receipt',page.evaluate("window.__replies.length===2 && window.__replies[1].parentReceiptId==='receipt-demo-1' && window.__replies[1].round===2"))
 page.evaluate("window.__replies[1].review={decision:'accepted',note:'Both versions reviewed.'}")
 page.locator('#check-review').click();expect(page.locator('#send-status')).to_contain_text('accepted')
 check('accepted response does not offer another version',not page.locator('#next-round').is_visible())
 page.locator('details summary').click()
 check('prior version remains readable in local history','Round one:' in page.locator('#local-history').inner_text())
 for width in [320,390,768,1280]:
  page.set_viewport_size({'width':width,'height':844})
  check(f'worker no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  if width in [390,1280]:page.screenshot(path=str(OUT/f'worker-rounds-{width}.png'),full_page=True)
 check('no uncaught worker JavaScript errors',not errors)
 # Supervisor view: two immutable versions, explicit per-receipt review target.
 admin=(BASE/'staging-correction-review-local.html').read_text()
 admin_script=re.search(r'<script>(.*?)</script>',admin,re.S).group(1)
 page=browser.new_page(viewport={'width':390,'height':844})
 page.set_content(re.sub(r'<script.*?</script>','',admin,flags=re.S))
 page.add_script_tag(content=r'''
 window.__target=null;
 window.fetch=async(url,options={})=>{
  if(url==='/api/demo-storage')return new Response(JSON.stringify({restartPersistence:true,photos:0}));
  if(url==='/api/submissions')return new Response(JSON.stringify({items:[]}));
  if(url==='/api/demo-correction-replies')return new Response(JSON.stringify({replies:[
   {requestId:'demo-correction-001',round:1,receiptId:'receipt-demo-1',notes:'Original room report',photoCount:0,review:{decision:'needs-more-information',note:'Please clarify room C'}},
   {requestId:'demo-correction-001',round:2,receiptId:'receipt-demo-2',notes:'Additional room C report',photoCount:0,review:window.__target?{decision:'accepted',note:'Reviewed'}:null}
  ]}));
  if(url==='/api/demo-correction-review'){window.__target=JSON.parse(options.body);return new Response(JSON.stringify({review:{decision:'accepted',note:'Reviewed'}}));}
 };
 ''')
 page.add_script_tag(content=admin_script);expect(page.locator('#items article')).to_have_count(2)
 check('admin sees latest and original versions together',page.locator('#items h2').all_inner_texts()==['Worker clarification - round 2','Worker clarification - round 1'])
 page.get_by_role('button',name='Accept response').click();expect(page.locator('#status')).to_contain_text('Review saved')
 check('admin decision targets second receipt explicitly',page.evaluate("window.__target.receiptId==='receipt-demo-2'"))
 check('original supervisor note remains visible','Please clarify room C' in page.locator('#items').inner_text())
 for width in [320,390,768,1280]:
  page.set_viewport_size({'width':width,'height':844});check(f'admin no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  if width in [390,1280]:page.screenshot(path=str(OUT/f'admin-rounds-{width}.png'),full_page=True)
 browser.close()
result={'scope':'DOM/CSS and transaction/HTTP fixtures; not real IndexedDB, camera or browser networking','passed':len(checks),'failed':0,'checks':checks}
(OUT/'correction-rounds-ui.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))

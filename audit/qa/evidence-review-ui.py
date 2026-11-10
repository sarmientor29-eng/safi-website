"""UI fixtures only: no real browser network, database, device or camera test."""
from pathlib import Path
import os, json, re, shutil, base64, io
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright, expect
BASE=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('SAFI_QA_OUTPUT',str(BASE/'qa'/'evidence')))
OUT.mkdir(parents=True,exist_ok=True)
html=(BASE/'staging-correction-review-local.html').read_text()
script=re.search(r'<script>(.*?)</script>',html,re.S).group(1)
markup=re.sub(r'<script.*?</script>','',html,flags=re.S)
# Synthetic receipt illustration: not a customer document or uploaded evidence.
im=Image.new('RGB',(560,660),'#fdfdf9');d=ImageDraw.Draw(im)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
bold=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',26)
d.rectangle((30,24,530,635),outline='#b5c5cd',width=3)
d.text((55,65),'DEMO RECEIPT',fill='#143047',font=bold)
y=130
for line in ['SYNTHETIC TEST IMAGE', 'Not a real purchase', '', 'Example supplies      $100.00', 'Example tax               $5.00', '', 'Test total               $105.00', '', 'For interface testing only']:
 d.text((55,y),line,fill='#233f50',font=font);y+=44
buf=io.BytesIO();im.save(buf,format='PNG');imgdata='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
fixture=r'''
window.__review=null;window.__mode='local-disk';window.__attempts=0;
window.fetch=async(path,options={})=>{
 if(path==='/api/demo-storage')return new Response(JSON.stringify({restartPersistence:window.__mode==='local-disk',photos:2}));
 const url='/api/demo-evidence/10000000-0000-4000-8000-000000000001/0';
 if(path==='/api/demo-correction-replies')return new Response(JSON.stringify({replies:[{requestId:'demo-correction-001',receiptId:'10000000-0000-4000-8000-000000000001',notes:'Rooms A and B completed. Supporting photograph attached.',photoCount:1,evidenceUrls:window.__mode==='local-disk'?[url]:[],review:window.__review}]}));
 if(path==='/api/submissions')return new Response(JSON.stringify({items:[{kind:'expense',workerId:'demo-worker',projectId:'Demo commercial interior',notes:'Synthetic supplies receipt for review.',amountCents:10500,photoCount:1,evidenceUrls:window.__mode==='local-disk'?[url]:[]}]}));
 if(path==='/api/demo-correction-review'){
  window.__attempts++;const data=JSON.parse(options.body);
  if(data.decision==='needs-more-information'&&!data.note.trim())return new Response(JSON.stringify({error:'Review note required'}),{status:400});
  await new Promise(resolve=>setTimeout(resolve,50));window.__review={decision:data.decision,note:data.note};return new Response(JSON.stringify({review:window.__review}));
 }
 throw Error('Unexpected fixture endpoint '+path);
};
'''
checks=[]
def record(name,condition):
 checks.append({'name':name,'passed':bool(condition)});assert condition,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844})
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content(markup);page.add_script_tag(content=fixture)
 page.add_script_tag(content="const photoSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{get:photoSrc.get,set(value){photoSrc.set.call(this,value.startsWith('/api/demo-evidence/')?"+json.dumps(imgdata)+":value)}});")
 page.add_script_tag(content=script)
 expect(page.locator('#storage')).to_contain_text('Local disk storage active')
 record('storage mode is visible', 'Local disk storage active' in page.locator('#storage').inner_text())
 record('worker clarification and expense both appear',page.locator('#items article').count()==1 and page.locator('#submissions article').count()==1)
 page.locator('#items summary').click();page.locator('#submissions summary').click()
 # Image source setter serves synthetic pixels only; never contacts a server.
 expect(page.locator('img')).to_have_count(2);expect(page.locator('img').first).to_be_visible()
 record('evidence expands into thumbnails',page.locator('img').count()==2)
 record('full-size evidence links stay on the fixed local API',all(x.startswith('/api/demo-evidence/') for x in page.locator('.photos a').evaluate_all('(els)=>els.map(e=>e.getAttribute("href"))')))
 page.get_by_role('button',name='Request more information').click();expect(page.locator('#status')).to_contain_text('Review note required')
 record('missing review note cannot record a decision',page.evaluate('window.__review===null'))
 page.locator('#items input').fill('Checked synthetic evidence')
 page.get_by_role('button',name='Accept response').click();expect(page.locator('#status')).to_contain_text('Review saved')
 record('review confirmation shown after response', 'accepted' in page.locator('#items').inner_text())
 record('review controls removed after acceptance',page.locator('#items button').count()==0)
 page.locator('#items summary').click();page.locator('#submissions summary').click()
 expect(page.locator('img')).to_have_count(2)
 for width in [320,390,768,1280]:
  page.set_viewport_size({'width':width,'height':900})
  record(f'no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  if width in [390,1280]:page.screenshot(path=str(OUT/f'evidence-review-{width}.png'),full_page=True)
 page.evaluate("window.__mode='memory-metadata'");page.get_by_role('button',name='Refresh records').click()
 expect(page.locator('#storage')).to_contain_text('Memory-only')
 record('no thumbnails are claimed when originals are absent',page.locator('img').count()==0 and 'Original not available' in page.locator('#items').inner_text())
 record('no uncaught JavaScript errors',len(errors)==0)
 browser.close()
result={'scope':'Chromium DOM/CSS and HTTP fixtures; synthetic image pixels, no real browser persistence or networking','checks':checks,'passed':len(checks),'failed':0}
(OUT/'evidence-review-ui.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))

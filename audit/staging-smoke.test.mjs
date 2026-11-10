import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=dirname(fileURLToPath(import.meta.url));
const pages=[
 'staging-dashboard.html','staging-finance.html','staging-invoice.html',
 'staging-crm.html','staging-expenses.html','staging-projects.html',
 'staging-labor.html','staging-flha.html','staging-project-reports.html',
 'staging-payments.html','staging-quote-workflow.html',
 'staging-documents.html','staging-accounting.html','staging-checks.html'
];
const read=name=>readFileSync(join(root,name),'utf8');

test('all 14 staging pages exist and have HTML titles',()=>{
 for(const page of pages){
  assert.ok(existsSync(join(root,page)),page+' missing');
  assert.match(read(page),/<title>[^<]+<\/title>/i,page+' missing title');
 }
});

test('dashboard links to every isolated workspace module',()=>{
 const dashboard=read('staging-dashboard.html');
 for(const page of pages.filter(x=>!['staging-dashboard.html','staging-checks.html'].includes(x))){
  assert.ok(dashboard.includes('href="'+page+'"'),page+' missing dashboard link');
 }
});

test('all local HTML links resolve to files in the repository',()=>{
 for(const page of pages){
  const html=read(page);
  for(const match of html.matchAll(/\bhref\s*=\s*["']([^"'#?]+)(?:[?#][^"']*)?["']/gi)){
   const href=match[1];
   if(/^(?:[a-z]+:|\/\/|#)/i.test(href))continue;
   const target=decodeURIComponent(href);
   assert.ok(existsSync(join(root,target)),page+' has broken link: '+href);
  }
 }
});

test('all inline scripts parse as JavaScript',()=>{
 for(const page of pages){
  const html=read(page);
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for(const [,attributes,script] of scripts){
   if(/\bsrc\s*=/.test(attributes)||!script.trim())continue;
   const mode=/\btype\s*=\s*["']module["']/.test(attributes)?'module':'commonjs';
   const check=spawnSync(process.execPath,['--check','--input-type='+mode],{input:script,encoding:'utf8'});
   assert.equal(check.status,0,page+' invalid inline script: '+check.stderr);
  }
 }
});

test('demo-only pages warn users that entries are not persistent',()=>{
 for(const page of ['staging-projects.html','staging-labor.html','staging-flha.html','staging-project-reports.html','staging-payments.html','staging-quote-workflow.html','staging-documents.html','staging-accounting.html']){
  const html=read(page);
  assert.match(html,/preview|demo|draft/i,page+' missing preview disclosure');
 }
});

import test from "node:test";
import assert from "node:assert/strict";
import {issueDocumentTransaction} from "./issue-document.mjs";
function fakeDb(){
 const data=new Map();let nextId=0;
 const db={
  data,
  collection(name){return {doc(id){const key=name+"/"+(id || "new-"+(++nextId));return {id:key.split("/").at(-1),key};}};},
  async runTransaction(fn){
   const changes=[];
   const tx={
    async get(ref){return {exists:data.has(ref.key),data:()=>data.get(ref.key)};},
    set(ref,value){changes.push([ref.key,value]);},
    create(ref,value){if(data.has(ref.key))throw new Error("duplicate");changes.push([ref.key,value]);}
   };
   const result=await fn(tx);for(const [key,value] of changes)data.set(key,value);return result;
  }
 };return db;
}
const draft={kind:"invoice",status:"draft",numberReserved:false,calculation:{totalCents:10500}};
const args={kind:"invoice",year:2026,requestId:"test-request-0001",document:draft,actorUid:"admin-1"};
test("issues sequential number atomically in one transaction",async()=>{
 const db=fakeDb();const first=await issueDocumentTransaction({...args,db});
 const second=await issueDocumentTransaction({...args,db,requestId:"test-request-0002"});
 assert.equal(first.number,"INV-2026-0001");assert.equal(second.number,"INV-2026-0002");
 assert.equal(db.data.get("documentCounters/invoice-2026").lastNumber,2);
});
test("retry is idempotent",async()=>{
 const db=fakeDb();const first=await issueDocumentTransaction({...args,db});
 const retry=await issueDocumentTransaction({...args,db});
 assert.equal(retry.number,first.number);assert.equal(retry.reused,true);
 assert.equal(db.data.get("documentCounters/invoice-2026").lastNumber,1);
});
test("rejects invalid request and draft",async()=>{
 const db=fakeDb();
 await assert.rejects(issueDocumentTransaction({...args,db,requestId:"bad"}),RangeError);
 await assert.rejects(issueDocumentTransaction({...args,db,document:{...draft,status:"issued"}}),RangeError);
});
test("idempotency key cannot be reused for a different actor",async()=>{
 const db=fakeDb();await issueDocumentTransaction({...args,db});
 await assert.rejects(issueDocumentTransaction({...args,db,actorUid:"another-admin"}),RangeError);
});

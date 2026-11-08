import test from "node:test";
import assert from "node:assert/strict";
import {planDocumentTransition,verifyAuditChain} from "./document-lifecycle.mjs";
const actorUid="admin-test",timestamp="2026-11-08T12:00:00Z";
test("issue requires reserved number",()=>{
 assert.throws(()=>planDocumentTransition({document:{status:"draft"},action:"issue",actorUid,timestamp}),RangeError);
 const r=planDocumentTransition({document:{id:"doc1",status:"draft",numberReserved:true,number:"INV-2026-0001"},action:"issue",actorUid,timestamp});
 assert.equal(r.updated.status,"issued");assert.equal(r.audit.actorUid,actorUid);
});
test("void keeps an audit record and reason",()=>{
 const document={id:"doc1",status:"issued"};
 assert.throws(()=>planDocumentTransition({document,action:"void",actorUid,timestamp,reason:"mistake"}),RangeError);
 const r=planDocumentTransition({document,action:"void",actorUid,timestamp,reason:"Duplicate invoice issued"});
 assert.equal(r.updated.status,"void");assert.equal(r.audit.reason,"Duplicate invoice issued");
});
test("paid documents cannot be deleted or reopened",()=>{
 assert.throws(()=>planDocumentTransition({document:{status:"paid"},action:"void",actorUid,timestamp,reason:"Duplicate invoice issued"}),RangeError);
});
test("audit chain detects broken transitions",()=>{
 assert.equal(verifyAuditChain([{from:"draft",to:"issued",actorUid},{from:"issued",to:"paid",actorUid}]),true);
 assert.equal(verifyAuditChain([{from:"draft",to:"issued",actorUid},{from:"draft",to:"paid",actorUid}]),false);
});

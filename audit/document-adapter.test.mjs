import test from "node:test";
import assert from "node:assert/strict";
import {normalizeLegacyDocument, assertReadyForIssue} from "./document-adapter.mjs";
const legacy={number:"INV-2025-001",clientName:"Client Example",projectName:"Project A",date:"2026-11-08",dueDate:"2026-12-08",taxRate:5,items:[{desc:"Drywall",qty:2,rate:50}]};
test("legacy invoice maps to integer-cent calculations and remains draft",()=>{
 const doc=normalizeLegacyDocument(legacy,{kind:"invoice"});
 assert.equal(doc.calculation.totalCents,10500);
 assert.equal(doc.status,"draft");
 assert.equal(doc.numberReserved,false);
});
test("legacy number alone never authorizes issue",()=>{
 const doc=normalizeLegacyDocument(legacy,{kind:"invoice"});
 assert.throws(()=>assertReadyForIssue(doc,{}),RangeError);
});
test("trusted reservation produces issue-ready representation",()=>{
 const doc=normalizeLegacyDocument(legacy,{kind:"invoice"});
 const issued=assertReadyForIssue(doc,{documentKind:"invoice",number:"INV-2026-0001",transactionId:"server-tx-1"});
 assert.equal(issued.number,"INV-2026-0001");
 assert.equal(issued.numberReserved,true);
});
test("rejects missing client, bad dates, and invalid tax rate",()=>{
 assert.throws(()=>normalizeLegacyDocument({...legacy,clientName:""},{kind:"invoice"}),RangeError);
 assert.throws(()=>normalizeLegacyDocument({...legacy,dueDate:"2026-10-01"},{kind:"invoice"}),RangeError);
 assert.throws(()=>normalizeLegacyDocument({...legacy,taxRate:5.123},{kind:"invoice"}),RangeError);
});

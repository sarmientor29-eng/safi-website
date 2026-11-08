import test from "node:test";
import assert from "node:assert/strict";
import {summarizeLedger} from "./ledger-core.mjs";
const fixture={
 invoices:[{id:"I-1",date:"2026-01-10",subtotalCents:10000,gstCents:500}],
 receipts:[{invoiceId:"I-1",date:"2026-02-05",amountCents:3000}],
 expenses:[{date:"2026-01-15",subtotalCents:4000,gstCents:200,eligibleItcCents:100}],
 payments:[{date:"2026-01-16",amountCents:4200}],
 from:"2026-01-01",to:"2026-01-31"
};
test("separates invoiced from cash received",()=>{
 const r=summarizeLedger(fixture);
 assert.equal(r.invoicedSubtotalCents,10000);
 assert.equal(r.cashReceivedCents,0);
 assert.equal(r.accountsReceivableCents,7500);
 assert.equal(r.estimatedNetGstCents,400);
 assert.equal(r.netCashMovementCents,-4200);
});
test("receipt period differs from invoice period",()=>{
 const r=summarizeLedger({...fixture,from:"2026-02-01",to:"2026-02-28"});
 assert.equal(r.invoicedSubtotalCents,0);
 assert.equal(r.cashReceivedCents,3000);
});
test("ITC must not exceed expense GST",()=>{
 assert.throws(()=>summarizeLedger({...fixture,expenses:[{date:"2026-01-15",subtotalCents:100,gstCents:5,eligibleItcCents:6}]}),RangeError);
});
test("rejects overpayments and invalid dates",()=>{
 assert.throws(()=>summarizeLedger({...fixture,receipts:[{invoiceId:"I-1",date:"2026-01-20",amountCents:10501}]}),RangeError);
 assert.throws(()=>summarizeLedger({...fixture,from:"2026-02-30"}),RangeError);
});

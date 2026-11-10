import test from "node:test";
import assert from "node:assert/strict";
import {sumCents, filterTransactions, summarizeGst} from "./accounting-core.mjs";
const records = [
 {date:"2026-11-01",type:"income",subtotal:10000,gst:500},
 {date:"2026-11-02",type:"expense",subtotal:3000,gst:150,itc:"eligible"},
 {date:"2026-11-03",type:"expense",subtotal:2000,gst:100,itc:"review"},
 {date:"2026-11-04",type:"expense",subtotal:1000,gst:50,itc:"excluded"}
];
test("GST report distinguishes potential credits from pending and excluded",()=>{
 assert.deepEqual(summarizeGst(records),{
  revenueCents:10000,expenseCents:6000,gstCollectedCents:500,
  gstPotentialItcCents:150,gstReviewPendingCents:100,gstExcludedCents:50,
  gstIllustrativeNetCents:350
 });
});
test("Date and transaction type filters",()=>{
 assert.equal(filterTransactions(records,{from:"2026-11-02",to:"2026-11-03",type:"expense"}).length,2);
 assert.throws(()=>filterTransactions(records,{from:"2026-11-05",to:"2026-11-01"}));
 assert.throws(()=>filterTransactions(records,{type:"other"}));
});
test("Integer cents validation",()=>{
 assert.equal(sumCents([{gst:5},{gst:7}],"gst"),12);
 assert.throws(()=>sumCents([{gst:0.5}],"gst"));
 assert.throws(()=>sumCents([{gst:-1}],"gst"));
 assert.throws(()=>sumCents([{gst:Number.MAX_SAFE_INTEGER},{gst:1}],"gst"));
});
test("No GST on expense with pending ITC is counted as credit",()=>{
 const r=summarizeGst(records.filter(x=>x.itc!=="eligible"));
 assert.equal(r.gstPotentialItcCents,0);
 assert.equal(r.gstIllustrativeNetCents,500);
});
test("Reject unknown transaction type",()=>{
 assert.throws(()=>summarizeGst([{type:"refund",subtotal:100,gst:5}]));
});

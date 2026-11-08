import test from "node:test";
import assert from "node:assert/strict";
import {normalizeLegacyDocument} from "./document-adapter.mjs";

const base={clientName:"Example Client",projectName:"Example Project",date:"2026-11-08",items:[{description:"Drywall",qty:"2",rate:"125.00"}]};
test("quote accepts a decimal tax rate represented imprecisely in binary",()=>{
 const quote=normalizeLegacyDocument({...base,taxRate:0.29},{kind:"quote"});
 assert.equal(quote.calculation.taxRateBasisPoints,29);
 assert.equal(quote.calculation.totalCents,25073);
});
test("quote rejects tax rates with more than two decimal places",()=>{
 assert.throws(()=>normalizeLegacyDocument({...base,taxRate:5.123},{kind:"quote"}),/tax rate precision/i);
});
test("invoice rejects due dates before the invoice date",()=>{
 assert.throws(()=>normalizeLegacyDocument({...base,taxRate:5,dueDate:"2026-11-07"},{kind:"invoice"}),/due date/i);
});
test("invoice draft preserves a valid due date and does not reserve an invoice number",()=>{
 const invoice=normalizeLegacyDocument({...base,taxRate:5,dueDate:"2026-12-08"},{kind:"invoice"});
 assert.equal(invoice.dueDate,"2026-12-08");
 assert.equal(invoice.numberReserved,false);
 assert.equal(invoice.calculation.totalCents,26250);
});

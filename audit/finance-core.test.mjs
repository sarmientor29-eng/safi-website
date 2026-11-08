import test from "node:test";
import assert from "node:assert/strict";
import {toCents, fromCents, calculateDocument, outstandingBalance} from "./finance-core.mjs";

test("money conversion is exact", () => {
  assert.equal(toCents("12.05"), 1205);
  assert.equal(fromCents(1205), "12.05");
  assert.throws(() => toCents("12.345"), RangeError);
});
test("GST 5 percent on 100 CAD", () => {
  const result = calculateDocument({items:[{description:"Labour",quantity:2,rate:"50.00"}],taxRateBasisPoints:500});
  assert.equal(result.subtotalCents,10000);
  assert.equal(result.taxCents,500);
  assert.equal(result.totalCents,10500);
});
test("multiple lines and no tax", () => {
  const result = calculateDocument({items:[{description:"Material",quantity:3,rate:"10.00"},{description:"Service",quantity:1,rate:"20.00"}]});
  assert.equal(result.totalCents,5000);
});
test("discount is applied before tax", () => {
  const result = calculateDocument({items:[{description:"Labour",quantity:1,rate:"100.00"}],discountCents:1000,taxRateBasisPoints:500});
  assert.equal(result.taxCents,450);
  assert.equal(result.totalCents,9450);
});
test("rounds half-cent up at line level", () => {
  const result = calculateDocument({items:[{description:"Fractional quantity",quantity:"0.5",rate:"0.01"}]});
  assert.equal(result.totalCents,1);
});
test("partial payment balance", () => {
  assert.deepEqual(outstandingBalance({totalCents:10500,paymentsCents:[3000,2000]}),{paidCents:5000,outstandingCents:5500,status:"partial"});
});
test("rejects invalid inputs and overpayment", () => {
  assert.throws(() => calculateDocument({items:[]}),RangeError);
  assert.throws(() => calculateDocument({items:[{description:"X",quantity:-1,rate:10}]}),RangeError);
  assert.throws(() => calculateDocument({items:[{description:"X",quantity:1,rate:10}],discountCents:1100}),RangeError);
  assert.throws(() => outstandingBalance({totalCents:100,paymentsCents:[101]}),RangeError);
});

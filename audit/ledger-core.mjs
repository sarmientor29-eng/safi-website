/**
 * SAFI ledger projections (pure calculations; no network, no side effects).
 * All amounts are integer CAD cents. GST amounts are explicit inputs, not
 * inferred from gross expenses. Input tax credits must be verified separately.
 */
function money(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(name + " must be nonnegative integer cents");
  return value;
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0,10) !== value) throw new RangeError("Invalid ISO date");
  return value;
}
function within(value, from, to) { return value >= from && value <= to; }
export function summarizeLedger({invoices = [], receipts = [], expenses = [], payments = [], from, to}) {
  date(from); date(to);
  if (from > to) throw new RangeError("Start date after end date");
  for (const [name, records] of Object.entries({invoices, receipts, expenses, payments})) if (!Array.isArray(records)) throw new TypeError(name + " must be an array");
  const invoiceIds = new Set();
  for (const i of invoices) {
    if (!i || typeof i.id !== "string" || !i.id || invoiceIds.has(i.id)) throw new RangeError("Invalid or duplicate invoice ID");
    invoiceIds.add(i.id); date(i.date); money(i.subtotalCents,"invoice subtotal"); money(i.gstCents,"invoice GST");
  }
  const byInvoice = new Map();
  for (const r of receipts) {
    if (!r || !invoiceIds.has(r.invoiceId)) throw new RangeError("Receipt references missing invoice");
    date(r.date); money(r.amountCents,"receipt amount");
    if (r.amountCents === 0) throw new RangeError("Zero receipt");
    byInvoice.set(r.invoiceId,(byInvoice.get(r.invoiceId) || 0) + r.amountCents);
  }
  for (const i of invoices) {
    if ((byInvoice.get(i.id) || 0) > i.subtotalCents + i.gstCents) throw new RangeError("Overpaid invoice " + i.id);
  }
  for (const e of expenses) {
    if (!e) throw new RangeError("Invalid expense");
    date(e.date); money(e.subtotalCents,"expense subtotal"); money(e.gstCents,"expense GST"); money(e.eligibleItcCents,"eligible ITC");
    if (e.eligibleItcCents > e.gstCents) throw new RangeError("ITC exceeds recorded GST");
  }
  for (const p of payments) { if (!p) throw new RangeError("Invalid payment"); date(p.date); money(p.amountCents,"payment amount"); }
  const relevantInvoices = invoices.filter(i=>within(i.date,from,to));
  const relevantReceipts = receipts.filter(r=>within(r.date,from,to));
  const relevantExpenses = expenses.filter(e=>within(e.date,from,to));
  const relevantPayments = payments.filter(p=>within(p.date,from,to));
  const sum = (items,key) => items.reduce((acc,x)=> { const n=acc+x[key]; if (!Number.isSafeInteger(n)) throw new RangeError("Total overflow"); return n; },0);
  const invoicedSubtotalCents=sum(relevantInvoices,"subtotalCents");
  const gstChargedCents=sum(relevantInvoices,"gstCents");
  const cashReceivedCents=sum(relevantReceipts,"amountCents");
  const expenseSubtotalCents=sum(relevantExpenses,"subtotalCents");
  const gstPaidCents=sum(relevantExpenses,"gstCents");
  const potentialItcCents=sum(relevantExpenses,"eligibleItcCents");
  const cashPaidCents=sum(relevantPayments,"amountCents");
  const accountsReceivableCents=invoices.reduce((acc,i)=>acc+i.subtotalCents+i.gstCents-(byInvoice.get(i.id)||0),0);
  if (!Number.isSafeInteger(accountsReceivableCents)) throw new RangeError("Receivables overflow");
  return {
    period:{from,to},
    invoicedSubtotalCents,gstChargedCents,cashReceivedCents,
    expenseSubtotalCents,gstPaidCents,potentialItcCents,
    estimatedNetGstCents:gstChargedCents-potentialItcCents,
    estimatedOperatingDifferenceCents:invoicedSubtotalCents-expenseSubtotalCents,
    cashPaidCents,netCashMovementCents:cashReceivedCents-cashPaidCents,
    accountsReceivableCents,
    warnings:["GST estimate is invoice-date based, not a tax return. Verify reporting method, adjustments and ITC eligibility.","Operating difference is not taxable income or income tax payable.","Cash movement excludes unrecorded bank transactions; accounts payable requires a separate bill ledger."]
  };
}

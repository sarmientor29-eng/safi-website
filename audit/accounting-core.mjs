// Pure reporting utilities for SAFI development previews.
// No persistence, no Firebase access, and no tax filing logic.
export function sumCents(records, field) {
  if (!Array.isArray(records)) throw new TypeError("Expected records array");
  return records.reduce((total, record) => {
    const amount = record[field];
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError("Invalid nonnegative cents in " + field);
    const next = total + amount;
    if (!Number.isSafeInteger(next)) throw new RangeError("Total exceeds safe integer range");
    return next;
  }, 0);
}

export function filterTransactions(records, {from = "", to = "", type = ""} = {}) {
  if (from && to && from > to) throw new RangeError("Start date after end date");
  if (type && !["income", "expense"].includes(type)) throw new RangeError("Invalid transaction type");
  return records.filter(r => (!from || r.date >= from) && (!to || r.date <= to) && (!type || r.type === type));
}

export function summarizeGst(records) {
  const income = records.filter(r => r.type === "income");
  const expenses = records.filter(r => r.type === "expense");
  if (records.some(r => !["income", "expense"].includes(r.type))) throw new RangeError("Unknown transaction type");
  const revenueCents = sumCents(income, "subtotal");
  const expenseCents = sumCents(expenses, "subtotal");
  const gstCollectedCents = sumCents(income, "gst");
  const gstPotentialItcCents = sumCents(expenses.filter(r => r.itc === "eligible"), "gst");
  const gstReviewPendingCents = sumCents(expenses.filter(r => r.itc === "review"), "gst");
  const gstExcludedCents = sumCents(expenses.filter(r => r.itc === "excluded"), "gst");
  return {
    revenueCents, expenseCents, gstCollectedCents, gstPotentialItcCents,
    gstReviewPendingCents, gstExcludedCents,
    gstIllustrativeNetCents: gstCollectedCents - gstPotentialItcCents
  };
}

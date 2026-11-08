/**
 * SAFI finance calculation core.
 * Pure, dependency-free calculations. No Firebase access or side effects.
 * Money is represented as integer cents to avoid floating-point accumulation.
 * Tax treatment and ITC eligibility must be determined outside this module.
 */
export function toCents(value) {
  if (typeof value !== "number" && typeof value !== "string") throw new TypeError("Amount must be a number or numeric string");
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new RangeError("Amount must have at most two decimal places");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new RangeError("Amount is too large");
  return negative ? -cents : cents;
}
export function fromCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Invalid cents");
  return (cents / 100).toFixed(2);
}
function roundDivide(numerator, denominator) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) throw new RangeError("Invalid calculation");
  return Math.floor(numerator / denominator + 0.5);
}
/**
 * Quantity is limited to 3 decimal places; rates to 2 decimal places.
 * Tax rates are basis points: 500 = 5%, 0 = exempt or zero-rated for calculation only.
 * This function does not determine whether a supply is taxable or an ITC is claimable.
 */
export function calculateDocument({items, taxRateBasisPoints = 0, discountCents = 0}) {
  if (!Array.isArray(items) || items.length === 0) throw new RangeError("At least one line item is required");
  if (!Number.isInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 10000) throw new RangeError("Invalid tax rate");
  if (!Number.isSafeInteger(discountCents) || discountCents < 0) throw new RangeError("Invalid discount");
  const lines = items.map((item, index) => {
    if (!item || typeof item.description !== "string" || !item.description.trim()) throw new RangeError("Missing line description: " + index);
    const q = String(item.quantity);
    if (!/^\d+(?:\.\d{1,3})?$/.test(q)) throw new RangeError("Invalid quantity: " + index);
    const [whole, fraction = ""] = q.split(".");
    const quantityMillis = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
    if (!Number.isSafeInteger(quantityMillis) || quantityMillis <= 0) throw new RangeError("Invalid quantity: " + index);
    const rateCents = toCents(item.rate);
    if (rateCents < 0) throw new RangeError("Negative rate: " + index);
    const product = quantityMillis * rateCents;
    if (!Number.isSafeInteger(product)) throw new RangeError("Line amount too large");
    const amountCents = roundDivide(product, 1000);
    return {description: item.description.trim(), quantityMillis, rateCents, amountCents};
  });
  const subtotalCents = lines.reduce((sum, line) => {
    const next = sum + line.amountCents;
    if (!Number.isSafeInteger(next)) throw new RangeError("Subtotal too large");
    return next;
  }, 0);
  if (discountCents > subtotalCents) throw new RangeError("Discount exceeds subtotal");
  const taxableBaseCents = subtotalCents - discountCents;
  const taxProduct = taxableBaseCents * taxRateBasisPoints;
  if (!Number.isSafeInteger(taxProduct)) throw new RangeError("Tax amount too large");
  const taxCents = roundDivide(taxProduct, 10000);
  const totalCents = taxableBaseCents + taxCents;
  if (!Number.isSafeInteger(totalCents)) throw new RangeError("Total too large");
  return {lines, subtotalCents, discountCents, taxableBaseCents, taxRateBasisPoints, taxCents, totalCents};
}
export function outstandingBalance({totalCents, paymentsCents = []}) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || !Array.isArray(paymentsCents)) throw new RangeError("Invalid invoice or payments");
  const paidCents = paymentsCents.reduce((sum, amount) => {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError("Invalid payment");
    const next = sum + amount;
    if (!Number.isSafeInteger(next)) throw new RangeError("Payments too large");
    return next;
  }, 0);
  if (paidCents > totalCents) throw new RangeError("Payments exceed invoice total");
  return {paidCents, outstandingCents: totalCents - paidCents, status: paidCents === totalCents ? "paid" : paidCents > 0 ? "partial" : "unpaid"};
}

import {calculateDocument, toCents} from "./finance-core.mjs";

/**
 * Compatibility layer for the legacy SAFI quote/invoice form data.
 * No database writes or number generation. A trusted backend must reserve
 * invoice numbers atomically before a document can be issued.
 */
export function normalizeLegacyDocument(input, {kind = "quote"} = {}) {
  if (!["quote","invoice"].includes(kind)) throw new RangeError("Unknown document kind");
  if (!input || typeof input !== "object") throw new TypeError("Document required");
  const clientName = String(input.clientName || "").trim();
  const projectName = String(input.projectName || "").trim();
  if (!clientName) throw new RangeError("Client name required");
  if (!projectName) throw new RangeError("Project name required");
  const date = String(input.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + "T00:00:00Z")) || new Date(date + "T00:00:00Z").toISOString().slice(0,10) !== date) throw new RangeError("Invalid document date");
  const taxRate = Number(input.taxRate ?? 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !Number.isInteger(Math.round(taxRate * 100)) || Math.abs(taxRate * 100 - Math.round(taxRate * 100)) > 1e-8) throw new RangeError("Invalid tax rate precision");
  if (!Array.isArray(input.items)) throw new RangeError("Line items required");
  const items = input.items.map((item) => ({
    description: String(item.description ?? item.desc ?? "").trim(),
    quantity: item.quantity ?? item.qty,
    rate: item.rate
  }));
  const calculation = calculateDocument({items, taxRateBasisPoints: Math.round(taxRate * 100)});
  if (kind === "invoice") {
    const dueDate = String(input.dueDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate + "T00:00:00Z")) || new Date(dueDate + "T00:00:00Z").toISOString().slice(0,10) !== dueDate || dueDate < date) throw new RangeError("Invalid invoice due date");
  }
  return {
    kind, clientName, projectName, date,
    ...(kind === "invoice" ? {dueDate: input.dueDate} : {}),
    legacyNumber: String(input.number || "").trim(),
    numberReserved: false,
    calculation,
    status: "draft"
  };
}

/** Reserve numbers only through an authenticated backend transaction. */
export function assertReadyForIssue(document, reservation) {
  if (!document || !reservation || reservation.documentKind !== document.kind ||
      typeof reservation.number !== "string" ||
      !/^(?:INV|Q)-\d{4}-\d{4,}$/.test(reservation.number) ||
      typeof reservation.transactionId !== "string" || !reservation.transactionId.trim()) {
    throw new RangeError("Trusted numbering reservation required before issue");
  }
  return {...document, number: reservation.number, numberReserved: true, reservationId: reservation.transactionId};
}

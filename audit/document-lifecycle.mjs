/**
 * SAFI document lifecycle (pure validation; no Firestore writes).
 * Persist changes in a trusted backend transaction with audit entries.
 */
const STATES=Object.freeze(["draft","issued","partially_paid","paid","void"]);
export function planDocumentTransition({document,action,actorUid,reason="",timestamp}) {
  if (!document || !STATES.includes(document.status)) throw new RangeError("Unknown document status");
  if (typeof actorUid !== "string" || !actorUid.trim()) throw new RangeError("Actor required");
  if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) throw new RangeError("Valid timestamp required");
  const from=document.status;
  const transitions={
    draft:{issue:"issued",discard:"void"},
    issued:{record_partial_payment:"partially_paid",record_full_payment:"paid",void:"void"},
    partially_paid:{record_partial_payment:"partially_paid",record_full_payment:"paid"},
    paid:{},
    void:{}
  };
  const to=transitions[from][action];
  if (!to) throw new RangeError("Transition not allowed");
  if (to==="void" && String(reason).trim().length < 10) throw new RangeError("Voiding requires a documented reason");
  if (action==="issue" && (!document.numberReserved || !document.number)) throw new RangeError("Reserved number required");
  return {
    updated:{...document,status:to},
    audit:{documentId:document.id || null,from,to,action,actorUid,timestamp,reason:String(reason).trim()}
  };
}
export function verifyAuditChain(events) {
  if (!Array.isArray(events)) throw new TypeError("Events must be an array");
  let previous=null;
  for (const e of events) {
    if (!e || !STATES.includes(e.to) || typeof e.actorUid !== "string" || !e.actorUid) return false;
    if (previous !== null && e.from !== previous) return false;
    previous=e.to;
  }
  return true;
}

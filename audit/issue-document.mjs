/**
 * SAFI sequential document numbers: backend-only transaction helper.
 * This module is not a client-side authorization mechanism.
 * Caller MUST enforce admin authorization server-side and use Firebase Admin
 * SDK or a privileged trusted backend. Never expose this to a public browser.
 *
 * db: Firestore Admin SDK instance (dependency injected for testing).
 * The counter and issued document are written atomically in one transaction.
 * Retries are idempotent by a caller-supplied, server-validated request ID.
 */
const TYPES = Object.freeze({invoice:"INV",quote:"Q"});
export async function issueDocumentTransaction({db,kind,year,requestId,document,actorUid}) {
  if (!db || typeof db.runTransaction !== "function") throw new TypeError("Trusted Firestore required");
  if (!Object.hasOwn(TYPES,kind)) throw new RangeError("Invalid document kind");
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new RangeError("Invalid year");
  if (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)) throw new RangeError("Invalid idempotency key");
  if (typeof actorUid !== "string" || !actorUid.trim()) throw new RangeError("Authenticated actor required");
  if (!document || document.kind !== kind || document.status !== "draft" || document.numberReserved !== false) throw new RangeError("Validated draft required");
  const counterRef=db.collection("documentCounters").doc(kind+"-"+year);
  const requestRef=db.collection("documentIssueRequests").doc(requestId);
  return db.runTransaction(async tx=>{
    const requestSnap=await tx.get(requestRef);
    if (requestSnap.exists) {
      const previous=requestSnap.data();
      if (previous.kind !== kind || previous.year !== year || previous.actorUid !== actorUid) throw new RangeError("Idempotency key conflict");
      return {number:previous.number,documentId:previous.documentId,reused:true};
    }
    const counterSnap=await tx.get(counterRef);
    const next=(counterSnap.exists ? counterSnap.data().lastNumber : 0)+1;
    if (!Number.isSafeInteger(next) || next < 1 || next > 99999999) throw new RangeError("Number range exhausted");
    const number=TYPES[kind]+"-"+year+"-"+String(next).padStart(4,"0");
    const collectionName=kind==="invoice"?"invoices":"quotes";
    const documentRef=db.collection(collectionName).doc();
    const now=new Date().toISOString();
    tx.set(counterRef,{lastNumber:next,updatedAt:now});
    tx.create(documentRef,{...document,number,numberReserved:true,status:"issued",issuedAt:now,issuedBy:actorUid,requestId});
    tx.create(requestRef,{kind,year,actorUid,number,documentId:documentRef.id,createdAt:now});
    return {number,documentId:documentRef.id,reused:false};
  });
}

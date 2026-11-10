/** Multi-round lifecycle for the loopback demo only. Caller wraps mutations in
 * a single SQLite transaction. No authentication or production authorization. */
export const CORRECTION_ID = 'demo-correction-001';
const INITIAL_REASON = 'Clarify completed rooms';
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const version = reply => reply.round ?? 1;
const keyFor = round => round === 1 ? CORRECTION_ID : CORRECTION_ID + ':round:' + round;
export function correctionVersions(replies) {
  return replies.values().filter(x => x.requestId === CORRECTION_ID)
    .map(x => ({...x, round:version(x), parentReceiptId:x.parentReceiptId ?? null}))
    .sort((a,b) => a.round-b.round);
}
export function correctionRequest(replies) {
  const latest = correctionVersions(replies).at(-1);
  const nextRound = !latest ? 1 : latest.review?.decision === 'needs-more-information' && latest.round < 100 ? latest.round+1 : null;
  return {id:CORRECTION_ID, submissionId:'demo-progress', project:'Demo - Commercial Interior',
    reason:latest?.review?.decision === 'needs-more-information' ? latest.review.note : INITIAL_REASON,
    state:latest?.review?.decision || (latest ? 'responded' : 'requested'), nextRound,
    latestRound:latest?.round ?? 0, latestReceiptId:latest?.receiptId ?? null};
}
export function receiveCorrection({replies, photos, data, newReceipt, now = Date.now()}) {
  const round = data?.round === undefined ? 1 : data.round;
  const parent = data?.parentReceiptId ?? null;
  if (data?.requestId !== CORRECTION_ID || typeof data.notes !== 'string' || !data.notes.trim() || data.notes.length > 1500 ||
      typeof data.responseId !== 'string' || !/^demo-[a-zA-Z0-9-]{8,100}$/.test(data.responseId) ||
      (data.photoToken != null && (typeof data.photoToken !== 'string' || !data.photoToken.trim())) ||
      !Number.isSafeInteger(round) || round < 1 || round > 100 ||
      (parent !== null && typeof parent !== 'string') || (round === 1 && parent !== null)) fail(400, 'Invalid demo correction response');
  const versions = correctionVersions(replies);
  const existing = versions.find(x => x.responseId === data.responseId);
  if (existing) {
    if (existing.round !== round || existing.parentReceiptId !== parent || existing.notes !== data.notes.trim() ||
        existing.photoToken !== (data.photoToken ?? null)) fail(409, 'Correction already answered with different data');
    return {status:'received', duplicate:true, receiptId:existing.receiptId, round};
  }
  if (versions.some(x => x.round === round)) fail(409, 'Correction already answered with different data');
  const latest = versions.at(-1);
  if ((!latest && round !== 1) || (latest && (round !== latest.round+1 || latest.review?.decision !== 'needs-more-information' || parent !== latest.receiptId))) {
    fail(409, 'Refresh the supervisor request. This correction round is not open.');
  }
  if (data.photoToken) {
    const photo = photos.get(data.photoToken);
    if (!photo || photo.boundKey) fail(400, 'Photo token invalid or already used');
    photos.set(data.photoToken, {...photo, boundKey:'correction:' + CORRECTION_ID + ':round:' + round});
  }
  const receiptId = newReceipt();
  replies.set(keyFor(round), {requestId:CORRECTION_ID, responseId:data.responseId, round, parentReceiptId:parent,
    notes:data.notes.trim(), photoToken:data.photoToken ?? null, photoCount:data.photoToken?1:0, receiptId, receivedAt:now});
  return {status:'received', duplicate:false, receiptId, round};
}
export function reviewCorrection({replies, data, now = Date.now()}) {
  if (data?.requestId !== CORRECTION_ID) fail(404, 'No response received');
  const versions = correctionVersions(replies);
  if (!versions.length) fail(404, 'No response received');
  if (!data.receiptId && versions.length > 1) fail(409, 'Select the exact response version before reviewing.');
  const reply = data.receiptId ? versions.find(x => x.receiptId === data.receiptId) : versions[0];
  if (!reply) fail(404, 'No response received');
  if (!['accepted','needs-more-information'].includes(data.decision) || typeof data.note !== 'string' || data.note.length > 1500 ||
      (data.decision === 'needs-more-information' && !data.note.trim())) fail(400, 'Invalid review decision or note');
  if (reply.review) {
    if (reply.review.decision !== data.decision || reply.review.note !== data.note.trim()) fail(409, 'Review already recorded');
    return {review:reply.review, duplicate:true, receiptId:reply.receiptId, round:reply.round};
  }
  if (reply.round !== versions.at(-1).round) fail(409, 'Only the latest unreviewed response may be reviewed.');
  const review = {decision:data.decision, note:data.note.trim(), reviewerId:'demo-admin', at:now};
  replies.set(keyFor(reply.round), {...reply, review});
  return {review, duplicate:false, receiptId:reply.receiptId, round:reply.round};
}

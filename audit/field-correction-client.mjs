/** Local-demo client. No automatic synchronization or production credentials. */
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function validateDraft(record) {
  if (!record || record.id !== 'demo-correction-001' ||
      typeof record.responseId !== 'string' || !/^demo-[a-zA-Z0-9-]{8,100}$/.test(record.responseId) ||
      typeof record.notes !== 'string' || !record.notes.trim() || record.notes.length > 1500) {
    throw new Error('A saved correction with a stable response ID is required.');
  }
  const round = record.round ?? 1;
  if (!Number.isSafeInteger(round) || round < 1 || round > 100 ||
      (round > 1 && (typeof record.parentReceiptId !== 'string' || !record.parentReceiptId.trim()))) {
    throw new Error('Invalid correction round or missing previous receipt.');
  }
  if (record.photo && (!TYPES.has(record.photo.type) || !Number.isSafeInteger(record.photo.size) ||
      record.photo.size < 1 || record.photo.size > MAX_PHOTO_BYTES)) {
    throw new Error('Select a JPEG, PNG or WebP photo between 1 byte and 5 MB.');
  }
}

/** Do not report success until the IndexedDB transaction commits. */
export function transactionResult(transaction, request) {
  return new Promise((resolve, reject) => {
    let value;
    request.onsuccess = () => { value = request.result; };
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error || new Error('Local storage write failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Local storage transaction was cancelled.'));
    request.onerror = () => reject(request.error || new Error('Local storage request failed.'));
  });
}

export async function requestJson(fetchImpl, url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {...options, signal: controller.signal});
    let data;
    try { data = await response.json(); } catch { throw new Error('Invalid server response. The draft is kept locally.'); }
    if (!response.ok) {
      const error = new Error(typeof data?.error === 'string' ? data.error : 'The demo server rejected the request.');
      error.status = response.status;
      throw error;
    }
    return data;
  } finally { clearTimeout(timeout); }
}

/** Dependency-injected storage must resolve writeDraft only after commit.
 * Caller serializes access (Web Locks where available). A lost response keeps
 * the same response ID and photo token; a successful receipt keeps them too.
 */
export async function sendSavedCorrection({readDraft, writeDraft, fetchImpl = fetch, timeoutMs = 15000}) {
  let record = await readDraft();
  validateDraft(record);
  if (record.receiptId) return record;
  record = {...record, attemptedAt: record.attemptedAt || Date.now()};
  await writeDraft(record);

  async function uploadPhoto() {
    if (!record.photo || record.photoToken) return;
    const result = await requestJson(fetchImpl, '/api/demo-photo', {
      method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: record.photo
    }, timeoutMs);
    if (typeof result?.photoToken !== 'string' || !result.photoToken ||
        result.bytes !== record.photo.size || result.detectedType !== record.photo.type) {
      throw new Error('Photo confirmation is incomplete. Keep the original draft.');
    }
    record = {...record, photoToken: result.photoToken};
    await writeDraft(record);
  }
  async function submit() {
    return requestJson(fetchImpl, '/api/demo-correction-replies', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({requestId: record.id, responseId: record.responseId,
        notes: record.notes, photoToken: record.photoToken || null,
        round: record.round ?? 1, parentReceiptId: record.parentReceiptId ?? null})
    }, timeoutMs);
  }
  await uploadPhoto();
  let result;
  try { result = await submit(); }
  catch (error) {
    // A restarted in-memory demo server loses upload tokens. Recover once;
    // never change response identity or overwrite a received server record.
    if (error.status !== 400 || error.message !== 'Photo token invalid or already used' ||
        !record.photo || !record.photoToken) throw error;
    record = {...record, photoToken: null};
    await writeDraft(record);
    await uploadPhoto();
    result = await submit();
  }
  if (result?.status !== 'received' || typeof result.receiptId !== 'string' || !result.receiptId.trim() ||
      ((record.round ?? 1) > 1 && result.round !== record.round)) {
    throw new Error('Receipt not confirmed. Keep this draft and retry.');
  }
  record = {...record, receiptId: result.receiptId, receivedAt: Date.now(), serverStorage: result.persistent === true ? 'local-disk' : 'memory'};
  await writeDraft(record);
  return record;
}

/** Prepare a separate local version only after fetching the latest supervisor request.
 * The UI archives the previous draft and writes the returned draft atomically. */
export function prepareNextCorrection(current, request, responseId, at = Date.now()) {
  validateDraft(current);
  const round = current.round ?? 1;
  if (!current.receiptId || request?.id !== current.id || request.state !== 'needs-more-information' ||
      request.latestReceiptId !== current.receiptId || request.latestRound !== round ||
      request.nextRound !== round+1 || request.nextRound > 100 ||
      typeof request.reason !== 'string' || !request.reason.trim() ||
      !Number.isFinite(at) || typeof responseId !== 'string' ||
      !/^demo-[a-zA-Z0-9-]{8,100}$/.test(responseId) || responseId === current.responseId) {
    throw new Error('Refresh the supervisor review before preparing another response.');
  }
  return {id:current.id, responseId, round:round+1, parentReceiptId:current.receiptId,
    supervisorReason:request.reason, notes:'', photo:null, photoToken:null, receiptId:null,
    attemptedAt:null, at};
}

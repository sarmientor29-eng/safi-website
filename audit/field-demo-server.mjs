/** Loopback-only test server. Never expose this service to a network. */
import {createServer} from 'node:http';
import {randomUUID, createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {acceptOnce, validateUpload} from './field-upload-contract.mjs';
import {openEvidenceStore} from './field-evidence-store.mjs';
import {correctionRequest, correctionVersions, receiveCorrection, reviewCorrection} from './field-correction-rounds.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const staticFiles = new Map(Object.entries({
  '/': 'staging-field-transfer.html', '/staging-field-transfer.html': 'staging-field-transfer.html',
  '/staging-worker-corrections.html': 'staging-worker-corrections.html',
  '/field-correction-core.mjs': 'field-correction-core.mjs', '/field-correction-client.mjs': 'field-correction-client.mjs',
  '/staging-correction-review-local.html': 'staging-correction-review-local.html'
}));
async function bodyBytes(req, limit) {
  if (Number(req.headers['content-length']) > limit) fail(413, 'Payload too large');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, 'Payload too large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req, limit = 10000) {
  const bytes = await bodyBytes(req, limit);
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail(400, 'Invalid JSON'); }
}
function imageType(data) {
  // Signature check only: NOT full decoding, malware scanning or content inspection.
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (data.length >= 12 && data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  fail(415, 'Only JPEG, PNG or WebP photo bytes accepted');
}
export function createDemoServer(options = {}) {
  const store = openEvidenceStore(options);
  const {records, photoTokens, correctionReplies} = store;
  const evidenceUrls = (receiptId, tokens = []) => store.persistent ? tokens.map((_, i) => '/api/demo-evidence/' + receiptId + '/' + i) : [];
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const send = (status, data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };
    try {
      const local = server.address();
      const allowedHosts = new Set(['127.0.0.1:' + local.port, 'localhost:' + local.port, '[::1]:' + local.port]);
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !allowedHosts.has(req.headers.host)) fail(403, 'Local demo access only');
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host)) fail(403, 'Cross-origin access is not allowed');
      const url = new URL(req.url, 'http://' + req.headers.host);
      const path = url.pathname;
      if (req.method === 'GET' && path === '/api/demo-storage') {
        send(200, {demoOnly:true, mode:store.persistent?'local-disk':'memory-metadata', restartPersistence:store.persistent, ...store.usage()}); return;
      }
      if (req.method === 'GET' && path === '/api/demo-corrections') {
        send(200, {requests:[correctionRequest(correctionReplies)]}); return;
      }
      if (req.method === 'GET' && path === '/api/demo-correction-replies') {
        send(200, {replies:correctionVersions(correctionReplies).map(({photoToken, ...reply}) =>
          ({...reply, evidenceUrls:evidenceUrls(reply.receiptId, photoToken?[photoToken]:[])}))}); return;
      }
      if (req.method === 'POST' && path === '/api/demo-correction-review') {
        const data = await jsonBody(req);
        const result = store.transaction(() => reviewCorrection({replies:correctionReplies, data}));
        send(result.duplicate?200:201, result); return;
      }
      if (req.method === 'POST' && path === '/api/demo-correction-replies') {
        const data = await jsonBody(req);
        const result = store.transaction(() => receiveCorrection({replies:correctionReplies,
          photos:photoTokens, data, newReceipt:randomUUID}));
        // Acknowledge only AFTER the SQLite transaction has committed.
        send(result.duplicate?200:201, {...result, persistent:store.persistent}); return;
      }
      if (req.method === 'POST' && path === '/api/submissions') {
        const payload = await jsonBody(req, 50000);
        let valid; try { valid = validateUpload(payload); } catch (error) { fail(400, error.message); }
        const key = JSON.stringify([valid.workerId, valid.id]);
        const tokens = payload.photoTokens ?? [];
        const result = store.transaction(() => {
          if (!Array.isArray(tokens) || tokens.length !== valid.photos.length || tokens.some((token,i) => typeof token !== 'string' || !photoTokens.has(token) || photoTokens.get(token).type !== valid.photos[i].type || photoTokens.get(token).size !== valid.photos[i].size)) fail(400, 'Each photo requires a validated demo upload token');
          if (new Set(tokens).size !== tokens.length) fail(400, 'A photo token cannot be repeated in one submission');
          if (tokens.some(token => photoTokens.get(token).boundKey && photoTokens.get(token).boundKey !== key)) fail(409, 'Photo token already linked to another submission');
          const photoDigests = tokens.map(token => photoTokens.get(token).digest);
          const existing = records.get(key);
          if (existing && JSON.stringify(existing.photoDigests) !== JSON.stringify(photoDigests)) fail(409, 'Photo contents differ for this submission ID');
          let accepted; try { accepted = acceptOnce(existing, valid, randomUUID(), Date.now()); } catch (error) { fail(409, error.message); }
          if (!accepted.duplicate) {
            records.set(key, {...accepted.record, photoDigests, photoTokens:tokens});
            for (const token of tokens) photoTokens.set(token, {...photoTokens.get(token), boundKey:key});
          }
          return {receiptId:accepted.record.receiptId, status:'received', duplicate:accepted.duplicate, id:valid.id, persistent:store.persistent};
        });
        send(result.duplicate?200:201, result); return;
      }
      if (req.method === 'POST' && path === '/api/demo-photo') {
        const data = await bodyBytes(req, 5 * 1024 * 1024);
        const type = imageType(data), token = randomUUID();
        store.transaction(() => {
          if (photoTokens.values().length >= 100) fail(507, 'Demo photo limit reached. No files were deleted.');
          store.addPhoto(token, data);
          photoTokens.set(token, {type, size:data.length, digest:hash(data)});
        });
        send(200, {demoOnly:true, bytes:data.length, detectedType:type, photoToken:token, stored:store.persistent, storage:store.persistent?'local-disk':'memory-metadata'}); return;
      }
      if (req.method === 'GET' && path === '/api/submissions') {
        send(200, {items:records.values().map(({photoDigests, photoTokens:tokens, ...item}) => ({...item, photoCount:photoDigests.length, evidenceUrls:evidenceUrls(item.receiptId, tokens)}))}); return;
      }
      if (req.method === 'GET' && path.startsWith('/api/demo-evidence/')) {
        const match = path.match(/^\/api\/demo-evidence\/([a-f0-9-]{36})\/([0-4])$/);
        if (!match || !store.persistent) fail(404, 'Evidence unavailable');
        const receiptId = match[1], index = Number(match[2]);
        const record = records.values().find(x => x.receiptId === receiptId);
        const reply = correctionReplies.values().find(x => x.receiptId === receiptId);
        const tokens = record?.photoTokens || (reply?.photoToken ? [reply.photoToken] : []);
        const token = tokens[index];
        const metadata = token && photoTokens.get(token), data = token && store.photo(token);
        if (!metadata?.boundKey || !data) fail(404, 'Evidence unavailable');
        if (data.length !== metadata.size || hash(data) !== metadata.digest) fail(500, 'Evidence integrity check failed');
        res.writeHead(200, {'Content-Type':metadata.type, 'Content-Length':data.length, 'Content-Security-Policy':"default-src 'none'; sandbox", 'Content-Disposition':'inline'});
        res.end(data); return;
      }
      if (req.method !== 'GET') fail(405, 'Method not allowed');
      const filename = staticFiles.get(path);
      if (!filename) fail(404, 'Not found');
      const content = await readFile(resolve(root, filename));
      res.writeHead(200, {'Content-Type':filename.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8'}); res.end(content);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      send(error.status || 503, {error:error.status ? error.message : 'Demo storage unavailable. No operation is confirmed.'});
    }
  });
  server.on('close', () => store.close());
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port');
  const server = createDemoServer({storageDir:process.env.SAFI_DEMO_DATA_DIR});
  server.listen(port, '127.0.0.1', () => console.log('SAFI LOCAL DEMO: http://127.0.0.1:' + port + ' | Storage: ' + (process.env.SAFI_DEMO_DATA_DIR?'local disk, unencrypted':'memory only')));
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => server.close());
}

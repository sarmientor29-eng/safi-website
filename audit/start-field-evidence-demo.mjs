/** Explicit opt-in launcher. Creates local demo storage only when run. */
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createDemoServer} from './field-demo-server.mjs';
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port');
const storageDir = process.env.SAFI_DEMO_DATA_DIR || join(homedir(), '.safi-local-demo', 'evidence');
const server = createDemoServer({storageDir});
server.on('error', error => { console.error('Local demo failed:', error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log('SAFI LOCAL TEST ONLY - no authentication, encryption or cloud backup.');
  console.log('Use synthetic photos and fictional data only. Never expose to a network.');
  console.log('Storage directory:', storageDir);
  console.log('Worker: http://127.0.0.1:' + port + '/staging-worker-corrections.html');
  console.log('Review: http://127.0.0.1:' + port + '/staging-correction-review-local.html');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());

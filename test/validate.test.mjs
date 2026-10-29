// Self-test: a locally served org signs a report; the validator must accept it, and reject tampering.
import { generateKeyPairSync, sign } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const jcs = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(jcs).join(',')}]`
  : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`;

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const x = publicKey.export({ format: 'jwk' }).x;
const server = createServer((req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(doc)));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const org = `localhost:${server.address().port}`;
const doc = { intertie: '0.1', org, endpoint: `http://${org}/intertie`, keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x }] };

function registry(entryPatch = {}, reportPatch = {}, { tamper = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'reg-'));
  mkdirSync(join(dir, 'reports'));
  const report = {
    intertie_report: '0.1', subject: { org, endpoint: doc.endpoint }, runner: { name: '@intertie/conformance', version: '0.1.0' },
    date: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), claim: { roles: ['home'], levels: ['core', 'threads'] },
    results: [{ id: 'core.accept', level: 'core', role: 'home', pass: true, detail: 'ok' }], passed: true, ...reportPatch,
  };
  const sig = sign(null, Buffer.from(jcs(report)), privateKey).toString('base64url');
  const signed = { ...report, ...(tamper ? { passed: true, claim: { roles: ['home'], levels: ['core', 'threads', 'files'] } } : {}), signature: { keyid: `${org}#k1`, alg: 'ed25519', sig } };
  writeFileSync(join(dir, 'reports', 'acme.json'), JSON.stringify(signed));
  writeFileSync(join(dir, 'implementations.json'), JSON.stringify([{ name: 'Acme Chat', vendor: 'Acme', url: 'https://acme.example', org, kind: 'native', roles: ['home'], levels: ['core'], protocol: '0.1', date: '2026-10-29', report: 'reports/acme.json', ...entryPatch }]));
  return dir;
}
// Async: the discovery server runs in this process and must keep serving.
const run = (dir) => new Promise((resolve) => execFile(process.execPath, [new URL('../scripts/validate.mjs', import.meta.url).pathname, '--dev-insecure'],
  { env: { ...process.env, REGISTRY_ROOT: dir } }, (e, _out, stderr) => resolve(e ? { code: e.code, out: stderr } : 0)));
const cases = [
  ['valid entry', registry(), 0],
  ['tampered report', registry({}, {}, { tamper: true }), 1],
  ['entry overclaims a level', registry({ levels: ['core', 'files'] }), 1],
  ['report did not pass', registry({}, { passed: false }), 1],
  ['subject mismatch', registry({}, { subject: { org: 'other.example', endpoint: 'x' } }), 1],
  ['bad entry field', registry({ color: 'blue' }), 1],
];
let failed = 0;
for (const [name, dir, want] of cases) {
  const got = await run(dir);
  const code = got === 0 ? 0 : got.code;
  const ok = code === want;
  if (!ok) failed++;
  console.log(`${ok ? '✔' : '✖'} ${name}${ok ? '' : ` (exit ${code}, wanted ${want}) ${got.out ?? ''}`}`);
}
server.close();
process.exit(failed ? 1 : 0);

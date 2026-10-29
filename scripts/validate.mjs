#!/usr/bin/env node
// Validates implementations.json and every signed conformance report it points to.
// Zero dependencies (Node >= 22). Run in CI on every pull request:
//   node scripts/validate.mjs [--dev-insecure] [--offline]
// --offline skips fetching discovery documents (signature not verified; CI never uses it).
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev-insecure');
const offline = args.has('--offline');
const root = process.env.REGISTRY_ROOT ? pathToFileURL(process.env.REGISTRY_ROOT.replace(/\/?$/, '/')) : new URL('..', import.meta.url);
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const ROLES = new Set(['home', 'peer-push', 'peer-pull']);
const LEVELS = new Set(['core', 'security', 'threads', 'reactions', 'files', 'mentions', 'members']);
const KINDS = new Set(['native', 'adapter', 'library']);
const DNS = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DEV_ORG = /^localhost:\d{1,5}$/;

/** RFC 8785 canonical JSON (the subset reports use: no floats). */
export function jcs(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jcs).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`;
}

async function discovery(org) {
  const url = `${dev && DEV_ORG.test(org) ? 'http' : 'https'}://${org}/.well-known/intertie`;
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const doc = await res.json();
  if (doc.org !== org) throw new Error(`${url}: org field is ${JSON.stringify(doc.org)}`);
  return doc;
}

function checkEntry(e, i) {
  const w = `implementations.json[${i}]${e?.name ? ` (${e.name})` : ''}`;
  const allowed = new Set(['name', 'vendor', 'url', 'org', 'kind', 'roles', 'levels', 'protocol', 'date', 'report', 'license']);
  if (!e || typeof e !== 'object') return err(w, 'not an object');
  for (const k of Object.keys(e)) if (!allowed.has(k)) err(w, `unknown field ${k}`);
  for (const k of ['name', 'vendor', 'url', 'org', 'date', 'report']) if (typeof e[k] !== 'string' || !e[k]) err(w, `missing ${k}`);
  if (typeof e.name === 'string' && e.name.length > 80) err(w, 'name over 80 chars');
  if (typeof e.url === 'string' && !e.url.startsWith('https://')) err(w, 'url must be https');
  if (typeof e.org === 'string' && !(DNS.test(e.org) || (dev && DEV_ORG.test(e.org)))) err(w, `org ${e.org} is not a DNS name`);
  if (e.kind !== undefined && !KINDS.has(e.kind)) err(w, `kind must be one of ${[...KINDS]}`);
  if (!Array.isArray(e.roles) || !e.roles.length || !e.roles.every((r) => ROLES.has(r))) err(w, `roles must be from ${[...ROLES]}`);
  if (!Array.isArray(e.levels) || !e.levels.includes('core') || !e.levels.every((l) => LEVELS.has(l))) err(w, `levels must include core and be from ${[...LEVELS]}`);
  if (e.protocol !== undefined && e.protocol !== '0.1') err(w, 'protocol must be 0.1');
  if (typeof e.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) err(w, 'date must be YYYY-MM-DD');
  if (typeof e.report === 'string' && !/^reports\/[a-z0-9-]+\.json$/.test(e.report)) err(w, 'report must be reports/<slug>.json');
}

async function checkReport(e, i) {
  const w = `${e.report}`;
  let r;
  try { r = JSON.parse(readFileSync(new URL(e.report, root), 'utf8')); } catch (x) { return err(w, `unreadable: ${x.message}`); }
  if (r.intertie_report !== '0.1') err(w, 'intertie_report must be 0.1');
  if (r.subject?.org !== e.org) err(w, `subject.org ${r.subject?.org} does not match entry org ${e.org}`);
  if (r.passed !== true) err(w, 'report did not pass');
  if (!Array.isArray(r.results) || !r.results.length) err(w, 'no results');
  for (const l of e.levels ?? []) if (!r.claim?.levels?.includes(l)) err(w, `entry claims level ${l}, report does not`);
  for (const role of e.roles ?? []) if (!r.claim?.roles?.includes(role)) err(w, `entry claims role ${role}, report does not`);
  const age = (Date.now() - Date.parse(r.date)) / 86_400_000;
  if (!(age >= -1 && age <= 400)) err(w, `report date ${r.date} is not within the last ~13 months`);
  const sig = r.signature;
  if (!sig || sig.alg !== 'ed25519' || typeof sig.keyid !== 'string' || typeof sig.sig !== 'string') return err(w, 'missing or malformed signature');
  const at = sig.keyid.lastIndexOf('#');
  const org = sig.keyid.slice(0, at), kid = sig.keyid.slice(at + 1);
  if (org !== e.org) err(w, `signed by ${org}, not ${e.org}`);
  if (offline) return;
  let doc;
  try { doc = await discovery(org); } catch (x) { return err(w, `cannot fetch discovery: ${x.message}`); }
  const jwk = (doc.keys ?? []).find((k) => k.kid === kid);
  if (!jwk) return err(w, `key ${sig.keyid} is not published at ${org}`);
  const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
  const { signature, ...body } = r;
  if (!verify(null, Buffer.from(jcs(body), 'utf8'), key, Buffer.from(sig.sig, 'base64url'))) err(w, 'signature does not verify');
  void i;
}

const list = JSON.parse(readFileSync(new URL('implementations.json', root), 'utf8'));
if (!Array.isArray(list)) err('implementations.json', 'must be an array');
else {
  list.forEach(checkEntry);
  const names = list.map((e) => `${e.vendor}/${e.name}`.toLowerCase());
  names.forEach((n, i) => { if (names.indexOf(n) !== i) err(`implementations.json[${i}]`, `duplicate ${n}`); });
  for (const [i, e] of list.entries()) if (typeof e?.report === 'string') await checkReport(e, i);
}
const digest = createHash('sha256').update(readFileSync(new URL('implementations.json', root))).digest('hex').slice(0, 12);
if (errors.length) {
  console.error(`✖ ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`✔ ${list.length} entr${list.length === 1 ? 'y' : 'ies'} valid${offline ? ' (offline: signatures not checked)' : ''} · implementations.json ${digest}`);

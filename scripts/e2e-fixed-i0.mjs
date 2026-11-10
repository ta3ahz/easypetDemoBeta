// E2E for the per-device "fixed I0" calibration switch, against a RESTORED COPY of the
// live data in an in-memory MongoDB, served by the real production build (`next start`).
// Never touches the live DB. Run `npm run build` first.
// The switch is backend-only: firmware is unchanged and unaware of it.
// Usage: node scripts/e2e-fixed-i0.mjs <backendDir> <backupDbDir>   (KEEP=1 keeps the server up)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs'; import path from 'path';

const [backendDir, dumpDir] = process.argv.slice(2);
const require = createRequire(path.join(backendDir, 'package.json'));
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = 3998, BASE = `http://127.0.0.1:${PORT}`, SECRET = 'e2e-only-secret';
const TEST_EMAIL = 'e2e-admin@copy.local', TEST_PASS = 'e2e-pass-123';
let pass = 0, fail = 0;
const ok = (c, msg, ...ctx) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${msg}`, ...(c ? [] : ctx)); };
const near = (x, y) => typeof x === 'number' && Math.abs(x - y) < 1e-9;

// ---- restored copy ----
const mem = await MongoMemoryServer.create();
const uri = mem.getUri('easypet');
const cli = new MongoClient(uri); await cli.connect(); const db = cli.db('easypet');
const man = JSON.parse(fs.readFileSync(path.join(dumpDir, 'manifest.json')));
for (const name of Object.keys(man.collections)) {
  for (const ix of JSON.parse(fs.readFileSync(path.join(dumpDir, `${name}.indexes.json`)))) {
    if (ix.name === '_id_') continue; const { key, name: n, v, ns, ...o } = ix;
    await db.collection(name).createIndex(key, { name: n, ...o });
  }
  const docs = EJSON.parse(fs.readFileSync(path.join(dumpDir, `${name}.ejson`), 'utf8'), { relaxed: false });
  if (docs.length) await db.collection(name).insertMany(docs);
}
await db.collection('admins').insertOne({ email: TEST_EMAIL, passwordHash: await bcrypt.hash(TEST_PASS, 10), name: 'E2E', createdAt: new Date(), updatedAt: new Date() });
console.log('restored copy:', Object.entries(man.collections).map(([k, v]) => `${k}=${v.exported}`).join(' '));

// ---- production build on the copy ----
const srv = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: backendDir, env: { ...process.env, MONGODB_URI: uri, JWT_SECRET: SECRET, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = ''; srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
const cleanup = async () => { srv.kill('SIGTERM'); await cli.close(); await mem.stop(); };
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const call = async (method, p, { token, body } = {}) => {
  const r = await fetch(BASE + p, { method, redirect: 'manual', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, j, t };
};

try {
  // SAFETY: the test admin exists only in the copy. If login fails we are NOT on the copy -> abort.
  const login = await call('POST', '/api/admin/login', { body: { email: TEST_EMAIL, password: TEST_PASS } });
  if (login.s !== 200) { console.log('ABORT: not running on the restored copy', login.s, login.t); await cleanup(); process.exit(2); }
  const A = login.j.token;

  // a real (old) device doc from the copy: no config.fixedI0 field stored
  const raw0 = await db.collection('devices').findOne({ status: 'active', credits: { $gt: 5 } }) ?? await db.collection('devices').findOne({});
  await db.collection('devices').updateOne({ _id: raw0._id }, { $set: { credits: 50, status: 'active' } });
  const devId = String(raw0._id);
  const D = jwt.sign({ kind: 'device', sub: devId, uid: raw0.uid }, SECRET, { expiresIn: '1h' });
  const cfg0 = raw0.config ?? {};
  console.log(`device ${raw0.uid}  stored config: ${JSON.stringify(cfg0)}`);
  const A_ = cfg0.a ?? 1, B_ = cfg0.b ?? 0, TH = cfg0.ths ?? 1;
  const conc = (i0, raw) => Math.log10(i0 / raw) * A_ + B_;
  const lastTest = () => db.collection('tests').findOne({ device: raw0._id }, { sort: { _id: -1 } });

  console.log('\nold device doc (no fixedI0 stored)');
  ok(!('fixedI0' in cfg0), 'copy device has no fixedI0 field');
  let r = await call('GET', '/api/device/sync', { token: D });
  ok(r.s === 200 && r.j.device.config.fixedI0 === false, 'sync reports config.fixedI0 = false by default', r.s, r.j?.device?.config);

  console.log('\nblank mode (default) — unchanged behaviour');
  const credits0 = (await db.collection('devices').findOne({ _id: raw0._id })).credits;
  r = await call('POST', '/api/device/tests', { token: D, body: { raw: 9000, i0: 10000, temp: 16.2, clientId: 'fx-1' } });
  let t = await lastTest();
  ok(r.s === 200 && near(r.j.concentration, conc(10000, 9000)), 'result uses the measured blank (10000)', r.s, r.j);
  ok(t.i0 === 10000 && t.i0Used === 10000 && t.i0Fixed === false, 'stored i0=10000 i0Used=10000 i0Fixed=false', t);
  ok(r.j.credits === credits0 - 1, 'one credit consumed');

  console.log('\nadmin turns fixed I0 on (i0=12000)');
  r = await call('PATCH', `/api/admin/devices/${devId}`, { token: A, body: { config: { i0: 12000, a: A_, b: B_, ths: TH, fixedI0: true } } });
  ok(r.s === 200, 'PATCH config fixedI0=true', r.s, r.t);
  r = await call('GET', '/api/device/sync', { token: D });
  ok(r.j.device.config.fixedI0 === true && r.j.device.config.i0 === 12000, 'sync now reports fixedI0=true, i0=12000', r.j?.device?.config);

  console.log('\nold firmware upload (no i0Fixed) while fixed I0 is on');
  r = await call('POST', '/api/device/tests', { token: D, body: { raw: 9000, i0: 10000, clientId: 'fx-2' } });
  t = await lastTest();
  ok(near(r.j.concentration, conc(12000, 9000)), 'result uses the fixed i0 (12000), not the blank', r.j);
  ok(r.j.positive === conc(12000, 9000) > TH, 'positive follows the fixed-i0 concentration');
  ok(t.i0 === 10000 && t.i0Used === 12000 && t.i0Fixed === true, 'blank still recorded (10000), i0Used=12000, i0Fixed=true', t);

  console.log('\noffline re-upload (old fw) while fixed I0 is on; stray body fields ignored');
  r = await call('POST', '/api/device/tests', { token: D, body: { raw: 9000, i0: 10000, i0Fixed: 11000, result: { positive: true }, clientId: 'fx-3' } });
  t = await lastTest();
  ok(near(r.j.concentration, conc(12000, 9000)) && t.i0Used === 12000 && t.i0Fixed === true, 'backend switch decides (12000); device-sent extras ignored', r.j, t);
  ok(r.j.positive === conc(12000, 9000) > TH, "device's own positive is overridden by the fixed-i0 result");

  console.log('\nconfig edits keep the switch');
  r = await call('PATCH', `/api/admin/devices/${devId}`, { token: A, body: { config: { i0: 12000, a: A_, b: B_, ths: TH } } });
  let d = await db.collection('devices').findOne({ _id: raw0._id });
  ok(r.s === 200 && d.config.fixedI0 === true, 'PATCH without fixedI0 (older admin app) keeps it on', r.s, d.config);
  r = await call('POST', '/api/device/calibrate', { token: D, body: { i0: 13000, a: A_, b: B_ } });
  d = await db.collection('devices').findOne({ _id: raw0._id });
  ok(r.s === 200 && d.config.fixedI0 === true && d.config.i0 === 13000, 'on-device calibration updates i0, keeps fixedI0', r.s, d.config);
  r = await call('PATCH', `/api/admin/devices/${devId}`, { token: A, body: { config: { i0: 12000, a: A_, b: B_, ths: TH, fixedI0: 'yes' } } });
  ok(r.s === 400, 'fixedI0 non-boolean -> 400', r.s);

  console.log('\nswitch off again');
  r = await call('PATCH', `/api/admin/devices/${devId}`, { token: A, body: { config: { i0: 12000, a: A_, b: B_, ths: TH, fixedI0: false } } });
  r = await call('POST', '/api/device/tests', { token: D, body: { raw: 9000, i0: 10000, clientId: 'fx-4' } });
  t = await lastTest();
  ok(near(r.j.concentration, conc(10000, 9000)) && t.i0Fixed === false && t.i0Used === 10000, 'back to the measured blank', r.j, t);
  r = await call('POST', '/api/device/tests', { token: D, body: { raw: 9000, clientId: 'fx-5' } });
  t = await lastTest();
  ok(near(r.j.concentration, conc(12000, 9000)) && t.i0Used === 12000 && t.i0Fixed === true, 'no blank sent -> stored i0 (old fallback), flagged fixed', r.j, t);

  console.log('\nvalidation / idempotency');
  r = await call('POST', '/api/device/tests', { token: D, body: { raw: -1, i0: 10000, clientId: 'fx-6' } });
  ok(r.s === 400, 'invalid raw still -> 400', r.s);
  const before = (await db.collection('devices').findOne({ _id: raw0._id })).credits;
  r = await call('POST', '/api/device/tests', { token: D, body: { raw: 9000, i0: 10000, clientId: 'fx-3' } });
  const after = (await db.collection('devices').findOne({ _id: raw0._id })).credits;
  ok(r.j.duplicate === true && after === before && near(r.j.concentration, conc(12000, 9000)), 're-upload of fx-3 is a duplicate, no charge', r.j);

  console.log('\nadmin views');
  r = await call('GET', '/api/admin/measurements?limit=200', { token: A });
  const rows = r.j.tests;
  const fx2 = rows.find((x) => x.i0Used === 12000 && x.i0 === 10000 && x.i0Fixed === true);
  const old = rows.find((x) => x.i0Used === null);
  ok(r.s === 200 && !!fx2, 'measurements API exposes i0Used / i0Fixed');
  ok(!!old && old.i0Fixed === false, 'old (pre-change) tests: i0Used=null, i0Fixed=false');
  r = await call('GET', '/api/admin/measurements/export', { token: A });
  const lines = r.t.split('\n');
  ok(lines[0].endsWith(',result,i0Used,i0Mode'), 'CSV header ends with i0Used,i0Mode', lines[0]);
  const cols = lines[0].split(',').length;
  ok(lines.slice(1).every((l) => l.split(',').length >= cols), 'every CSV row has all columns');
  ok(lines.some((l) => l.endsWith(',12000,fixed')) && lines.some((l) => l.endsWith(',10000,blank')) && lines.some((l) => l.endsWith(',,')), 'CSV rows: fixed / blank / old (empty)');

  const errs = srvLog.split('\n').filter((l) => /error|unhandled/i.test(l));
  ok(errs.length === 0, 'no server errors logged', errs.slice(0, 5));
} catch (e) {
  fail++; console.log('  ✗ exception', e);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (process.env.KEEP) {
  console.log(`server up at ${BASE} (admin ${TEST_EMAIL}); Ctrl-C to stop`);
  process.on('SIGINT', async () => { await cleanup(); process.exit(fail ? 1 : 0); });
  process.on('SIGTERM', async () => { await cleanup(); process.exit(fail ? 1 : 0); });
} else {
  await cleanup();
  process.exit(fail ? 1 : 0);
}
